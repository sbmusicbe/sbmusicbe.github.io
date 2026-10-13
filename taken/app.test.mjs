import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

// Run the production model, persistence and sync functions with an in-memory cloud.
// No account, network access or browser storage is needed.
const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function runtime() {
  const ctx = vm.createContext({crypto:webcrypto, TextEncoder, TextDecoder, Uint8Array,
    btoa, atob, console:{error() {}}, structuredClone, navigator:{onLine:true}});
  vm.runInContext(`
    ${section("const VAULT =", 'const I =')}
    ${section('const uid =', 'function dueLabel(')}
    const te = new TextEncoder();
    ${section('function b64(', 'const gzipBytes =')}
    ${section('const REC_ITER =', '/* Kluis op het toestel:')}
    let K = null, data = null, local = null, remote = null, cloudRev = null;
    let syncEtag = null, syncDirty = true, syncing = false, syncAgain = false;
    let uploads = 0, failUpload = false, beforeAck = null;
    const NOT_MODIFIED = {};
    const feat = k => data.settings.features?.[k] !== false;
    const cloudSplit = false;
    const cloudToken = async () => ({userId:'test', token:'test'});
    const conflictError = () => Object.assign(new Error('conflict'), {conflict:true});
    const sb = async (path, o) => {
      if (failUpload) throw new Error('offline');
      if (o.method === 'PATCH' && !path.endsWith('&rev=eq.' + remote.rev)) throw conflictError();
      remote = {rev:o.body.rev, blob:JSON.parse(o.body.blob)};
      uploads++;
      if (beforeAck) { const f = beforeAck; beforeAck = null; await f(); }
      return [{rev:remote.rev}];
    };
    const seal = async (k, d) => ({salt:b64(k.salt), w:k.w, payload:structuredClone(d)});
    const storeVault = async b => { local = structuredClone(b); };
    const toast = () => {}, renderAll = () => {}, renderSync = () => {}, setSync = () => {}, scheduleSync = () => {};
    const unsealRemote = async (k, b) => structuredClone(b.payload);
    ${section('const DEFAULT_FIELDS =', 'const proj =')}
    ${section('let persistChain =', 'let saveTimer =')}
    ${section('async function cloudPut(', 'const unsealRemote =')}
    const remotePut = cloudPut;
    const persistRemote = persist;
    const remoteGet = async (s, meta) => {
      cloudRev = remote?.rev ?? null;
      meta.etag = String(cloudRev);
      if (remote && meta.ifNoneMatch === meta.etag) return NOT_MODIFIED;
      return remote ? structuredClone(remote.blob) : null;
    };
    ${section('async function syncNow(', 'function setSync(')}
    async function setup() {
      K = (await newEnvelope('old-password')).K;
      data = newData(); data.settings.sync = {cloud:true, email:'test@example.com'};
      await persist(); remote = {rev:1, blob:await seal(K, data)}; cloudRev = 1;
    }
  `, ctx);
  return code => vm.runInContext(code.includes('await ') ? `(async () => {${code}})()` : code, ctx);
}

test('remote-only settings and preferences are adopted and persisted', async () => {
  const run = runtime(); await run('setup()');
  await run(`remote.blob.payload.settings.autolock = 60;
    remote.blob.payload.prefs = {all:{sort:'title'}};
    remote.blob.payload.updatedAt = data.updatedAt + 1; remote.rev++;
    syncNow()`);
  assert.equal(run('data.settings.autolock'), 60);
  assert.equal(run('local.payload.prefs.all.sort'), 'title');
  assert.equal(run('uploads'), 0);
});

test('local-only settings are uploaded when the cloud revision changed', async () => {
  const run = runtime(); await run('setup()');
  await run('data.settings.autolock = 30; data.updatedAt += 1; remote.rev++; syncNow()');
  assert.equal(run('remote.blob.payload.settings.autolock'), 30);
  assert.equal(run('uploads'), 1);
});

test('tombstone timestamp changes participate in synchronization', () => {
  const run = runtime();
  assert.equal(run(`(()=>{const a=newData(), b=structuredClone(a);
    a.deleted.test=1; b.deleted.test=2; return sig(a)!==sig(b);})()`), true);
});

test('password wrap survives a conflict and opens with the new password', async () => {
  const run = runtime(); await run('setup()');
  await run("setKeyWrap('pw', await wrapRaw(K.raw, 'new-password', ITER)); await persist()");
  await assert.rejects(run('remote.rev++; return cloudPut(data.settings.sync, await persist())'), /conflict/);
  await run('syncNow()');
  assert.equal(await run("return b64(await unwrapRaw(remote.blob.w.pw, 'new-password')) === b64(K.raw)"), true);
  await assert.rejects(run("unwrapRaw(remote.blob.w.pw, 'old-password')"));
  assert.equal(run('K.pendingW'), undefined);
  assert.equal(run('local.pendingW'), undefined);
  assert.equal(run('remote.blob.pendingW'), undefined);
});

test('unconfirmed password change survives offline storage and reopening', async () => {
  const run = runtime(); await run('setup()');
  await run("setKeyWrap('pw', await wrapRaw(K.raw, 'new-password', ITER)); await persist()");
  await run("failUpload=true; await syncNow(); K = await openKey('new-password', local)");
  assert.equal(run('!!K.pendingW.pw'), true);
  await run('failUpload=false; syncNow()');
  assert.equal(await run("return b64(await unwrapRaw(remote.blob.w.pw, 'new-password')) === b64(K.raw)"), true);
});

test('recovery change preserves an independently changed online password wrap', async () => {
  const run = runtime(); await run('setup()');
  await run(`remote.blob.w.pw = await wrapRaw(K.raw, 'remote-password', ITER);
    setKeyWrap('rec', await wrapRaw(K.raw, 'NEWRECOVERY', REC_ITER)); await syncNow()`);
  assert.equal(await run("return b64(await unwrapRaw(remote.blob.w.pw, 'remote-password')) === b64(K.raw)"), true);
  assert.equal(await run("return b64(await unwrapRaw(remote.blob.w.rec, 'NEWRECOVERY')) === b64(K.raw)"), true);
});

test('a newer wrap created during an upload remains pending', async () => {
  const run = runtime(); await run('setup()');
  await run(`setKeyWrap('pw', await wrapRaw(K.raw, 'first-password', ITER));
    beforeAck = async () => setKeyWrap('pw', await wrapRaw(K.raw, 'second-password', ITER));
    await cloudPut(data.settings.sync, await persist())`);
  assert.equal(run('!!K.pendingW.pw'), true);
  await run('syncNow()');
  assert.equal(await run("return b64(await unwrapRaw(remote.blob.w.pw, 'second-password')) === b64(K.raw)"), true);
});

test('ordinary synchronization adopts remote wraps after acknowledgement', async () => {
  const run = runtime(); await run('setup()');
  await run("remote.blob.w.pw = await wrapRaw(K.raw, 'remote-password', ITER); await syncNow()");
  assert.equal(await run("return b64(await unwrapRaw(K.w.pw, 'remote-password')) === b64(K.raw)"), true);
  assert.equal(run('uploads'), 0);
});

test('Belgian money input accepts grouping, decimals, currency and spaces', () => {
  const ctx = vm.createContext({});
  vm.runInContext(section('function parseNl(', '// nog te verkopen') + section('const toNum =', 'function easter('), ctx);
  for (const [input, expected] of [['1.234,56',1234.56], ['1.234',1234], ['€ 1 234,56',1234.56], ['12.50',12.5], ['-1.234,56',-1234.56], ['',null], ['abc',null], ['Infinity',null]]) {
    assert.equal(vm.runInContext(`toNum(${JSON.stringify(input)})`, ctx), expected, input);
  }
});

test('hidden sales checkbox preserves stage flags; visible checkbox still applies', () => {
  const read = section('  const read = d =>', '  const draw =');
  const ctx = vm.createContext({});
  vm.runInContext(`const draft=[{positive:true,done:true}]; let checkbox=null,done=true;
    const $$=()=>[{}]; const $=q=>q==='input[type=text]'?{value:'Gewonnen'}:q==='input[type=checkbox]'?{checked:done}:checkbox;
    ${read}`,ctx);
  vm.runInContext('read({})',ctx); assert.equal(vm.runInContext('draft[0].positive',ctx),true);
  vm.runInContext('checkbox={checked:false};read({})',ctx); assert.equal(vm.runInContext('draft[0].positive',ctx),false);
  vm.runInContext('checkbox={checked:true};read({})',ctx); assert.equal(vm.runInContext('draft[0].positive',ctx),true);
  vm.runInContext('done=false;checkbox=null;read({})',ctx); assert.equal(vm.runInContext('draft[0].positive',ctx),false);
});

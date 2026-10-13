'use strict';
/* =========================================================
   Klose — persoonlijke dealslijst
   Alle gegevens worden lokaal versleuteld (AES-256-GCM, sleutel
   afgeleid van je wachtwoord met PBKDF2-SHA256). Met een account
   (zie cloud.json) synchroniseert de versleutelde kluis tussen toestellen.
   ========================================================= */

const VAULT = 'taken.vault.v1';
const ITER = 310000;
const COLORS = ['#111318','#FF4B1F','#1E5BC6','#4D5059','#7A7667','#C2380F'];
const TYPES = {text:'Tekst',number:'Getal',date:'Datum',select:'Keuzelijst',multiselect:'Meerdere keuzes',checkbox:'Vinkje',url:'Link'};
const DAYS = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
const DAYS_SHORT = ['zo','ma','di','wo','do','vr','za'];
const MONTHS = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
// Kanban-kolommen (standaard). Kaarten in een kolom met done:true gelden als afgewerkt.
// De kolommen zelf staan in data.stages en zijn aan te passen via "Kolommen".
const DEFAULT_STAGES = [
  {id:'callback', label:'Terugbellen', color:'#FF4B1F', done:false, order:0},
  {id:'mail', label:'Offerte', color:'#4D5059', done:false, order:1},
  {id:'positive', label:'Gewonnen', color:'#1E5BC6', done:true, positive:true, order:2},
  {id:'negative', label:'Verloren', color:'#111318', done:true, order:3},
];
// vroegere standaardstappen (groen tegenover rood is niet toegankelijk): alleen omzetten als de gebruiker ze niet aanpaste
const OLD_STAGES = {callback:['Terugbellen', '#eb8909'], mail:['Antwoord op mail', '#246fe0'], positive:['Positief', '#3aa655'], negative:['Negatief', '#d1453b']};
// extra sneltoetsen voor snel toevoegen, naast @<kolomnaam>
const STAGE_ALIASES = {callback:['bellen'], mail:['mail', 'offerte'], positive:['gewonnen', 'positief'], negative:['verloren', 'negatief']};
const sortStages = list => [...list].sort((a, b) => (a.order || 0) - (b.order || 0));
const stages = () => sortStages(data.stages);
// Verkopen: maandpagina's met een tabel. De kolommen gelden voor alle pagina's.
const DEFAULT_SALES_COLS = [
  {id:'sc_date', name:'Datum', type:'date', order:0},
  {id:'sc_client', name:'Klant', type:'text', order:1},
  {id:'sc_desc', name:'Omschrijving', type:'text', order:2},
  {id:'sc_amount', name:'Bedrag', type:'money', order:3},
];
const SALES_TYPES = {text:'Tekst', number:'Getal', money:'Bedrag (€)', date:'Datum', format:'Formaat (keuze)'};
// Vaste formaten voor de kolom Formaat; meerdere mogelijk, opgeslagen als "1/16, Vergroting".
const FORMATS = ['1/1', '1/2', '1/4', '1/8', '1/12', '1/16', '1/32', 'Banner', 'Vergroting', 'Annulatie'];
const FORMAT_RX = [
  [/(^|[^\d/])1\s*\/\s*(32|16|12|8|4|2|1)(?![\d/])/gi, m => '1/' + m[2]],
  [/\b(?:volle|hele|full)\s*(?:pagina|page|p)\b/gi, () => '1/1'],
  [/\bhalve\s*(?:pagina|page|p)\b/gi, () => '1/2'],
  [/\bkwart(?:\s*(?:pagina|page|p))?\b/gi, () => '1/4'],
  [/\w*banner\w*/gi, () => 'Banner'],
  [/\bvergrot\w*/gi, () => 'Vergroting'],
  [/\bannul\w*/gi, () => 'Annulatie'],
];
// Zet vrij getypte tekst om naar de vaste formaten; wat niet herkend wordt, komt in `rest`.
function parseFormats(v) {
  let s = String(v ?? '');
  const got = new Set();
  for (const [re, f] of FORMAT_RX) s = s.replace(re, (...m) => { got.add(f(m)); return re === FORMAT_RX[0][0] ? m[1] + ' ' : ' '; });
  const rest = s.replace(/[+,;&]|\ben\b|\b\d+\s*x\b|\b(?:pagina|page)\b/gi, ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return {opts:FORMATS.filter(o => got.has(o)), rest:/[a-z0-9]/i.test(rest) ? rest : ''};
}
const formatList = v => parseFormats(v).opts;
// Zet een tekstkolom om naar een keuzekolom; onherkende tekst gaat naar de opmerkingkolom.
function convertFormatCol(d, c) {
  const note = (d.salesCols || []).find(x => x.id !== c.id && x.type === 'text' && /opmerking|omschrijving|notitie/i.test(x.name));
  for (const r of d.sales || []) {
    const v = r.values?.[c.id]; if (v === undefined || v === '') continue;
    const {opts, rest} = parseFormats(v), nv = opts.join(', ');
    if (nv === v && !rest) continue;
    if (nv) r.values[c.id] = nv; else delete r.values[c.id];
    if (rest && note) r.values[note.id] = [r.values[note.id], rest].filter(Boolean).join(' · ');
    else if (rest && !nv) r.values[c.id] = v;
    r.u = Date.now();
  }
}
const MONTHS_LONG = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const firstOpen = () => stages().find(s => !s.done);
const firstDone = () => stages().find(s => s.done);
const stageById = id => data.stages.find(s => s.id === id) || firstOpen();
const isDoneStage = id => !!data.stages.find(s => s.id === id)?.done;

const I = {
  today:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  expand:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  shrink:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
  comment:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1121 12z"/></svg>',
 btw:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="17" r="2.4"/></svg>',
 agenda:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12.5 13.5h3.5v3.5h-3.5z" fill="currentColor" stroke="none"/></svg>',
  all:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></svg>',
  sales:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 5-6"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-5 4 4 3-3 4 4"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
};

/* ---------------- Utilities ---------------- */
const $ = (s, r = document) => r.querySelector(s);
// Hertekenen met exact dezelfde inhoud slaan we over: geen nieuwe opmaak- en tekenronde (en focus/scroll blijven staan)
{
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  for (const id of ['list', 'nav', 'projNav', 'salesNav', 'toolNav', 'viewTitle', 'toolbar']) {
    const el = document.getElementById(id); if (!el) continue;
    let lastIn = null, lastOut = null;
    Object.defineProperty(el, 'innerHTML', {configurable:true, get() { return d.get.call(this); }, set(v) {
      if (v === lastIn && d.get.call(this) === lastOut) return;
      d.set.call(this, v); lastIn = v; lastOut = d.get.call(this);
    }});
  }
}
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uid = () => crypto.randomUUID ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2,'0')).join('');
const now = () => Date.now();
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate()+n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function dueLabel(s) {
  const diff = daysBetween(today(), s);
  if (diff === 0) return 'Vandaag';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gisteren';
  const d = parseYmd(s);
  if (diff > 1 && diff < 7) return cap(DAYS[d.getDay()]);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}` + (d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '');
}
/* ---------------- Crypto ---------------- */
const te = new TextEncoder(), td = new TextDecoder();
function b64(buf) {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
async function deriveKey(pw, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:iter, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
const gzipBytes = async (bytes, back) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(back ? new DecompressionStream('gzip') : new CompressionStream('gzip'))).arrayBuffer());
/* ---- Werkthread: samendrukken, versleutelen en ontsleutelen gebeuren buiten de hoofdthread,
   zodat de pagina niet vastloopt bij tienduizenden klanten. Zonder werkthread draait alles gewoon op de hoofdthread. ---- */
const WK_SRC = 'const gz=async(b,d)=>new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(d?new DecompressionStream("gzip"):new CompressionStream("gzip"))).arrayBuffer());'
  + 'const b64=u=>{let s="";for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)};'
  + 'const unb64=s=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};'
  + 'onmessage=async e=>{const m=e.data;try{'
  + 'if(m.op==="seal"){let n=0;for(const p of m.parts)n+=p.length;let pt=new Uint8Array(n),o=0;for(const p of m.parts){pt.set(p,o);o+=p.length}if(m.zip)pt=await gz(pt,false);'
  + 'const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:m.iv},m.key,pt));postMessage({id:m.id,ct:b64(ct)})}'
  + 'else{let pt=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(m.iv)},m.key,unb64(m.ct)));if(m.zip)pt=await gz(pt,true);postMessage({id:m.id,text:new TextDecoder().decode(pt)})}'
  + '}catch(err){postMessage({id:m.id,err:String(err&&err.message||err)})}};';
let wk = null, wkSeq = 0, wkBroken = false;
const wkWait = new Map();
function wkCall(msg) {
  if (wkBroken || !window.Worker || !window.Blob || !URL.createObjectURL) return Promise.reject(new Error('geen werkthread'));
  try {
    if (!wk) {
      wk = new Worker(URL.createObjectURL(new Blob([WK_SRC], {type:'text/javascript'})));
      wk.onmessage = e => { const w = wkWait.get(e.data.id); if (!w) return; wkWait.delete(e.data.id); e.data.err ? w[1](new Error(e.data.err)) : w[0](e.data); };
      wk.onerror = () => { wkBroken = true; for (const w of wkWait.values()) w[1](new Error('werkthread gestopt')); wkWait.clear(); };
    }
    return new Promise((res, rej) => { const id = ++wkSeq; wkWait.set(id, [res, rej]); try { wk.postMessage({...msg, id}); } catch (e) { wkWait.delete(id); wkBroken = true; rej(e); } });
  } catch (e) { wkBroken = true; return Promise.reject(e); }
}
const concatBytes = parts => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
async function sealBytes(k, parts) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const len = parts.reduce((a, p) => a + p.length, 0), zip = len > 200000 && 'CompressionStream' in window;   // grote kluis eerst samendrukken
  let ct;
  try { ct = (await wkCall({op:'seal', parts, iv, zip, key:k.key})).ct; }
  catch {
    let pt = concatBytes(parts); if (zip) pt = await gzipBytes(pt);
    ct = b64(await crypto.subtle.encrypt({name:'AES-GCM', iv}, k.key, pt));
  }
  return {v:1, kdf:'PBKDF2-SHA256', iter:k.iter, salt:b64(k.salt), iv:b64(iv), ct, ...(zip ? {z:'gzip'} : {}), ...(k.w ? {w:k.w} : {})};
}
const seal = (k, obj) => sealBytes(k, [te.encode(JSON.stringify(obj))]);
async function unsealText(key, blob) {
  try { return (await wkCall({op:'open', ct:blob.ct, iv:blob.iv, zip:blob.z === 'gzip', key})).text; }
  catch (e) {
    if (/decrypt|operation/i.test(String(e && e.message))) throw e;   // verkeerd wachtwoord: niet nog eens proberen
    let pt = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(blob.iv)}, key, unb64(blob.ct)));
    if (blob.z === 'gzip') pt = await gzipBytes(pt, true);
    return td.decode(pt);
  }
}
async function unseal(key, blob) { return JSON.parse(await unsealText(key, blob)); }
/* ---- Datasleutel en noodcode (accounts) ----
   De kluis van een account is versleuteld met een willekeurige datasleutel. Die zit twee keer ingepakt in de kluis (blob.w):
   met een sleutel uit het wachtwoord (w.pw) en met een noodcode (w.rec). Een wachtwoord wijzigen pakt enkel de datasleutel
   opnieuw in; met de noodcode kies je een nieuw wachtwoord als je het vergeten bent. Lokale kluizen blijven zoals vroeger. */
const REC_ITER = 10000, B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function newRecoveryKey() {
  const u = crypto.getRandomValues(new Uint8Array(20)); let bits = '', s = '';
  for (const b of u) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < 160; i += 5) s += B32[parseInt(bits.slice(i, i + 5), 2)];
  return s.match(/.{4}/g).join('-');
}
const recNorm = s => String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
async function wrapRaw(raw, secret, iter) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await deriveKey(secret, salt, iter);
  return {s:b64(salt), iv:b64(iv), i:iter, ct:b64(await crypto.subtle.encrypt({name:'AES-GCM', iv}, kek, raw))};
}
async function unwrapRaw(w, secret) {
  const kek = await deriveKey(secret, unb64(w.s), w.i);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(w.iv)}, kek, unb64(w.ct)));
}
const envelopeK = async (raw, w, id) => ({key:await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']), raw, w, salt:id, iter:ITER});
async function newEnvelope(pw, raw) {
  raw = raw || crypto.getRandomValues(new Uint8Array(32));
  const rec = newRecoveryKey();
  return {K:await envelopeK(raw, {pw:await wrapRaw(raw, pw, ITER), rec:await wrapRaw(raw, recNorm(rec), REC_ITER)}, crypto.getRandomValues(new Uint8Array(16))), rec};
}
// sleutel van een kluis openen met het wachtwoord (of met de noodcode); een fout wachtwoord geeft een uitzondering
async function openKey(pw, blob, viaRec) {
  if (!blob.w) return {key:await deriveKey(pw, unb64(blob.salt), blob.iter), salt:unb64(blob.salt), iter:blob.iter};
  const raw = await unwrapRaw(viaRec ? blob.w.rec : blob.w.pw, viaRec ? recNorm(pw) : pw);
  const k = await envelopeK(raw, blob.w, unb64(blob.salt));
  if (blob.pendingW) k.pendingW = blob.pendingW;   // nog niet online bevestigde wijzigingen op dit toestel
  return k;
}
function setKeyWrap(name, wrapped) {
  K = {...K, w:{...K.w, [name]:wrapped}, pendingW:{...K.pendingW, [name]:wrapped}};
  syncDirty = true; syncEtag = null;
}
/* Kluis op het toestel: localStorage (klein en snel), IndexedDB als ze daar te groot voor wordt (> ± 3 MB). */
let vaultCache = null;
function idbOpen() {
  return idbOpen.p ||= new Promise((res, rej) => { const q = indexedDB.open('taken', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbKV(mode, k, v) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('kv');
    const q = mode === 'get' ? st.get(k) : mode === 'set' ? st.put(v, k) : st.delete(k);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
async function loadVault() {
  let v = null;
  try { v = JSON.parse(localStorage.getItem(VAULT)); } catch {}
  if (v && v.idb) { try { v = await idbKV('get', VAULT); } catch { v = null; } }
  vaultCache = v || null;
}
function vaultBlob() { return vaultCache; }
async function storeVault(blob) {
  vaultCache = blob;
  const str = JSON.stringify(blob);
  if (str.length < 3000000) {
    try { localStorage.setItem(VAULT, str); idbKV('del', VAULT).catch(() => {}); return; } catch {}
  }
  await idbKV('set', VAULT, blob);
  localStorage.setItem(VAULT, '{"idb":1}');
}

/* ---------------- Data model ---------------- */
let K = null;       // {key, salt, iter}
let data = null;

// Standaardvelden voor elk nieuw account of nieuwe kluis (vaste id's, zodat toestellen elkaar niet dubbel invullen)
const DEFAULT_FIELDS = [
  ['f-eerste-contact', 'Eerste x contactname', 'date'],
  ['f-naam', 'Naam', 'text'],
  ['f-telefoon', 'Telefoonnummer', 'text'],
  ['f-email', 'Emailadres', 'text'],
  ['f-formaat', 'Formaat', 'select', ['1/1', '1/2', '1/4', '1/8', '1/12', '1/16', '1/32', 'Banner', 'Vergroting', 'Annulatie']],
  ['f-kortingsprijs', 'Kortingsprijs', 'number'],
  ['f-klant-koud-repeat', 'Klant/Koud/Repeat', 'select', ['Klant', 'Koud', 'Repeat']],
];
const defaultFields = () => DEFAULT_FIELDS.map(([id, name, type, opts], i) => ({id, name, type, order:i, all:true, projectIds:[], showInList:true, u:0,
  options:(opts || []).map((label, j) => ({id:id + '-' + j, label, color:COLORS[j % COLORS.length]}))}));
function newData() {
  return normalize({v:1, updatedAt:now(), projects:[{id:'inbox', name:'Inbox', color:'#246fe0', order:0, u:0}],
    fields:defaultFields(), tasks:[], deleted:{}, prefs:{}, settings:{sync:null, autolock:15}});
}
function normalize(d) {
  d.projects ||= []; d.fields ||= []; d.tasks ||= []; d.deleted ||= {}; d.prefs ||= {}; d.settings ||= {};
  delete d.settings.beeper;
  if (!d.projects.some(p => p.id === 'inbox')) d.projects.unshift({id:'inbox', name:'Inbox', color:'#246fe0', order:0, u:0});
  if (d.settings.autolock === undefined) d.settings.autolock = 15;
  if (d.settings.sync === undefined) d.settings.sync = null;
  if (!d.stages?.length) d.stages = DEFAULT_STAGES.map(x => ({...x, u:0}));
  for (const st of d.stages) {
    const o = OLD_STAGES[st.id], n = DEFAULT_STAGES.find(x => x.id === st.id);
    if (o && n && st.label === o[0] && String(st.color).toLowerCase() === o[1]) { st.label = n.label; st.color = n.color; }
  }
  // een "positieve" stap maakt van een deal automatisch een verkoop; bestaande gewonnen stappen worden eenmalig herkend
  for (const st of d.stages) if (st.positive === undefined) st.positive = st.id === 'positive' || (!!st.done && /gewonnen|positief|verkocht/i.test(st.label));
  d.salesPages ||= []; d.sales ||= []; d.comments ||= []; d.events ||= []; d.activities ||= []; delete d.notes;
  // de klantendatabase bestaat niet meer: alles wat er nog van over is (ook van oudere toestellen) wordt gewist
  d.clients = []; for (const t of d.tasks) delete t.clientId;
  if (!d.salesCols?.length) d.salesCols = DEFAULT_SALES_COLS.map(x => ({...x, u:0}));
  for (const r of d.sales) r.values ||= {};
  // eenmalig: een tekstkolom "Formaat" wordt een keuzekolom
  for (const c of d.salesCols) if (c.type === 'text' && /^\s*formaat\s*$/i.test(c.name) && !c.fmtMig) { c.type = 'format'; c.fmtMig = true; c.u = Date.now(); convertFormatCol(d, c); }
  const st = sortStages(d.stages);
  const open = st.find(x => !x.done) || st[0], done = st.find(x => x.done) || st[st.length - 1];
  for (const t of d.tasks) {
    t.custom ||= {};
    if (!st.some(x => x.id === t.stage)) t.stage = t.done ? done.id : open.id;
    t.done = !!st.find(x => x.id === t.stage).done;
    if (t.wonAt === undefined && st.find(x => x.id === t.stage).positive) t.wonAt = t.doneAt || t.createdAt || 1;   // al gewonnen vóór deze functie: geen verkoop achteraf
  }
  // archiveren bestaat niet meer: wat ooit gearchiveerd was, staat weer gewoon op zijn plaats
  for (const x of [...d.tasks, ...d.projects, ...d.salesPages]) if (x.archived) { x.archived = false; x.archivedAt = null; x.u = Date.now(); }
  for (const f of d.fields) { f.options ||= []; f.projectIds ||= []; if (f.all === undefined) f.all = true; }
  d.updatedAt ||= 0;
  return d;
}
// Samenvoegen per item (laatste wijziging wint), met tombstones voor verwijderingen.
function merge(a, b) {
  const newer = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
  const out = {...newer, prefs:{...newer.prefs}, settings:{...newer.settings}};
  const del = {...a.deleted};
  for (const [k, v] of Object.entries(b.deleted)) del[k] = Math.max(del[k] || 0, v);
  for (const col of ['projects', 'fields', 'tasks', 'stages', 'salesPages', 'sales', 'salesCols', 'comments', 'clients', 'events', 'activities']) {
    const m = new Map();
    for (const it of [...(a[col] || []), ...(b[col] || [])]) {
      const cur = m.get(it.id);
      if (!cur || (it.u || 0) > (cur.u || 0)) m.set(it.id, it);
    }
    out[col] = [...m.values()].filter(it => !(del[it.id] && del[it.id] >= (it.u || 0)));
    if (col === 'stages' && !out.stages.length) out.stages = a.stages;
    if (col === 'salesCols' && !out.salesCols.length) out.salesCols = a.salesCols;
  }
  // tombstones ouder dan 180 dagen opruimen
  const cutoff = now() - 180 * 864e5;
  for (const k of Object.keys(del)) if (del[k] < cutoff) delete del[k];
  out.deleted = del;
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return normalize(out);
}
function sig(d) {
  const s = arr => JSON.stringify([...arr].sort((x, y) => x.id < y.id ? -1 : 1));
  return s(d.projects) + s(d.fields) + s(d.tasks) + s(d.stages) + s(d.salesPages) + s(d.sales) + s(d.salesCols) + s(d.comments) + s(d.clients || []) + s(d.events || []) + s(d.activities || []) + JSON.stringify(Object.entries(d.deleted).sort(([a], [b]) => a.localeCompare(b))) + JSON.stringify(d.settings) + JSON.stringify(d.prefs);
}

const proj = id => data.projects.find(p => p.id === id) || data.projects.find(p => p.id === 'inbox');
const taskById = id => data.tasks.find(t => t.id === id);
const fieldById = id => data.fields.find(f => f.id === id);
const sortedProjects = () => [...data.projects].sort((a, b) => (a.id === 'inbox' ? -1 : b.id === 'inbox' ? 1 : (a.order || 0) - (b.order || 0)));
const sortedFields = () => [...data.fields].sort((a, b) => (a.order || 0) - (b.order || 0));
const fieldsFor = pid => sortedFields().filter(f => f.all || f.projectIds.includes(pid));
const touch = o => { o.u = now(); return o; };
function tombstone(id) { data.deleted[id] = now(); }
/* Functies die je kunt aan- of uitzetten (zonder keuze staat alles aan, zoals bij bestaande gebruikers) */
const FEATURES = [
  ['agenda', 'Agenda', 'Afspraken en deadlines op een kalender'],
  ['sales', 'Verkopen', 'Maandpagina’s met omzet, doel, commissie en bonus'],
  ['btw', 'BTW-rekenmachine', 'Een bedrag omrekenen van of naar inclusief btw'],
];
const feat = k => { const f = data?.settings.features; return !f || f[k] !== false; };
const VIEW_FEATURE = {agenda:'agenda', btw:'btw', sales:'sales', dashboard:'sales'};

/* ---------------- Persistence ---------------- */
let persistChain = Promise.resolve();
function persist() {
  persistChain = persistChain.then(async () => {
    const key = K, blob = await seal(key, data);
    await storeVault(key.pendingW ? {...blob, pendingW:key.pendingW} : blob);
    return blob;
  }).catch(e => { console.error(e); toast('Opslaan mislukt: ' + e.message); });
  return persistChain;
}
// volledige kluis voor de dienst of een back-up
async function persistFull() {
  await persist();
  return seal(K, data);
}
let saveTimer = null;
function save(soon) {
  syncWins();
  data.updatedAt = now();
  clearTimeout(saveTimer);
  syncDirty = true;
  // meerdere wijzigingen kort na elkaar (bv. vinkjes, voorkeuren) worden in één keer bewaard
  saveTimer = setTimeout(() => { saveTimer = null; persist(); scheduleSync(); }, soon ? 600 : 120);
}
let syncDirty = true;
function commit() { save(); renderAll(); }

const NOT_MODIFIED = {};

/* ---------------- Account en cloud (Supabase) ----------------
   Staat er een cloud.json (project-URL + publieke sleutel), dan log je in met e-mail en wachtwoord en bewaart de dienst per
   account één versleutelde kluis. Uit je wachtwoord worden twee onafhankelijke dingen afgeleid: een login-geheim (dat naar de
   dienst gaat) en de sleutel van de kluis (die dit toestel nooit verlaat). De dienst ziet dus nooit je wachtwoord of je gegevens. */
const CLOUD_CFG = 'taken.cloud.cfg', CLOUD_USER = 'taken.cloud.user', CLOUD_MINPW = 10;
let CLOUD = null, cloudSess = null, cloudAuth = null, cloudRev = null;   // sessie en login-geheim blijven enkel in het geheugen
try { CLOUD = JSON.parse(localStorage.getItem(CLOUD_CFG)); } catch {}
async function loadCloudCfg() {
  try {
    const r = await fetch('cloud.json?t=' + now(), {cache:'no-store'});
    if (r.ok) {
      const j = await r.json();
      if (j?.url && j?.key) { CLOUD = {url:String(j.url).replace(/\/+$/, ''), key:j.key}; try { localStorage.setItem(CLOUD_CFG, JSON.stringify(CLOUD)); } catch {} return CLOUD; }
    }
    if (r.status === 404) { CLOUD = null; try { localStorage.removeItem(CLOUD_CFG); } catch {} }
  } catch {}
  return CLOUD;
}
function sbMessage(status, j) {
  const code = j?.error_code || j?.code || '', msg = String(j?.msg || j?.message || j?.error_description || j?.error || '');
  if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return 'Onjuist e-mailadres of wachtwoord.';
  if (code === 'user_already_exists' || /already (been )?registered/i.test(msg)) return 'Dit e-mailadres heeft al een account. Log in.';
  if (code === 'signup_disabled' || /signups? (not allowed|are disabled)/i.test(msg)) return 'Nieuwe accounts zijn uitgeschakeld. Vraag de beheerder om een uitnodiging.';
  if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) return 'Bevestig eerst je e-mailadres via de mail die je kreeg.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) return 'Te veel pogingen. Wacht even en probeer opnieuw.';
  if (code === 'weak_password') return 'Dit wachtwoord is te zwak.';
  if (code === 'validation_failed' || /valid email/i.test(msg)) return 'Dit e-mailadres lijkt niet te kloppen.';
  return `Account-dienst ${status}: ${msg || 'onbekende fout'}`;
}
async function sb(path, o = {}) {
  let r;
  try {
    r = await fetch(CLOUD.url + path, {method:o.method || 'GET', cache:'no-store',
      headers:{apikey:CLOUD.key, ...(o.token ? {Authorization:'Bearer ' + o.token} : {}), ...(o.body !== undefined ? {'Content-Type':'application/json'} : {}), ...(o.headers || {})},
      body:o.body !== undefined ? JSON.stringify(o.body) : undefined});
  } catch { const e = new Error('Geen verbinding met de account-dienst.'); e.offline = true; throw e; }
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(sbMessage(r.status, j)); e.status = r.status; e.code = j?.error_code || j?.code || ''; throw e; }
  return j;
}
async function authSecret(email, pw) {
  const base = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:te.encode('taken-login-v1|' + email), iterations:ITER, hash:'SHA-256'}, base, 256);
  return b64(bits);
}
const normEmail = e => String(e || '').trim().toLowerCase();
function takeSession(j) {
  if (!j?.access_token) return null;
  cloudSess = {token:j.access_token, refresh:j.refresh_token, exp:now() + Math.max(60, (j.expires_in || 3600) - 60) * 1000, userId:j.user?.id};
  return cloudSess;
}
const cloudSignIn = async (email, secret) => takeSession(await sb('/auth/v1/token?grant_type=password', {method:'POST', body:{email, password:secret}}));
const cloudSignUp = async (email, secret) => takeSession(await sb('/auth/v1/signup', {method:'POST', body:{email, password:secret}}));   // null = eerst e-mail bevestigen
async function cloudToken() {
  if (cloudSess && cloudSess.exp > now()) return cloudSess;
  if (cloudSess?.refresh) { try { const s = takeSession(await sb('/auth/v1/token?grant_type=refresh_token', {method:'POST', body:{refresh_token:cloudSess.refresh}})); if (s) return s; } catch {} }
  if (cloudAuth) {
    try { return await cloudSignIn(cloudAuth.email, cloudAuth.secret); }
    catch (e) { if (e.status === 400 || e.status === 401) throw new Error('Het wachtwoord werd op een ander toestel gewijzigd. Vergrendel en log opnieuw in met je nieuwe wachtwoord.'); throw e; }
  }
  throw new Error('Sessie verlopen. Vergrendel en log opnieuw in.');
}
const conflictError = () => Object.assign(new Error('De online kluis is intussen gewijzigd.'), {conflict:true});
// Bestaan de kolommen clients/clients_rev online (zie supabase.sql), dan worden oude klantengegevens bij het opslaan gewist.
let cloudSplit = null;
// kluis ophalen: null = nog geen kluis, NOT_MODIFIED = niets veranderd sinds meta.ifNoneMatch (de versie dient als etag)
async function cloudGet(s, meta) {
  const ss = await cloudToken(), q = '/rest/v1/vaults?user_id=eq.' + encodeURIComponent(ss.userId);
  let head;
  try { head = await sb(q + '&select=rev,clients_rev', {token:ss.token}); cloudSplit = true; }
  catch (e) { if (!/42703|clients_rev|does not exist/i.test((e.code || '') + e.message) || e.status !== 400) throw e; cloudSplit = false; head = await sb(q + '&select=rev', {token:ss.token}); }
  if (!head.length) { cloudRev = null; if (meta) meta.etag = null; return null; }
  cloudRev = head[0].rev; if (meta) meta.etag = String(cloudRev);
  if (meta?.ifNoneMatch && meta.ifNoneMatch === String(cloudRev)) return NOT_MODIFIED;
  const full = await sb(q + '&select=blob,rev', {token:ss.token});
  if (!full.length) { cloudRev = null; return null; }
  cloudRev = full[0].rev; if (meta) meta.etag = String(cloudRev);
  return JSON.parse(full[0].blob);
}
// opslaan met versiecontrole: alleen als niemand anders intussen opsloeg (anders volgt samenvoegen)
async function cloudPut(s, blob, meta) {
  const ss = await cloudToken(), q = '/rest/v1/vaults?user_id=eq.' + encodeURIComponent(ss.userId);
  const body = {blob:JSON.stringify(blob), ...(cloudSplit ? {clients:null, clients_rev:null} : {})};
  let rows;
  if (cloudRev == null) {
    try { rows = await sb('/rest/v1/vaults', {method:'POST', token:ss.token, headers:{Prefer:'return=representation'}, body:{user_id:ss.userId, wrapped:{}, rev:1, ...body}}); }
    catch (e) { if (e.status === 409) throw conflictError(); throw e; }
  } else {
    rows = await sb(q + '&rev=eq.' + cloudRev, {method:'PATCH', token:ss.token, headers:{Prefer:'return=representation'}, body:{...body, rev:cloudRev + 1, updated_at:new Date().toISOString()}});
    if (!rows?.length) throw conflictError();
  }
  cloudRev = rows[0].rev; if (meta) meta.etag = String(cloudRev);
  // Alleen de daadwerkelijk geüploade sleutelwijzigingen bevestigen. Een latere wijziging blijft pending.
  if (K?.pendingW && blob.salt === b64(K.salt)) {
    const pending = {...K.pendingW};
    for (const name of Object.keys(pending)) if (JSON.stringify(pending[name]) === JSON.stringify(blob.w?.[name])) delete pending[name];
    K = {...K, pendingW:Object.keys(pending).length ? pending : undefined};
    await persist();
  }
}
const unsealRemote = unseal;
// wat naar de dienst gaat: de volledige versleutelde kluis
const persistCloud = async () => (await persist()) || persistFull();
const persistRemote = () => persistCloud();
const remoteGet = cloudGet, remotePut = cloudPut;

let syncTimer = null, syncing = false, syncAgain = false, syncState = {state:'idle'}, syncEtag = null;
function scheduleSync(delay) {
  if (!data?.settings.sync) return;
  if (delay === undefined) delay = 1500;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), delay);
}
async function syncNow(pw) {
  const s = data?.settings.sync;
  if (!s?.cloud || !K) { renderSync(); return; }
  if (!navigator.onLine) { setSync('offline'); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true; setSync('busy');
  try {
    await persistChain;
    const dirtyAtStart = syncDirty; syncDirty = false;
    const gmeta = {ifNoneMatch:syncEtag};
    const remoteBlob = await remoteGet(s, gmeta);
    if (remoteBlob === NOT_MODIFIED) {
      // online is niets veranderd sinds de vorige keer: enkel eigen wijzigingen doorsturen, niets downloaden of samenvoegen
      if (dirtyAtStart || syncDirty) { const pm = {}; await remotePut(s, await persistRemote(s), pm); syncEtag = pm.etag; }
    } else if (remoteBlob) {
      let rkey = K.key, rK = null;
      const differentSalt = remoteBlob.salt !== b64(K.salt);
      if (differentSalt) {
        if (!pw) throw new Error('Het wachtwoord werd op een ander toestel gewijzigd. Vergrendel en log opnieuw in met je nieuwe wachtwoord.');
        try { rK = await openKey(pw, remoteBlob); } catch { throw new Error('Je gegevens kunnen niet geopend worden met dit wachtwoord.'); }
        rkey = rK.key;
      }
      let remote;
      try { remote = normalize(await unsealRemote(rkey, remoteBlob)); }
      catch (e) { throw new Error(/ontbreken/.test(e.message) ? e.message : 'Je gegevens kunnen niet geopend worden met dit wachtwoord.'); }
      let wNew = false;
      if (differentSalt) K = rK;
      else if (remoteBlob.w) {
        const wrapped = {...remoteBlob.w, ...K.pendingW};
        if (JSON.stringify(wrapped) !== JSON.stringify(K.w)) { K = {...K, w:wrapped}; wNew = true; }
      }   // eigen onbevestigde wijzigingen behouden, overige online wijzigingen overnemen
      const merged = merge(data, remote);
      merged.settings.sync = s;
      if (sig(merged) !== sig(data) || differentSalt || wNew) {
        data = merged;
        await persist();
        renderAll();
      }
      if (sig(merged) !== sig(remote) || differentSalt || K.pendingW) { const pm = {}; await remotePut(s, await persistRemote(s), pm); syncEtag = pm.etag; }
      else syncEtag = gmeta.etag;
    } else {
      const pm = {}; await remotePut(s, await persistRemote(s), pm); syncEtag = pm.etag;
    }
    setSync('ok');
  } catch (e) {
    syncDirty = true; syncEtag = null;
    if (e.conflict) { syncAgain = true; setSync('busy'); }   // iemand anders was ons voor: opnieuw ophalen, samenvoegen en opslaan
    else { console.error(e); setSync(e.offline ? 'offline' : 'err', e.message); }
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
}
function setSync(state, msg) { syncState = {state, msg, at:new Date()}; renderSync(); }
function renderSync() {
  const el = $('#syncStatus'); if (!el || !data) return;
  el.classList.toggle('err', syncState.state === 'err');
  if (!data.settings.sync) { el.textContent = 'Alleen op dit toestel opgeslagen'; el.title = 'Stel synchronisatie in via Instellingen'; return; }
  el.title = 'Klik om nu te synchroniseren';
  if (syncState.state === 'busy') el.textContent = 'Synchroniseren…';
  else if (syncState.state === 'ok') el.textContent = `Gesynchroniseerd om ${pad(syncState.at.getHours())}:${pad(syncState.at.getMinutes())}`;
  else if (syncState.state === 'offline') { el.textContent = 'Offline · wordt gesynchroniseerd zodra je online bent'; el.title = 'Je wijzigingen staan veilig op dit toestel.'; }
  else if (syncState.state === 'err' && !navigator.onLine) { el.textContent = 'Offline · wordt gesynchroniseerd zodra je online bent'; el.title = syncState.msg; }
  else if (syncState.state === 'err') { el.textContent = '⚠ Synchronisatie mislukt'; el.title = syncState.msg; }
  else el.textContent = 'Synchronisatie ingesteld';
}

/* ---------------- Lock screen ---------------- */
let lockMode = 'loading';
function renderLock() {
  const f = $('#lockFields'), sub = $('#lockSub'), btn = $('#lockBtn'), alt = $('#lockAlt');
  $('#lockErr').textContent = '';
  btn.hidden = false; alt.hidden = false; $('#lockBio').hidden = true; $('#lockForgot').hidden = true;
  alt.className = lockMode === 'cloud-in' || lockMode === 'cloud-up' ? 'btn' : 'link';
  // met een accountdienst blijft er altijd een uitweg naar de lokale kluis op dit toestel (bv. als de dienst even niet werkt)
  const loc = $('#lockLocal'); loc.hidden = !CLOUD || lockMode === 'loading';
  loc.textContent = lockMode.startsWith('cloud') ? 'Gebruik zonder account' : 'Inloggen met een account';
  if (!window.crypto?.subtle) {
    sub.textContent = 'Deze pagina moet via https geopend worden (versleuteling is anders niet beschikbaar).';
    f.innerHTML = ''; btn.hidden = true; alt.hidden = true; return;
  }
  if (lockMode === 'loading') {
    sub.textContent = 'Laden…'; f.innerHTML = ''; btn.hidden = true; alt.hidden = true; return;
  }
  const un = $('#lockForm input[name="username"]'); if (un) un.disabled = !!CLOUD && lockMode.startsWith('cloud');
  if (CLOUD && lockMode === 'cloud-in') {
    $('#lockTitle').textContent = 'Inloggen';
    sub.textContent = 'Log in met je e-mailadres en wachtwoord.';
    let last = ''; try { last = localStorage.getItem(CLOUD_USER) || ''; } catch {}
    f.innerHTML = `<label for="lkEmail">E-mailadres</label><input id="lkEmail" type="email" autocomplete="username" required value="${esc(last)}" ${last ? '' : 'autofocus'}>
      <label for="pw1">Wachtwoord</label><input id="pw1" type="password" autocomplete="current-password" required ${last ? 'autofocus' : ''}>`;
    btn.textContent = 'Inloggen'; alt.textContent = 'Account aanmaken'; $('#lockForgot').hidden = false;
    if (bioGet() && bioSupported() && last) { $('#lockBio').hidden = false; $('#lockBio').textContent = 'Inloggen met ' + bioName(); }
  } else if (CLOUD && lockMode === 'cloud-forgot') {
    $('#lockTitle').textContent = 'Wachtwoord vergeten';
    sub.textContent = 'Vul je e-mailadres in. Je krijgt een mail met een link. Daarna kies je een nieuw wachtwoord met je noodcode.';
    let last = ''; try { last = localStorage.getItem(CLOUD_USER) || ''; } catch {}
    f.innerHTML = `<label for="lkEmail">E-mailadres</label><input id="lkEmail" type="email" autocomplete="username" required value="${esc(last)}" autofocus>`;
    btn.textContent = 'Mail versturen'; alt.textContent = 'Terug naar inloggen';
  } else if (CLOUD && lockMode === 'cloud-reset') {
    $('#lockTitle').textContent = 'Nieuw wachtwoord';
    sub.textContent = `Nieuw wachtwoord voor ${resetEmail}. Vul de noodcode in die je bij het aanmaken van je account bewaarde.`;
    f.innerHTML = `<label for="rk">Noodcode</label><input id="rk" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-…" autofocus>
      <label for="pw1">Nieuw wachtwoord</label><input id="pw1" type="password" autocomplete="new-password" minlength="${CLOUD_MINPW}" required>
      <label for="pw2">Herhaal wachtwoord</label><input id="pw2" type="password" autocomplete="new-password" required>`;
    btn.textContent = 'Nieuw wachtwoord instellen'; alt.textContent = 'Ik heb geen noodcode: opnieuw beginnen';
  } else if (CLOUD && lockMode === 'cloud-up') {
    $('#lockTitle').textContent = 'Account aanmaken';
    sub.textContent = `Kies je e-mailadres en een wachtwoord van minstens ${CLOUD_MINPW} tekens. Daarna krijg je een noodcode om te bewaren, voor als je je wachtwoord vergeet.`;
    f.innerHTML = `<label for="lkEmail">E-mailadres</label><input id="lkEmail" type="email" autocomplete="username" required autofocus>
      <label for="pw1">Wachtwoord</label><input id="pw1" type="password" autocomplete="new-password" minlength="${CLOUD_MINPW}" required>
      <label for="pw2">Herhaal wachtwoord</label><input id="pw2" type="password" autocomplete="new-password" required>`;
    btn.textContent = 'Account aanmaken'; alt.textContent = 'Ik heb al een account';
  } else if (lockMode === 'setup') {
    $('#lockTitle').textContent = 'Welkom bij Klose';
    sub.textContent = 'Kies een wachtwoord om je deals te beveiligen. Onthoud het goed: zonder dit wachtwoord kan niemand ze lezen.';
    f.innerHTML = `<label for="pw1">Wachtwoord</label><input id="pw1" type="password" autocomplete="new-password" minlength="8" required autofocus>
      <label for="pw2">Herhaal wachtwoord</label><input id="pw2" type="password" autocomplete="new-password" required>`;
    btn.textContent = 'Aan de slag'; alt.hidden = true;
  } else {
    $('#lockTitle').textContent = 'Klose';
    sub.textContent = 'Voer je wachtwoord in om te ontgrendelen.';
    f.innerHTML = `<label for="pw1">Wachtwoord</label><input id="pw1" type="password" autocomplete="current-password" required autofocus>`;
    btn.textContent = 'Ontgrendelen'; alt.hidden = true;
    if (bioGet() && bioSupported()) { $('#lockBio').hidden = false; $('#lockBio').textContent = 'Ontgrendelen met ' + bioName(); }
  }
  const pws = [...f.querySelectorAll('input[type=password]')];
  if (pws.length) {   // wachtwoord kunnen tonen: duidelijker bij het typen, vooral op een telefoon
    f.insertAdjacentHTML('beforeend', '<label class="showpw"><input type="checkbox" id="showPw"> Wachtwoord tonen</label>');
    $('#showPw').onchange = e => pws.forEach(i => { i.type = e.target.checked ? 'text' : 'password'; });
  }
  if ((lockMode === 'cloud-in' || lockMode === 'unlock') && window.crypto?.subtle) {
    f.insertAdjacentHTML('beforeend', '<label class="showpw"><input type="checkbox" id="rememberPw"> Wachtwoord onthouden op dit toestel</label><p class="small muted" style="margin:2px 0 0 30px">Niet doen op een gedeelde computer.</p>');
    recallPw().then(r => {   // al onthouden: vul het in (enkel als je zelf nog niets typte)
      const em = $('#lkEmail'), pw = $('#pw1'), cb = $('#rememberPw');
      if (!r || !cb || !pw || pw.value || (em && em.value && r.email && normEmail(em.value) !== normEmail(r.email))) return;
      if (em && !em.value) em.value = r.email || '';
      pw.value = r.pw; cb.checked = true;
    });
  }
  setTimeout(() => { if (!$('#lockFields').contains(document.activeElement)) $('#lockFields input')?.focus(); }, 30);
}
/* ---------------- Wachtwoord onthouden op dit toestel ----------------
   Het wachtwoord wordt versleuteld met een sleutel die dit toestel niet kan prijsgeven (niet-exporteerbaar, in IndexedDB).
   Bij het openen staat het wachtwoord dan al ingevuld; je klikt nog altijd zelf op Inloggen. Niet doen op een gedeelde computer. */
const REM_KEY = 'taken.remember.v1';
async function remCryptoKey(create) {
  let k = await idbKV('get', 'remember.key').catch(() => null);
  if (!k && create) { k = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']); await idbKV('set', 'remember.key', k); }
  return k;
}
async function rememberPw(email, pw) {
  try {
    const key = await remCryptoKey(true), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, te.encode(JSON.stringify({email, pw})));
    localStorage.setItem(REM_KEY, JSON.stringify({iv:b64(iv), ct:b64(ct)}));
  } catch {}
}
async function recallPw() {
  try {
    const r = JSON.parse(localStorage.getItem(REM_KEY) || 'null'); if (!r) return null;
    const key = await remCryptoKey(false); if (!key) return null;
    return JSON.parse(td.decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(r.iv)}, key, unb64(r.ct))));
  } catch { return null; }
}
const forgetPw = () => { try { localStorage.removeItem(REM_KEY); } catch {} };
let lockModeChosen = false;
$('#lockLocal').addEventListener('click', () => {
  lockModeChosen = true;
  lockMode = lockMode.startsWith('cloud') ? (vaultBlob() ? 'unlock' : 'setup') : 'cloud-in';
  renderLock();
});
$('#lockForgot').addEventListener('click', () => { lockModeChosen = true; lockMode = 'cloud-forgot'; renderLock(); });
$('#lockAlt').addEventListener('click', async () => {
  lockModeChosen = true;
  if (CLOUD && lockMode === 'cloud-reset') {   // zonder noodcode: de online kluis vervangen door een lege
    const pw = $('#pw1').value, err = $('#lockErr'); err.textContent = '';
    if (pw.length < CLOUD_MINPW) { err.textContent = `Kies eerst een nieuw wachtwoord van minstens ${CLOUD_MINPW} tekens.`; return; }
    if (!await askConfirm('Account leegmaken?', 'Al je gegevens in dit account worden gewist en je begint opnieuw met een leeg account. Dit kan niet ongedaan gemaakt worden.', {ok:'Alles wissen', danger:true})) return;
    const btn = $('#lockBtn'); btn.disabled = true;
    try { await resetCloud('', pw, $('#pw2').value, true); } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    return;
  }
  if (CLOUD && lockMode === 'cloud-forgot') { lockMode = 'cloud-in'; renderLock(); return; }
  if (CLOUD && lockMode.startsWith('cloud')) { lockMode = lockMode === 'cloud-up' ? 'cloud-in' : 'cloud-up'; renderLock(); return; }
});

// Ontgrendelen zonder account: de kluis op dit toestel.
async function unlockWith(pw) {
  const local = vaultBlob();
  let kk, ld;
  try { kk = await openKey(pw, local); ld = await openLocalFull(local, kk.key); } catch { throw new Error('Onjuist wachtwoord.'); }
  K = kk; data = ld;
  if (data.settings.sync && !data.settings.sync.cloud) data.settings.sync = null;   // oude GitHub-koppeling (token) uit de kluis halen
  if (data.settings.sync?.cloud) { lockMode = 'cloud-in'; renderLock(); throw new Error('Deze gegevens horen bij een account. Log in met je e-mailadres en wachtwoord.'); }
  enterApp();
}

// Gegevens op dit toestel met een ander wachtwoord: vraag het oude wachtwoord om ze mee te nemen (of laat ze wissen)
function askLegacyPassword(blob, wrong) {
  return new Promise(resolve => {
    let done = false; const fin = v => { if (done) return; done = true; resolve(v); };
    showDialog(`<h3>Gegevens op dit toestel</h3>
      <p class="muted small">Op dit toestel staan gegevens die met een ander wachtwoord zijn versleuteld. Vul dat <b>oude wachtwoord</b> in om ze mee te nemen naar je account.</p>
      <label class="fl">Oud wachtwoord<input id="lgPw" type="password" autocomplete="off" autofocus></label>
      <p class="err" id="lgErr">${wrong ? 'Dat wachtwoord klopt niet.' : ''}</p>
      <div class="dlg-actions"><button type="button" class="btn" id="lgCancel">Annuleren</button><span class="grow"></span><button type="button" class="btn danger" id="lgSkip">Wissen en doorgaan</button><button type="button" class="btn primary" id="lgOk">Meenemen</button></div>`, d => {
      $('#lgOk', d).onclick = () => fin({pw:$('#lgPw', d).value}); $('#lgSkip', d).onclick = () => fin({skip:true}); $('#lgCancel', d).onclick = () => fin(null);
      $('#lgPw', d).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); fin({pw:e.target.value}); } };
      d.addEventListener('close', () => fin(null), {once:true});
    });
  }).then(v => { if (dlg.open) dlg.close(); return v; });
}
// kluis van dit toestel volledig openen (bij gesplitste opslag ook de klanten uit IndexedDB)
async function openLocalFull(local, key) {
  const d = await unseal(key, local);
  return normalize(d);
}
async function legacyData(local, pw) {
  // eerst met het ingetypte wachtwoord, dan met het oude wachtwoord dat de gebruiker opgeeft
  const open = async p => openLocalFull(local, (await openKey(p, local)).key);
  try { return await open(pw); } catch {}
  let wrong = false;
  for (;;) {
    const a = await askLegacyPassword(local, wrong);
    if (!a) throw new Error('Geannuleerd.');
    if (a.skip) { if (!await askConfirm('Gegevens op dit toestel wissen?', 'De gegevens op dit toestel worden gewist.', {ok:'Wissen', danger:true})) throw new Error('Geannuleerd.'); return null; }
    try { return await open(a.pw); } catch { wrong = true; }
  }
}
// Account: inloggen. Eerst de eigen kluis op dit toestel (snel, ook offline), anders de online kluis.
function cloudSettings(email) { return {cloud:true, email}; }
async function unlockCloud(emailRaw, pw) {
  const email = normEmail(emailRaw);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Vul een geldig e-mailadres in.');
  const local = vaultBlob();
  let owner = ''; try { owner = localStorage.getItem(CLOUD_USER) || ''; } catch {}
  const secretP = authSecret(email, pw);
  // 1. kluis van dit account staat al op dit toestel (snel, ook offline)
  const fast = async () => {
    try {
      const kk = await openKey(pw, local), ld = normalize(await unseal(kk.key, local));
      K = kk; data = ld; data.settings.sync = cloudSettings(email);
      cloudAuth = {email, secret:await secretP};
      enterApp(); syncNow(pw);
      return true;
    } catch { return false; }   // ander wachtwoord of elders gewijzigd: online verder
  };
  const mine = local && owner === email;
  if (mine && local.w && await fast()) return;
  // 2. online inloggen en de kluis ophalen
  const secret = await secretP;
  try { await cloudSignIn(email, secret); }
  catch (e) { if (e.offline && mine && await fast()) return; throw e; }
  cloudAuth = {email, secret};
  const rblob = await cloudGet(cloudSettings(email));
  // gegevens op dit toestel die bij een ander (of geen) account horen, of een oude kluis van dit account zonder datasleutel
  let localData = null, ask = false;
  if (local && !mine) { localData = await legacyData(local, pw); ask = true; }
  else if (mine && !local.w) { try { localData = await openLocalFull(local, (await openKey(pw, local)).key); } catch {} }
  let newRec = null;
  if (rblob) {
    let rK; try { rK = await openKey(pw, rblob); } catch { throw new Error('Je gegevens kunnen niet geopend worden met dit wachtwoord.'); }
    let remote; try { remote = normalize(await unsealRemote(rK.key, rblob)); } catch (e) { throw new Error(/ontbreken/.test(e.message) ? e.message : 'Je gegevens kunnen niet geopend worden met dit wachtwoord.'); }
    K = rK; data = remote;
    if (localData && (!ask || await askConfirm('Gegevens samenvoegen?', 'Er staan ook gegevens op dit toestel. Wil je ze samenvoegen met je account, of enkel de gegevens van je account gebruiken?', {ok:'Samenvoegen', cancel:'Enkel account'}))) data = merge(localData, remote);
  } else {
    const env = await newEnvelope(pw); K = env.K; newRec = env.rec;
    data = localData || newData();   // eerste keer: bestaande gegevens van dit toestel verhuizen mee naar het account
  }
  data.settings.sync = cloudSettings(email);
  try { localStorage.setItem(CLOUD_USER, email); } catch {}
  syncDirty = true;
  await persist();
  if (rblob && !K.w) newRec = await upgradeEnvelope(pw);   // oudere accountkluis: voeg datasleutel en noodcode toe
  enterApp(); syncNow(pw);
  if (newRec) showRecoveryKey(newRec);
}
// Kluis zonder datasleutel (eerste versie) omzetten: nieuwe datasleutel, opnieuw versleutelen en meteen online zetten
async function upgradeEnvelope(pw) {
  const old = K, env = await newEnvelope(pw);
  try {
    K = env.K; await persist();
    await remotePut(data.settings.sync, await persistRemote(data.settings.sync));
    return env.rec;
  } catch (e) { console.warn('Noodcode nog niet toegevoegd', e); K = old; await persist(); return null; }
}
// Account wissen: de databasefunctie delete_my_account (zie supabase.sql) verwijdert de gebruiker en via cascade de kluis
async function deleteAccount() {
  const ss = await cloudToken();
  try { await sb('/rest/v1/rpc/delete_my_account', {method:'POST', token:ss.token, body:{}}); }
  catch (e) {
    if (e.status !== 404) throw e;
    try { await sb('/rest/v1/vaults?user_id=eq.' + encodeURIComponent(ss.userId), {method:'DELETE', token:ss.token}); } catch {}
    throw new Error('Het account zelf kan pas gewist worden nadat de beheerder het bijgewerkte supabase.sql heeft uitgevoerd. Je online kluis is wel gewist; probeer het daarna opnieuw.');
  }
}
// De noodcode tonen: kopiëren of downloaden, en pas sluiten na bevestiging
function showRecoveryKey(rec, again) {
  showDialog(`<h3>${again ? 'Nieuwe noodcode' : 'Bewaar je noodcode'}</h3>
    <p class="muted small">Vergeet je ooit je wachtwoord, dan kun je met deze sleutel opnieuw toegang krijgen tot je gegevens. Niemand anders kan dat, ook wij niet. Bewaar de sleutel op een veilige plek (bv. in een wachtwoordbeheerder of op papier).${again ? ' De vorige noodcode werkt niet meer.' : ''}</p>
    <div class="box"><code id="rkVal" style="font-size:15px;letter-spacing:.5px;word-break:keep-all;user-select:all">${esc(rec)}</code></div>
    <div class="dlg-actions" style="margin-top:6px"><button type="button" class="btn" id="rkCopy">Kopiëren</button><button type="button" class="btn" id="rkDl">Downloaden</button></div>
    <label class="chk" style="margin-top:10px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="rkOk"> Ik heb de noodcode veilig bewaard</label>
    <div class="dlg-actions"><span class="grow"></span><button type="button" class="btn primary" id="rkDone" disabled>Klaar</button></div>`, d => {
    $('#rkCopy', d).onclick = async () => { try { await navigator.clipboard.writeText(rec); toast('Gekopieerd'); } catch { toast('Kopiëren mislukt: selecteer de sleutel en kopieer zelf'); } };
    $('#rkDl', d).onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([`Klose: noodcode\n${data?.settings.sync?.email || ''}\n\n${rec}\n\nBewaar dit bestand veilig. Met deze sleutel kun je een vergeten wachtwoord vervangen.\n`], {type:'text/plain'}));
      a.download = 'klose-noodcode.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    };
    $('#rkOk', d).onchange = e => { $('#rkDone', d).disabled = !e.target.checked; };
    $('#rkDone', d).onclick = () => { d.close(); setTimeout(maybeStart, 400); };
    d.addEventListener('cancel', e => { if (!$('#rkOk', d).checked) e.preventDefault(); }, {once:true});
  });
}
// Wachtwoord vergeten: de herstelmail (via de dienst) brengt je hier terug met een tijdelijke sessie; met de noodcode kies je een nieuw wachtwoord
async function sendRecoveryMail(emailRaw) {
  const email = normEmail(emailRaw);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Vul een geldig e-mailadres in.');
  await sb('/auth/v1/recover?redirect_to=' + encodeURIComponent(location.origin + location.pathname), {method:'POST', body:{email}});
}
let resetEmail = '';
async function takeRecoveryLink() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (h.get('type') !== 'recovery' || !h.get('access_token')) return false;
  history.replaceState(null, '', location.pathname + location.search);
  cloudSess = {token:h.get('access_token'), refresh:h.get('refresh_token'), exp:now() + Math.max(60, (+h.get('expires_in') || 3600) - 60) * 1000, userId:null};
  try { const u = await sb('/auth/v1/user', {token:cloudSess.token}); cloudSess.userId = u.id; resetEmail = normEmail(u.email); } catch { cloudSess = null; return false; }
  return true;
}
async function resetCloud(rk, pw, pw2, fresh) {
  if (pw.length < CLOUD_MINPW) throw new Error(`Gebruik minstens ${CLOUD_MINPW} tekens.`);
  if (pw !== pw2) throw new Error('De wachtwoorden komen niet overeen.');
  const email = resetEmail, ss = cloudSess, st = cloudSettings(email);
  const rblob = await cloudGet(st);
  let nK, nData, rec = null;
  if (fresh || !rblob) { const env = await newEnvelope(pw); nK = env.K; rec = env.rec; nData = newData(); }
  else {
    if (!rblob.w) throw new Error('Dit account heeft geen noodcode. Je kunt alleen opnieuw beginnen met een leeg account.');
    let rK; try { rK = await openKey(rk, rblob, true); } catch { throw new Error('Deze noodcode klopt niet.'); }
    nData = normalize(await unsealRemote(rK.key, rblob));
    nK = {...rK, w:{pw:await wrapRaw(rK.raw, pw, ITER), rec:rblob.w.rec}};
  }
  const local = vaultBlob(); let owner = ''; try { owner = localStorage.getItem(CLOUD_USER) || ''; } catch {}
  if (local && owner !== email && !await askConfirm('Gegevens vervangen?', 'De gegevens van een ander account op dit toestel worden vervangen.')) throw new Error('Geannuleerd.');
  const nsec = await authSecret(email, pw);
  await sb('/auth/v1/user', {method:'PUT', token:ss.token, body:{password:nsec}});
  cloudAuth = {email, secret:nsec};
  try { await cloudSignIn(email, nsec); } catch {}
  K = nK; data = nData; data.settings.sync = st;
  if (rblob && !fresh) setKeyWrap('pw', nK.w.pw);
  try { localStorage.setItem(CLOUD_USER, email); localStorage.removeItem(BIO_KEY); } catch {}
  syncDirty = true;
  await persist();
  try { await remotePut(st, await persistRemote(st)); syncDirty = false; } catch (e) { if (!e.conflict) throw e; }
  enterApp(); syncNow(pw);
  if (rec) showRecoveryKey(rec);
}
// Account: aanmaken, daarna meteen ingelogd (of eerst het e-mailadres bevestigen als de beheerder dat vraagt).
async function signupCloud(emailRaw, pw, pw2) {
  const email = normEmail(emailRaw);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Vul een geldig e-mailadres in.');
  if (pw.length < CLOUD_MINPW) throw new Error(`Gebruik minstens ${CLOUD_MINPW} tekens.`);
  if (pw !== pw2) throw new Error('De wachtwoorden komen niet overeen.');
  const secret = await authSecret(email, pw);
  const sess = await cloudSignUp(email, secret);
  if (!sess) {
    lockMode = 'cloud-in'; renderLock(); $('#lockBtn').disabled = false;
    $('#lockErr').textContent = 'Account aangemaakt. Bevestig je e-mailadres via de mail die we stuurden en log daarna in.';
    return;
  }
  await unlockCloud(email, pw);   // nieuw account: geen online kluis; bestaande gegevens op dit toestel verhuizen mee
}

$('#lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#lockErr'), btn = $('#lockBtn');
  const pw = $('#pw1')?.value || '', rem = $('#rememberPw'), remOn = !!rem?.checked, remEmail = $('#lkEmail')?.value || '';
  err.textContent = ''; btn.disabled = true;
  const old = btn.textContent; btn.textContent = 'Even geduld…';
  try {
    if (CLOUD && lockMode === 'cloud-in') {
      await unlockCloud($('#lkEmail').value, pw);
      if (rem) { if (remOn) rememberPw(normEmail(remEmail), pw); else forgetPw(); }
    } else if (CLOUD && lockMode === 'cloud-forgot') {
      await sendRecoveryMail($('#lkEmail').value);
      lockMode = 'cloud-in'; renderLock(); $('#lockErr').textContent = 'Als dit e-mailadres een account heeft, is er een mail onderweg. Open de link in die mail op dit toestel.';
    } else if (CLOUD && lockMode === 'cloud-reset') {
      if (!recNorm($('#rk').value)) throw new Error('Vul je noodcode in.');
      await resetCloud($('#rk').value, pw, $('#pw2').value);
    } else if (CLOUD && lockMode === 'cloud-up') {
      await signupCloud($('#lkEmail').value, pw, $('#pw2').value);
    } else if (lockMode === 'setup') {
      if (pw.length < 8) throw new Error('Gebruik minstens 8 tekens.');
      if (pw !== $('#pw2').value) throw new Error('De wachtwoorden komen niet overeen.');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      K = {key:await deriveKey(pw, salt, ITER), salt, iter:ITER};
      data = newData();
      await persist();
      enterApp();
    } else if (lockMode === 'unlock') {
      await unlockWith(pw);
      if (rem) { if (remOn) rememberPw('', pw); else forgetPw(); }
    }
  } catch (ex) {
    if (remOn && /onjuist|klopt niet|geopend/i.test(ex.message)) forgetPw();   // onthouden wachtwoord is niet meer geldig
    err.textContent = ex.message;
    btn.disabled = false; btn.textContent = old;
  }
});

/* ---------------- Rondleiding voor nieuwe gebruikers ---------------- */
function tourSteps() {
  const mob = matchMedia('(max-width:860px)').matches, q = x => document.querySelector(x);
  const navBy = rx => [...document.querySelectorAll('#toolNav .nav-item')].find(x => rx.test(x.textContent));
  const hasCalc = !!q('#projCalc:not([hidden])');
  return [
    {title:'Welkom bij Klose',text:'Je klanten, opvolging en verkopen op één plek. Dit zijn de belangrijkste stappen.'},
    {el:()=>q('#primaryAdd'),title:'Klant toevoegen',text:'Klik op Klant toevoegen. Vul de naam in en bevestig. Je kunt contactgegevens later aanvullen.'},
    {el:()=>mob?q('#tabBar [data-tab=today]'):navBy(/Vandaag/),title:'Wat doe ik vandaag?',text:'Open Vandaag voor klanten die je nu moet opvolgen. Open een klant om te bellen, te mailen of een notitie te bewaren.'},
    {el:()=>mob?q('#tabBar [data-tab=all]'):navBy(/Klanten/),title:'Je klanten terugvinden',text:'Open Klanten. Je ziet een lijst met naam, status en opvolgdatum. Met het zoekveld vind je een klant snel terug.'},
    {el:()=>q('#topHelp'),title:'Hulp is dichtbij',text:'Bij Hulp vind je korte uitleg. Instellingen en Back-ups staan in het menu.'},
    {title:'Aan de slag',text:'Begin met een klant. In het klantpaneel staan Overzicht, Notities en Gegevens.'},
  ];
}
let tourOn = false;
function startTour() {
  if (tourOn) return; tourOn = true;
  const steps = tourSteps(); let i = 0;
  const root = document.createElement('div'); root.id = 'tour';
  root.innerHTML = '<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourT"><p class="tour-n"></p><h3 id="tourT"></h3><p class="tour-x"></p><div class="tour-btns"><button type="button" class="link" data-t="skip">Overslaan</button><span class="grow"></span><button type="button" class="btn" data-t="prev">Vorige</button><button type="button" class="btn primary" data-t="next">Volgende</button></div></div>';
  document.body.appendChild(root);
  const hole = root.querySelector('.tour-hole'), card = root.querySelector('.tour-card');
  const finish = () => {
    tourOn = false; root.remove(); removeEventListener('keydown', onKey); removeEventListener('resize', place);
    if (data && !data.settings.tourDone) { data.settings.tourDone = true; save(); }
  };
  const place = () => {
    const st = steps[i], el = st.el?.(), vw = innerWidth, vh = innerHeight;
    const ok = el && el.getClientRects().length;
    card.style.width = Math.min(340, vw - 24) + 'px';
    if (!ok) { hole.style.cssText = 'display:none'; card.style.left = Math.max(12, (vw - card.offsetWidth) / 2) + 'px'; card.style.top = Math.max(12, (vh - card.offsetHeight) / 2.4) + 'px'; return; }
    const r = el.getBoundingClientRect(), pad = 6;
    hole.style.cssText = `display:block;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let left, top;
    if (r.right < 320 && vw > 860) { left = r.right + 16; top = Math.min(Math.max(12, r.top - 8), vh - ch - 12); }
    else { left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12); top = r.bottom + 14 + ch < vh ? r.bottom + 14 : Math.max(12, r.top - ch - 14); }
    card.style.left = left + 'px'; card.style.top = top + 'px';
  };
  const show = () => {
    const st = steps[i], el = st.el?.();
    if (el && el.getClientRects().length) el.scrollIntoView({block:'nearest', inline:'nearest'});
    card.querySelector('.tour-n').textContent = `Stap ${i + 1} van ${steps.length}`;
    card.querySelector('h3').textContent = st.title; card.querySelector('.tour-x').textContent = st.text;
    card.querySelector('[data-t=prev]').hidden = i === 0;
    card.querySelector('[data-t=next]').textContent = i === steps.length - 1 ? 'Aan de slag' : 'Volgende';
    card.querySelector('[data-t=skip]').hidden = i === steps.length - 1;
    place(); card.querySelector('[data-t=next]').focus({preventScroll:true});
  };
  const onKey = e => { if (e.key === 'Escape') finish(); else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); card.querySelector('[data-t=next]').click(); } else if (e.key === 'ArrowLeft' && i) { i--; show(); } };
  card.addEventListener('click', e => {
    const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return;
    if (t === 'skip') finish(); else if (t === 'prev') { i--; show(); } else if (i === steps.length - 1) finish(); else { i++; show(); }
  });
  addEventListener('keydown', onKey); addEventListener('resize', place);
  show();
}
/* ---------------- Beginkeuze voor nieuwe gebruikers ---------------- */
function featureChecks(cur) {
  return FEATURES.map(([k, label, hint]) => `<label class="feat"><input type="checkbox" data-feat="${k}" ${cur[k] ? 'checked' : ''}><span><b>${label}</b><small>${hint}</small></span></label>`).join('');
}
function askFeatures() {
  return new Promise(resolve => {
    showDialog(`<h3>Waarvoor gebruik je Klose?</h3>
      <p class="muted small">Kies wat je nodig hebt. De rest blijft verborgen zodat het overzichtelijk blijft. Je kunt dit altijd aanpassen onder Instellingen.</p>
      <div class="feat-list"><label class="feat"><input type="checkbox" checked disabled><span><b>Klanten en taken</b><small>Klanten opvolgen en gesprekken bewaren</small></span></label>${featureChecks({})}</div>
      <div class="dlg-actions"><span class="grow"></span><button type="button" class="btn primary" id="ftOk">Verder</button></div>`, d => {
      dlg.dataset.sticky = '1';
      d.addEventListener('cancel', e => e.preventDefault(), {once:true});
      $('#ftOk', d).onclick = () => {
        const f = {}; for (const [k] of FEATURES) f[k] = !!$(`[data-feat="${k}"]`, d).checked;
        delete dlg.dataset.sticky; dlg.close(); resolve(f);
      };
    });
  });
}
// Alleen deals: rustige stappen in plaats van het verkoopproces (enkel zolang er nog geen deals zijn)
function neutralStages() {
  if (data.tasks.length) return;
  const set = {callback:['Te doen', '#FF4B1F', false], mail:['Bezig', '#4D5059', false], positive:['Klaar', '#1E5BC6', true]};
  for (const st of data.stages) { const n = set[st.id]; if (n) { st.label = n[0]; st.color = n[1]; st.done = n[2]; touch(st); } }
  const neg = data.stages.find(x => x.id === 'negative'); if (neg) { data.stages = data.stages.filter(x => x !== neg); tombstone(neg.id); }
}
async function firstRun() {
  if (data.settings.features || data.tasks.length) return;
  const f = await askFeatures();
  data.settings.features = f;
  if (!f.sales) neutralStages();
  save(); renderAll();
}
// alleen voor wie nieuw is: nog geen deals of klanten en de rondleiding nog niet gezien
async function maybeStart() {
  if (navigator.webdriver && !window.__tourTest) return;   // geautomatiseerde tests worden niet onderbroken
  if (!data || tourOn || dlg.open || !$('#lock').hidden) return;
  await firstRun();
  maybeTour();
}
function maybeTour() {
  if (navigator.webdriver && !window.__tourTest) return;   // geautomatiseerde tests worden niet onderbroken
  if (!data || tourOn || data.settings.tourDone || dlg.open || !$('#lock').hidden) return;
  if (data.tasks.length) { data.settings.tourDone = true; return; }
  startTour();
}
function enterApp() {
  if (view.type === 'all') view = {type:'today'};
  $('#lock').hidden = true;
  $('#app').hidden = false;
  document.title = 'Klose';
  renderAll();
  startTimers();
  setTimeout(maybeStart, 900);
  if (pendingLaunch) { const u = pendingLaunch; pendingLaunch = null; applyLaunch(u); }
}
// Snelkoppelingen uit de taakbalk/het startmenu (?view=today, ?new=1) en heropenen van een al open venster.
let pendingLaunch = /[?&](view|new)=/.test(location.search) ? location.href : null;
function applyLaunch(url) {
  const q = new URL(url, location.href).searchParams, v = q.get('view');
  if (location.search) history.replaceState(null, '', location.pathname);
  if (v === 'sales') { const pg = sortedSalesPages()[0]; if (pg) setView({type:'sales', id:pg.id}); }
  else if (['today', 'all', 'upcoming', 'inbox'].includes(v)) setView({type:v});
  if (q.get('new')) {
    if (view.type === 'sales') setView({type:'all'});
    setTimeout(newDealNow, 60);
  }
}
if ('launchQueue' in window) launchQueue.setConsumer(p => {
  if (!p.targetURL || !/[?&](view|new)=/.test(p.targetURL)) return;
  if (data && !$('#app').hidden) applyLaunch(p.targetURL); else pendingLaunch = p.targetURL;
});
// Geïnstalleerd venster met eigen titelbalk (Windows/macOS, Edge/Chrome)
const wco = navigator.windowControlsOverlay;
const syncWco = () => document.documentElement.classList.toggle('wco', !!wco?.visible);
if (wco) { syncWco(); wco.addEventListener('geometrychange', syncWco); }
async function lock() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; persist(); }
  await persistChain;
  location.reload();
}

/* ---------------- App state ---------------- */
let view = {type:'all'};
let selectedId = null;
let searchQ = '';
const SMART = [['inbox','Inbox'],['today','Vandaag'],['upcoming','Komende 7 dagen'],['all','Klanten']];
const viewKey = () => view.type === 'project' ? 'p:' + view.id : view.type === 'sales' ? 's:' + view.id : view.type;
function prefs() {
  const saved = data.prefs[viewKey()] || {};
  // weergave en sortering staan centraal in de instellingen; er is alleen nog een bord
  return {group:'stage', showDone:false, ...saved, sort:crmListFilter().sort, ff:'', fv:'', layout:data.settings.taskLayout || 'list'};
}
function setView(v) {
  const same = v.type === view.type && v.id === view.id;
  // de keuze geldt meteen (ook voor wat je intussen typt); enkel het tekenen gebeurt in de overgang
  view = v; searchQ = '';
  if (selectedId && !viewTasks(true).some(t => t.id === selectedId)) selectedId = null;
  const apply = () => {
    $('#list').innerHTML = '';
    $('#app').classList.remove('side-open');
    renderAll();
    $('#main').scrollTo({top:0, behavior:'instant'});
  };
  // zachte overgang tussen schermen, zoals een native app (Safari 18+, Chrome); anders meteen
  // enkel op gsm: daar hoort een overgang bij het native gevoel; desktop-apps wisselen meteen
  if (same || !document.startViewTransition || reduceMotion() || document.hidden || !matchMedia('(max-width:860px)').matches) { apply(); return; }
  document.startViewTransition(apply);
}
function viewTitle() {
  if (view.type === 'today') return 'Vandaag doen';
  if (view.type === 'dashboard') return 'Verkoopresultaten';
  if (view.type === 'project') return proj(view.id).name;
  if (view.type === 'agenda') return 'Agenda';
  if (view.type === 'btw') return 'BTW';
  if (view.type === 'sales') return salesPageById(view.id)?.title || 'Verkopen';
  return SMART.find(s => s[0] === view.type)[1];
}

/* ---------------- Field values ---------------- */
function optOf(f, id) { return f.options.find(o => o.id === id); }
function isEmpty(v) { return v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length); }
function displayValue(f, v) {
  if (isEmpty(v)) return '';
  switch (f.type) {
    case 'select': return optOf(f, v)?.label || '';
    case 'multiselect': return (Array.isArray(v) ? v : []).map(id => optOf(f, id)?.label).filter(Boolean).join(', ');
    case 'checkbox': return v ? 'Ja' : '';
    case 'date': return typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) ? dueLabel(v) : String(v);
    default: return String(v);
  }
}
// Ingevulde velden op de kaart: elk veld op een eigen regel ("Label: waarde").
function fieldLines(t) {
  const out = [];
  const line = (f, html) => out.push(`<div class="t-field"><span class="tf-l">${esc(f.name)}</span><span class="tf-v">${html}</span></div>`);
  const pill = o => `<span class="chip opt" style="--c:${o.color}">${esc(o.label)}</span>`;
  for (const f of fieldsFor(t.projectId)) {
    if (!f.showInList) continue;
    const v = t.custom[f.id];
    if (isEmpty(v)) continue;
    if (f.type === 'select') { const o = optOf(f, v); if (o) line(f, pill(o)); }
    else if (f.type === 'multiselect') { const os = (Array.isArray(v) ? v : []).map(id => optOf(f, id)).filter(Boolean); if (os.length) line(f, os.map(pill).join(' ')); }
    else if (f.type === 'checkbox') line(f, `${I.check} Ja`);
    else if (f.type === 'url') { const href = safeUrl(v); if (href) line(f, `<a href="${esc(href)}" target="_blank" rel="noopener" data-act="link">${esc(String(v).replace(/^https?:\/\//, ''))}</a>`); }
    else line(f, esc(displayValue(f, v)));
  }
  return out.length ? `<div class="t-fields">${out.join('')}</div>` : '';
}
function safeUrl(v) {
  let s = String(v).trim(); if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  return /^(https?|mailto|tel):/i.test(s) ? s : '';
}

/* ---------------- Task list ---------------- */
const projArchived = id => { const p = data.projects.find(p => p.id === id); return !!p?.finished; };
function viewTasks(includeDone) {
  const td = today(), wk = addDays(td, 6);
  return data.tasks.filter(t => {
    if (!includeDone && t.done) return false;
    if (view.type !== 'project' && projArchived(t.projectId)) return false;
    switch (view.type) {
      case 'inbox': return t.projectId === 'inbox' || !data.projects.some(p => p.id === t.projectId);
      case 'today': return t.done ? (t.doneAt && ymd(new Date(t.doneAt)) === td) : (t.due && t.due <= td);
      case 'upcoming': return t.due && t.due <= wk;
      case 'all': return true;
      case 'project': return t.projectId === view.id;
      default: return false;
    }
  });
}
// Opmerkingen staan als losse items in data.comments (per stuk gesynchroniseerd).
const commentsOf = tid => data.comments.filter(c => c.taskId === tid).sort((a, b) => a.at - b.at);
let ccMemo = {ref:null, len:-1, map:null};
function commentCount(tid) {
  if (ccMemo.ref !== data.comments || ccMemo.len !== data.comments.length) {
    const map = new Map(); for (const c of data.comments) map.set(c.taskId, (map.get(c.taskId) || 0) + 1);
    ccMemo = {ref:data.comments, len:data.comments.length, map};
  }
  return ccMemo.map.get(tid) || 0;
}
function stamp(ms) {
  const d = new Date(ms);
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} om ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function matchSearch(t, q) {
  if (!q) return true;
  q = q.toLowerCase();
  if (t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q)) return true;
  if (data.comments.some(c => c.taskId === t.id && String(c.text || '').toLowerCase().includes(q))) return true;
  if (data.activities.some(c=>c.taskId===t.id && [c.text,c.outcome,c.nextAction?.note].some(v=>String(v || '').toLowerCase().includes(q))))return true;
  return data.fields.some(f => displayValue(f, t.custom[f.id]).toLowerCase().includes(q));
}
// Bij een actieve sortering staan deals zonder deadline altijd bovenaan; de eigen (sleep)volgorde blijft zoals ze is
function taskSorter(key) {
  const f = sortFn(key);
  return key === 'manual' ? f : (a, b) => (!a.due === !b.due ? f(a, b) : a.due ? 1 : -1);
}
function sortFn(key) {
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  const dk = t => (t.due || '9999') + (t.time || '99:99');
  const byDue = (a, b) => dk(a) < dk(b) ? -1 : dk(a) > dk(b) ? 1 : 0;
  const tie = (...fs) => (a, b) => { for (const f of fs) { const r = f(a, b); if (r) return r; } return 0; };
  if (key === 'due' || key === 'priority') return tie(byDue, byOrder); // 'priority' = oude instelling
  if (key === 'title') return tie((a, b) => a.title.localeCompare(b.title, 'nl', {numeric:true}), byOrder);
  if (key === 'newest') return (a, b) => (b.order || 0) - (a.order || 0);
  if (key?.startsWith('f:')) {
    const f = fieldById(key.slice(2));
    if (!f) return byOrder;
    const val = t => {
      const v = t.custom[f.id];
      if (isEmpty(v)) return null;
      if (f.type === 'number') return Number(v);
      if (f.type === 'select') return f.options.findIndex(o => o.id === v);
      if (f.type === 'checkbox') return 0;
      return String(v).toLowerCase();
    };
    return tie((a, b) => {
      const x = val(a), y = val(b);
      if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1;
      return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'nl', {numeric:true});
    }, byOrder);
  }
  return byOrder;
}
// '', 'today', 'soon' (binnen 30 min), 'late' (datum of uur voorbij)
function dueState(t) {
  if (t.done || !t.due) return '';
  const td = today();
  if (t.due < td) return 'late';
  if (t.due > td) return '';
  if (!t.time) return 'today';
  const [h, m] = t.time.split(':').map(Number), at = new Date(); at.setHours(h, m, 0, 0);
  const diff = at - Date.now();
  return diff < 0 ? 'late' : diff <= 30 * 60000 ? 'soon' : 'today';
}
function taskMeta(t) {
  const meta = [];
  const action = crmEffectiveAction(t);
  if (!t.done && !crmDeadlineActionType(t) && action?.date) meta.push(`<span class="chip ${action.date < today() ? 'crm-late' : ''}">${esc(crmActionLabel(action.type))} · ${esc(dueLabel(action.date))}</span>`);
  if (t.due) {
    meta.push(`<span class="chip due ${dueState(t)}">${I.cal} ${esc(dueLabel(t.due))}${t.time ? ' ' + esc(t.time) : ''}</span>`);
  }
  if (view.type !== 'project' && t.projectId !== 'inbox' && view.type !== 'inbox') {
    const p = proj(t.projectId);
    meta.push(`<span class="chip"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</span>`);
  }
  if (t.notes) meta.push(`<span class="chip" title="Heeft notities">${I.note}</span>`);
  const nc = commentCount(t.id);
  if (nc) meta.push(`<span class="chip" title="${nc} opmerking${nc === 1 ? '' : 'en'}">${I.comment} ${nc}</span>`);
  return (meta.length ? `<div class="t-meta">${meta.join('')}</div>` : '') + fieldLines(t);
}
// icoon links boven op de kaart: emoji van het project, anders de beginletter in de projectkleur
function taskIcon(t) {
  const p = proj(t.projectId);
  return p.emoji ? `<span class="t-ico emo" aria-hidden="true">${esc(p.emoji)}</span>` : `<span class="t-ico" style="--c:${p.color}" aria-hidden="true">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>`;
}
function taskCard(t) {
  const ds = t.time ? dueState(t) : '';
  return `<article class="card ${t.id === selectedId ? 'sel' : ''} ${ds === 'soon' || ds === 'late' || ds === 'today' ? 'due-' + ds : ''}" data-id="${t.id}">
    ${taskIcon(t)}<div class="t-title">${esc(t.title) || '<span class="muted">(zonder titel)</span>'}</div>${taskMeta(t)}</article>`;
}

let boardExpanded = {}, listExpanded = {};
let tbOpen = false;
const DONE_LIMIT = 30, COL_LIMIT = 60;
function renderBoard() {
  const p = prefs();
  const all = crmFilteredTasks();
  const sorter = taskSorter(p.sort), plainSorter = sortFn(p.sort);
  const byDoneAt = (a, b) => (b.doneAt || 0) - (a.doneAt || 0);
  const scroll = $('.board')?.scrollLeft || 0;
  const hidden = new Set(p.hidden || []);
  const vis = stages().filter(st => !hidden.has(st.id)), hid = stages().filter(st => hidden.has(st.id));
  const count = id => all.filter(t => t.stage === id).length;
  const bar = `<div class="board-bar">
    ${vis.length > 1 ? `<div class="col-tabs" role="tablist">${vis.map(st => `<button type="button" data-jump="${st.id}" style="--c:${st.color}"><span class="dot"></span>${esc(st.label)}<b>${count(st.id)}</b></button>`).join('')}</div>` : ''}
    ${hid.length ? `<div class="hidden-cols"><span>Verborgen:</span>${hid.map(st => `<button type="button" data-showcol="${st.id}" style="--c:${st.color}" title="${esc(st.label)} weer tonen">${I.eye}${esc(st.label)}<b>${count(st.id)}</b></button>`).join('')}</div>` : ''}
  </div>`;
  const colHtml = st => {
    let ts = all.filter(t => t.stage === st.id).sort(st.done ? (p.sort === 'manual' ? byDoneAt : plainSorter) : sorter);
    const total = ts.length;
    let more = '';
    const lim = st.done ? DONE_LIMIT : COL_LIMIT;
    if (total > lim && !boardExpanded[st.id]) {
      ts = ts.slice(0, lim);
      more = `<button type="button" class="link col-more" data-more="${st.id}">Toon alle ${total}</button>`;
    }
    return `<section class="col ${st.done ? 'done-col' : ''}" data-stage="${st.id}" style="--c:${st.color}">
      <header><span class="dot"></span><span class="nm">${esc(st.label)}</span><span class="count">${total}</span><span class="grow"></span><span class="col-right">${st.done ? `<span class="badge" title="Kaarten in deze kolom tellen als afgewerkt" aria-label="afgewerkt">${I.check}</span>` : ''}<button type="button" class="icon-btn col-menu" data-colmenu="${st.id}" data-total="${total}" title="Meer" aria-label="Meer acties voor ${esc(st.label)}" aria-haspopup="menu"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button><button type="button" class="icon-btn col-plus" data-addtop="${st.id}" title="Nieuwe kaart in ${esc(st.label)}" aria-label="Nieuwe kaart in ${esc(st.label)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></span></header>
      <form class="col-add" data-stage="${st.id}" autocomplete="off"><input type="text" placeholder="+ Deal toevoegen" aria-label="Deal toevoegen aan ${esc(st.label)}" enterkeyhint="done"></form>
      <div class="cards" data-stage="${st.id}">${ts.map(taskCard).join('')}${total ? '' : '<div class="col-empty">Sleep deals hierheen</div>'}</div>
      ${more}
    </section>`;
  };
  // alleen de kolommen die echt veranderd zijn opnieuw tekenen: minder opmaak- en tekenwerk, en ingetypte tekst in andere kolommen blijft staan
  const cols = vis.map(colHtml), key = vis.map(st => st.id).join(',') + '|' + vis.length;
  const cur = $('.board');
  if (cur && cur.__key === key && cur.children.length === cols.length && cur.parentNode === $('#list')) {
    const barEl = $('.board-bar'); if (barEl) { const t = document.createElement('template'); t.innerHTML = bar.trim(); if (barEl.outerHTML !== t.content.firstElementChild.outerHTML) barEl.replaceWith(t.content.firstElementChild); }
    cols.forEach((h, i) => {
      const el = cur.children[i], rec = cur.__cols[i];
      if (rec && rec.h === h && el.outerHTML === rec.out) return;
      const keepScroll = el.querySelector('.cards')?.scrollTop || 0;
      const t = document.createElement('template'); t.innerHTML = h.trim();
      const nu = t.content.firstElementChild; el.replaceWith(nu);
      const c2 = nu.querySelector('.cards'); if (c2) c2.scrollTop = keepScroll;
      cur.__cols[i] = {h, out:nu.outerHTML};
    });
    cur.scrollLeft = scroll; cur.dispatchEvent(new Event('scroll'));
    return;
  }
  $('#list').innerHTML = bar + (vis.length ? '' : '<div class="empty">Alle kolommen zijn verborgen in deze weergave.</div>') + `<div class="board" style="--ncols:${vis.length}">${cols.join('')}</div>`;
  { const bd = $('.board'); bd.__key = key; bd.__cols = cols.map((h, i) => ({h, out:bd.children[i].outerHTML})); }
  const boardEl = $('.board');
  boardEl.scrollLeft = scroll;
  const markTab = () => {
    const cols = $$('.col', boardEl); if (!cols.length) return;
    const left = boardEl.getBoundingClientRect().left;
    let best = cols[0], bd = Infinity;
    for (const c of cols) { const d = Math.abs(c.getBoundingClientRect().left - left - 16); if (d < bd) { bd = d; best = c; } }
    $$('.col-tabs button').forEach(b => b.classList.toggle('on', b.dataset.jump === best.dataset.stage));
  };
  boardEl.addEventListener('scroll', () => requestAnimationFrame(markTab), {passive:true});
  markTab();
}
function setHiddenCols(ids) {
  const before = prefs().hidden || [];
  data.prefs[viewKey()] = {...(data.prefs[viewKey()] || {}), hidden:ids};
  commit();
  return before;
}
function renderMain() {
  if (view.type === 'sales' || isPageView()) return;
  $('.main-inner').classList.add('wide');
  const board = (data.settings.taskLayout || 'list') === 'board';
  $('#app').classList.toggle('board-mode', board);
  if (board) renderBoard(); else $('#list').innerHTML = crmCustomerListHtml();
}

/* ---------------- Sidebar / header / toolbar ---------------- */
const navArchOpen = {proj:false, sales:false, fin:false};
// Jaarmappen onder Verkopen: open/dicht per toestel onthouden; standaard is enkel het huidige jaar open.
let yearState = {};
try { yearState = JSON.parse(localStorage.getItem('taken.salesYears') || '{}'); } catch {}
const salesYearOpen = y => y in yearState ? yearState[y] : (y === today().slice(0, 4) || (view.type === 'sales' && (salesPageById(view.id)?.month || '').startsWith(y)));
function toggleSalesYear(y) {
  yearState[y] = !salesYearOpen(y);
  try { localStorage.setItem('taken.salesYears', JSON.stringify(yearState)); } catch {}
  renderNav();
}
function renderNav() {
  const open = data.tasks.filter(t => !t.done && !projArchived(t.projectId)), td = today(), wk = addDays(td, 6);
  const cnt = {
    inbox: open.filter(t => t.projectId === 'inbox' || !data.projects.some(p => p.id === t.projectId)).length,
    today: open.filter(t => t.due && t.due <= td).length,
    upcoming: open.filter(t => t.due && t.due <= wk).length,
    all: open.length,
  };
  $('#nav').innerHTML = '';
  const allOpen = data.tasks.filter(t => !t.done);
  const projItem = p => {
    const n = allOpen.filter(t => t.projectId === p.id).length;
    return `<button class="nav-item ${p.finished ? 'is-fin ' : ''}${view.type === 'project' && view.id === p.id ? 'on' : ''}" data-project="${p.id}"><span class="ico">${p.emoji ? `<span class="emo">${esc(p.emoji)}</span>` : `<span class="dot" style="background:${p.color}"></span>`}</span><span class="nm">${esc(p.name)}</span><span class="cnt">${p.finished ? I.check : n || ''}</span></button>`;
  };
  const salesItem = pg => `<button class="nav-item ${view.type === 'sales' && view.id === pg.id ? 'on' : ''}" data-sales="${pg.id}"><span class="ico">${I.sales}</span><span class="nm">${esc(pg.title)}</span><span class="cnt">${esc(eurShort(salesTotals(pg.id).money))}</span></button>`;
  const archList = (key, items, fn, label = 'Gearchiveerd') => !items.length ? '' :
    `<button type="button" class="nav-arch ${navArchOpen[key] ? 'open' : ''}" data-navarch="${key}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>${label} (${items.length})</button>${navArchOpen[key] ? items.map(fn).join('') : ''}`;
  const projs = sortedProjects().filter(p => p.id !== 'inbox'), pages = sortedSalesPages();
  $('#projNav').innerHTML = (projs.filter(p => !p.finished).map(projItem).join('') || '<div class="muted small" style="padding:4px 10px">Nog geen lopende projecten</div>')
    + archList('fin', projs.filter(p => p.finished), projItem, 'Afgewerkt');
  const years = new Map();
  for (const pg of pages) { const y = (pg.month || '').slice(0, 4) || '—'; if (!years.has(y)) years.set(y, []); years.get(y).push(pg); }
  const yearHtml = [...years].map(([y, list]) => {
    const open = salesYearOpen(y), sum = list.reduce((a, pg) => a + salesTotals(pg.id).money, 0);
    return `<button type="button" class="nav-year ${open ? 'open' : ''}" data-year="${esc(y)}" aria-expanded="${open}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg><span class="nm">${y === '—' ? 'Zonder maand' : esc(y)}</span><span class="cnt">${esc(eurShort(sum))}</span></button>`
      + (open ? `<div class="year-list">${list.map(salesItem).join('')}</div>` : '');
  }).join('');
  $('#salesNav').innerHTML = (yearHtml || '<div class="muted small" style="padding:4px 10px">Nog geen maandpagina’s</div>');
  $('#toolNav').innerHTML = [['today', 'Vandaag doen', I.today, crmAttentionTasks().length || ''], ['all', 'Klanten', I.all, open.length || ''], ['dashboard', 'Resultaten', I.sales, ''], ['agenda', 'Agenda', I.agenda, eventsSoon() || ''], ['btw', 'BTW', I.btw, '']]
    .filter(([k]) => !VIEW_FEATURE[k] || feat(VIEW_FEATURE[k]))
    .map(([k, label, ic, n]) => `<button class="nav-item ${view.type === k ? 'on' : ''}" data-view="${k}"><span class="ico">${ic}</span><span class="nm">${label}</span><span class="cnt">${n}</span></button>`).join('');
  const sOn = feat('sales'); $('#addSales').closest('.side-section').hidden = !sOn; $('#salesNav').hidden = !sOn;
  const tOn = [...$('#toolNav').children].length > 0; $('#toolNav').previousElementSibling.hidden = !tOn;
  renderSync();
}
function viewSubtitle() {
  const t = view.type;
  if (t === 'today') return 'Je klanten die vandaag aandacht nodig hebben.';
  if (t === 'dashboard') return 'Je omzet en resultaten per project.';
  if (['all', 'project', 'inbox', 'today', 'upcoming'].includes(t)) {
    const open = viewTasks(false).filter(x => !x.done), late = open.filter(x => x.due && x.due < today()).length;
    if (!open.length) return 'Geen klanten om op te volgen.';
    return `${open.length} ${open.length === 1 ? 'klant' : 'klanten'} om op te volgen${late ? ` · ${late} te laat` : ''}`;
  }
  if (t === 'btw') return 'Reken een bedrag om van of naar inclusief btw.';
  if (t === 'agenda') { const n = eventsSoon(); return n ? `${n} ${n === 1 ? 'datum' : 'data'} de komende 7 dagen` : 'Niets gepland de komende 7 dagen.'; }
  return '';
}
// Eerste keer: nog geen enkele deal, dan een duidelijke uitnodiging
function renderWelcome() {
  const el = $('#banner'); if (!el) return;
  const empty = !data.tasks.length && view.type === 'all';
  el.hidden = !empty;
  el.innerHTML = empty ? '<span><b>Nog geen klanten.</b> Begin met een naam. Daarna kun je contactgegevens en notities aanvullen.</span><button type="button" class="btn primary" data-qa>+ Eerste klant toevoegen</button>' : '';
}
function renderHead() {
  renderWelcome();
  const isP = view.type === 'project' || view.type === 'inbox' || view.type === 'sales';
  const color = view.type === 'project' ? proj(view.id).color : null;
  const pr = view.type === 'project' || view.type === 'inbox' ? proj(view.type === 'inbox' ? 'inbox' : view.id) : null;
  $('#viewTitle').innerHTML = `${pr?.emoji ? `<span class="emo">${esc(pr.emoji)}</span>` : color ? `<span class="dot" style="background:${color}"></span>` : ''}<span>${esc(viewTitle())}</span>`;
  $('#topDate').textContent = cap(new Date().toLocaleDateString('nl-BE', {weekday:'long', day:'numeric', month:'long'}));
  $('#viewSub').textContent = viewSubtitle();
  renderCalc();
  $('#editProject').hidden = !isP;
  const arch = view.type === 'sales' ? salesPageById(view.id) : view.type === 'project' ? data.projects.find(x => x.id === view.id) : null;
  const ab = $('#archBar'); ab.hidden = !arch?.finished;
  if (arch?.finished) ab.innerHTML = `<span>${I.check}Dit project is afgewerkt${arch.finishedAt ? ' op ' + new Date(arch.finishedAt).toLocaleDateString('nl-BE', {day:'numeric', month:'long', year:'numeric'}) : ''}.</span><span class="grow"></span><button type="button" class="btn" data-reopen>Heropenen</button>`;
  $('#editProject').title = 'Meer';
  document.title = 'Klose';   // nooit projectnamen in de tabnaam (browsergeschiedenis, schermdelen)
  $('#tbTitle').textContent = `${viewTitle()} — Klose`;
  $('#miniTitle').textContent = viewTitle();
  const add=$('#primaryAdd');add.hidden=['btw','dashboard'].includes(view.type);add.textContent=view.type==='sales'?'+ Verkoop toevoegen':view.type==='agenda'?'+ Datum toevoegen':'+ Klant toevoegen';
}
function renderToolbar() {
  $('#toolbar').classList.add('open');
  $('#toolbar').innerHTML = crmToolbarHtml();
}
function placeTabIndicator() {
  const on = $('#tabBar button.on'), ind = $('#tabBar .tb-ind');
  if (!on || !ind || !on.offsetWidth) return;
  ind.style.width = on.offsetWidth + 'px';
  ind.style.transform = `translateX(${on.offsetLeft}px)`;
  ind.classList.add('ready');
}
addEventListener('resize', () => placeTabIndicator());
function renderTabBar() {
  const type=view.type==='today'?'today':view.type==='sales'?'sales':view.type==='agenda'?'agenda':['btw','dashboard'].includes(view.type)?'more':'all';
  const slot=$('#tabSlot'),sales=feat('sales');slot.dataset.tab=sales?'sales':'agenda';slot.querySelector('.ti').innerHTML=sales?I.sales:I.agenda;slot.lastElementChild.textContent=sales?'Verkopen':'Agenda';slot.hidden=!sales && !feat('agenda');
  $$('#tabBar [data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===type));placeTabIndicator();
  $('#fab').hidden = true;
}
function renderAll() {
  if (!data) return;
  renderTabBar();
  if (view.type === 'sales' && !salesPageById(view.id)) view = {type:'all'};
  if (VIEW_FEATURE[view.type] && !feat(VIEW_FEATURE[view.type])) view = {type:'all'};
  const sales = view.type === 'sales';
  if (sales) selectedId = null;
  renderNav(); renderHead();
  for (const sel of ['#toolbar', '#list']) $(sel).hidden = sales;
  $('#salesPage').hidden = !sales;
  const page = isPageView();
  $('#pageView').hidden = !page;
  if (page) {
    for (const sel of ['#toolbar', '#list']) $(sel).hidden = true;
    $('.main-inner').classList.add('wide');
    $('#app').classList.remove('board-mode');
    renderPage();
    renderDetail();
    return;
  }
  if (sales) {
    $('.main-inner').classList.add('wide');
    $('#app').classList.remove('board-mode');
    renderSales();
    renderDetail();
    return;
  }
  const focused = document.activeElement?.id;
  if (focused !== 'tbSearch') renderToolbar();
  renderMain(); renderDetail();
}

/* ---------------- Quick add ---------------- */
function parseQuick(text) {
  let s = ' ' + text + ' ';
  const r = {due:null, time:null, projectId:null, stage:null, custom:{}, tokens:[]};
  // fn mag false teruggeven: dan blijft de tekst gewoon in de titel staan
  const take = (re, fn) => { const m = s.match(re); if (m && fn(m) !== false) { s = s.replace(re, ' '); return true; } return false; };
  for (const p of [...data.projects].sort((a, b) => b.name.length - a.name.length)) {
    if (take(new RegExp('\\s#' + escRe(p.name.replace(/\s+/g, '_')) + '(?=\\s)', 'i'), () => { r.projectId = p.id; r.tokens.push(['#' + p.name, p.color]); })) break;
    if (take(new RegExp('\\s#' + escRe(p.name) + '(?=\\s)', 'i'), () => { r.projectId = p.id; r.tokens.push(['#' + p.name, p.color]); })) break;
  }
  const stageWords = st => [st.label.toLowerCase().replace(/\s+/g, '_'), st.label.toLowerCase(), ...(STAGE_ALIASES[st.id] || [])];
  for (const st of [...stages()].sort((a, b) => b.label.length - a.label.length))
    if (take(new RegExp('\\s@(' + stageWords(st).map(escRe).join('|') + ')(?=\\s)', 'i'), () => { r.stage = st.id; r.tokens.push([st.label, st.color]); })) break;
  const opts = [];
  for (const f of data.fields) if (f.type === 'select' || f.type === 'multiselect') for (const o of f.options) opts.push([f, o]);
  opts.sort((a, b) => b[1].label.length - a[1].label.length);
  for (const [f, o] of opts) {
    const re = new RegExp('\\s@' + escRe(o.label) + '(?=\\s)', 'i');
    const re2 = new RegExp('\\s@' + escRe(o.label.replace(/\s+/g, '_')) + '(?=\\s)', 'i');
    const hit = m => {
      if (f.type === 'select') r.custom[f.id] = o.id;
      else r.custom[f.id] = [...new Set([...(r.custom[f.id] || []), o.id])];
      r.tokens.push([`${f.name}: ${o.label}`, o.color]);
    };
    take(re2, hit) || take(re, hit);
  }
  const td = today();
  const setDue = d => { r.due = d; r.tokens.push([dueLabel(d), null]); };
  take(/\s(?:om\s+)?(\d{1,2})(?:[:.](\d{2})|[uh](\d{2})?)(?=\s)/i, m => {
    const h = +m[1], mi = +(m[2] || m[3] || 0);
    if (h > 23 || mi > 59) return false;
    r.time = `${pad(h)}:${pad(mi)}`; r.tokens.push(['🕑 ' + r.time, null]);
  });
  take(/\s(vandaag|today)(?=\s)/i, () => setDue(td)) ||
  take(/\s(overmorgen)(?=\s)/i, () => setDue(addDays(td, 2))) ||
  take(/\s(morgen|tomorrow)(?=\s)/i, () => setDue(addDays(td, 1))) ||
  take(/\svolgende week(?=\s)/i, () => setDue(addDays(td, 7))) ||
  take(/\sover (\d{1,3}) (dag|dagen|week|weken)(?=\s)/i, m => setDue(addDays(td, +m[1] * (m[2].startsWith('we') ? 7 : 1)))) ||
  take(new RegExp('\\s(' + DAYS.join('|') + ')(?=\\s)', 'i'), m => {
    const target = DAYS.indexOf(m[1].toLowerCase()), cur = new Date().getDay();
    setDue(addDays(td, ((target - cur + 7) % 7) || 7));
  }) ||
  take(/\s(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s)/, m => {
    const dd = +m[1], mm = +m[2]; if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return false;
    // advertentieformaten (1/2, 1/4, 1/8, 1/12, 1/16, 1/32) zijn geen datum; 1 april typ je als 1/4/2026
    if (!m[3] && dd === 1 && [2, 4, 8, 12, 16, 32].includes(mm)) return false;
    let y = m[3] ? +m[3] : new Date().getFullYear(); if (y < 100) y += 2000;
    let d = ymd(new Date(y, mm - 1, dd));
    if (!m[3] && d < td) d = ymd(new Date(y + 1, mm - 1, dd));
    setDue(d);
  });
  if (r.time && !r.due) { r.due = td; r.tokens.push(['Vandaag', null]); }
  r.title = s.trim().replace(/\s+/g, ' ');
  return r;
}
function createTask(r, stage, top) {
  stage = stage || r.stage || firstOpen().id;
  const projectId = r.projectId || (view.type === 'project' ? view.id : 'inbox');
  const t = touch({
    id:uid(), title:r.title, notes:'', projectId,
    due:r.noDefaultDue ? r.due || null : r.due || (view.type === 'today' ? today() : null), time:r.time || null,
    stage, done:isDoneStage(stage), doneAt:isDoneStage(stage) ? now() : null,
    createdAt:now(), crmActivityAt:now(), order:now(), custom:r.custom,
  });
  // een deal zonder deadline komt helemaal bovenaan de kolom (nieuw werk dat nog opgepakt moet worden); met deadline onderaan zoals voorheen
  if (top || !t.due) { const os = data.tasks.filter(x => x.stage === stage).map(x => x.order || 0); if (os.length) t.order = Math.min(...os) - 1; }
  // filterwaarde van huidige weergave overnemen, zodat de deal zichtbaar blijft
  const p = prefs();
  if (p.ff && p.fv && p.fv !== '__empty') {
    const f = p.ff.startsWith('f:') ? fieldById(p.ff.slice(2)) : null;
    if (f && t.custom[f.id] === undefined) {
      if (f.type === 'select') t.custom[f.id] = p.fv;
      else if (f.type === 'multiselect') t.custom[f.id] = [p.fv];
      else if (f.type === 'checkbox') t.custom[f.id] = p.fv === '1';
    }
  }
  data.tasks.push(t);
  commit();
  if (crmDuplicates(t).length) toast('Mogelijk dubbele deal: bekijk de waarschuwing bij de deal.');
  if (!r.silent && !viewTasks(true).some(x => x.id === t.id)) toast(`Toegevoegd aan ${proj(projectId).name}`);
  return t;
}
/* ---------------- Task actions ---------------- */
// Verplaatst een kaart naar een kolom.
function setStage(t, st) {
  const wasLost = crmLostStage(t.stage), changed = t.stage !== st;
  if (isDoneStage(st) && (!t.done || changed)) t.doneAt = now();
  if (!isDoneStage(st)) t.doneAt = null;
  t.stage = st; t.done = isDoneStage(st); if (changed) t.crmActivityAt = now(); touch(t);
  if (changed && !wasLost && crmLostStage(st) && !t.lostReason) setTimeout(() => { if (taskById(t.id) && crmLostStage(t.stage) && !dlg.open) crmOpenLossDialog(t); }, 0);
}
function undoFor(t) {
  const id = t.id, prev = {stage:t.stage, done:t.done, due:t.due, doneAt:t.doneAt, order:t.order, crmActivityAt:t.crmActivityAt, lostReason:t.lostReason, lostNote:t.lostNote};
  return () => { const x = taskById(id); if (x) { Object.assign(x, prev); touch(x); commit(); } };
}
function stageToast(t, res, undo) {
  if (t.done) toast(`Afgewerkt: ${stageById(t.stage).label}`, undo);
}
/* ---- Beweging (apple-design): paneel schuift in en uit langs dezelfde kant.
   CSS-overgangen keren om vanaf de huidige waarde, dus heropenen tijdens het
   sluiten is onderbreekbaar zonder sprong. ---- */
let detailHideTimer = null;
function showDetailPanel() {
  const el = $('#detail'), app = $('#app');
  clearTimeout(detailHideTimer);
  const fresh = el.hidden;
  el.hidden = false; app.classList.add('with-detail'); document.body.classList.add('sheet-open');
  if (fresh) { el.classList.add('d-in'); el.getBoundingClientRect(); }
  el.classList.remove('d-in', 'd-out');
}
function hideDetailPanel() {
  const el = $('#detail'), app = $('#app');
  if (el.hidden) return;
  el.classList.add('d-out'); document.body.classList.remove('sheet-open');
  clearTimeout(detailHideTimer);
  detailHideTimer = setTimeout(() => {
    el.hidden = true; el.innerHTML = ''; el.classList.remove('d-out'); app.classList.remove('with-detail');
  }, 380);
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Kaart na het slepen met een lichte veer naar zijn plek laten zweven (FLIP):
// het gebaar had momentum, dus een klein beetje doorschot mag.
function settleCard(id, from) {
  if (!from || reduceMotion()) return;
  const el = $(`.card[data-id="${id}"]`); if (!el?.animate) return;
  const to = el.getBoundingClientRect();
  const dx = from.left - to.left, dy = from.top - to.top;
  if (Math.abs(dx) + Math.abs(dy) < 2) return;
  el.animate([
    {transform:`translate(${dx}px, ${dy}px) rotate(2deg) scale(1.03)`, boxShadow:'0 20px 44px rgba(0,0,0,.2)'},
    {transform:'none', boxShadow:'var(--shadow-card)'}
  ], {duration:460, easing:'cubic-bezier(.34,1.3,.64,1)'});
}
function toggleTask(id) {
  const t = taskById(id); if (!t) return;
  const undo = undoFor(t);
  const res = setStage(t, t.done ? firstOpen().id : firstDone().id);
  commit();
  if (t.done) {
    $(`[data-id="${id}"] .check`)?.classList.add('pop');
    navigator.vibrate?.(10);
  }
  stageToast(t, res, undo);
}
function deleteTask(id) {
  const t = taskById(id); if (!t) return;
  const copy = JSON.parse(JSON.stringify(t));
  data.tasks = data.tasks.filter(x => x.id !== id);
  tombstone(id);
  if (selectedId === id) selectedId = null;
  commit();
  toast('Deal verwijderd', () => { delete data.deleted[id]; data.tasks.push(touch(copy)); commit(); });
}
// de klik die een deal opent, mag het paneel niet meteen weer sluiten ('klik buiten = sluiten')
let detailJustOpened = false;
function openTask(id) { selectedId = id; detailJustOpened = true; setTimeout(() => detailJustOpened = false, 0); renderMain(); renderDetail(true); }
function closeDetail() { selectedId = null; renderMain(); renderDetail(true); }

/* ---------------- Detail panel ---------------- */
function fieldInput(f, t) {
  const v = t.custom[f.id];
  const lab = `<span title="${esc(f.name)}">${esc(f.name)}</span>`;
  const attrs = `data-field="${f.id}" aria-label="${esc(f.name)}"`;
  switch (f.type) {
    case 'text': return `<label class="prop">${lab}<input type="text" ${attrs} value="${esc(v ?? '')}"></label>`;
    case 'number': return `<label class="prop">${lab}<input type="number" step="any" ${attrs} value="${esc(v ?? '')}"></label>`;
    case 'date': return `<label class="prop">${lab}<input type="text" class="date-inp" ${attrs} value="${esc(fmtDateInp(v))}" placeholder="dd/mm/jjjj" autocomplete="off" role="combobox" aria-haspopup="dialog" aria-expanded="false"></label>`;
    case 'url': {
      const href = v ? safeUrl(v) : '';
      return `<label class="prop">${lab}<span class="inline"><input type="url" ${attrs} value="${esc(v ?? '')}" placeholder="https://…">${href ? `<a class="icon-btn" href="${esc(href)}" target="_blank" rel="noopener" title="Openen">${I.link}</a>` : ''}</span></label>`;
    }
    case 'checkbox': return `<label class="prop">${lab}<input type="checkbox" ${attrs} ${v ? 'checked' : ''}></label>`;
    case 'select': return `<label class="prop">${lab}<select ${attrs}><option value="">—</option>${f.options.map(o => `<option value="${o.id}" ${o.id === v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
    case 'multiselect': {
      const sel = Array.isArray(v) ? v : [];
      return `<div class="prop">${lab}<div class="multi">${f.options.map(o => `<button type="button" data-multi="${f.id}" data-opt="${o.id}" class="${sel.includes(o.id) ? 'on' : ''}" style="--c:${o.color}">${esc(o.label)}</button>`).join('') || '<span class="muted small">Geen opties</span>'}</div></div>`;
    }
  }
  return '';
}
function renderDetail(force) {
  const el = $('#detail'), app = $('#app');
  const t = selectedId && taskById(selectedId);
  if (!t) { hideDetailPanel(); return; }
  if (!force && el.contains(document.activeElement) && document.activeElement !== el) return;
  showDetailPanel();
  const p = proj(t.projectId), fs = fieldsFor(t.projectId);
  const created = new Date(t.createdAt || t.order || now());
  const wide = detailIsWide(detailWidth());
  const keep = el.dataset.tid === t.id ? focusKey(document.activeElement, el) : null;   // zelfde deal opnieuw tekenen: focus (en dus Tab) mag niet verloren gaan
  el.dataset.tid = t.id;
  el.innerHTML = `
    <div class="d-grab" aria-hidden="true"></div>
    <div class="d-resize" role="separator" aria-orientation="vertical" tabindex="0" title="Sleep om het paneel breder of smaller te maken (dubbelklik = standaard)" aria-label="Breedte van het paneel aanpassen"></div>
    <div class="d-head">
      <button class="icon-btn" data-act="close" aria-label="Sluiten">${I.close}</button>
      <span class="crumb"><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${p.color}"></span>${esc(p.name)}</span>
      <button class="icon-btn d-expand" data-act="expand" title="${wide ? 'Verkleinen' : 'Vergroten'}" aria-label="${wide ? 'Paneel verkleinen' : 'Paneel vergroten'}">${wide ? I.shrink : I.expand}</button>
      <button class="icon-btn" data-act="more" title="Meer" aria-label="Meer acties" aria-haspopup="menu"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
    </div>
    <div class="d-body">
      <div class="d-title-row">
        <textarea id="dTitle" rows="1" aria-label="Naam van klant of taak">${esc(t.title)}</textarea>
      </div>
      <div id="crmDuplicates">${crmDuplicateHtml(t)}</div>
      <label class="crm-status-label">Status<select id="dStage" class="crm-focus-status" aria-label="Status">${stages().map(x => `<option value="${x.id}" ${x.id === t.stage ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label><p class="crm-autosave-note">Wijzigingen worden automatisch bewaard.</p>
      ${crmTabsHtml(t)}
      <section id="crmPanel-overview" role="tabpanel" aria-labelledby="crmTab-overview" data-crm-panel="overview" ${crmDetailTabs[t.id] && crmDetailTabs[t.id]!=='overview' ? 'hidden' : ''}>
      ${crmFocusHtml(t)}
      ${crmContactSummaryHtml(t)}
      ${t.wonAt && data.sales.some(r => r.id === 'w_' + t.id) ? `<p class="muted small d-sale">Staat als verkoop in <button type="button" class="link" data-act="gosales">${esc(salesPageById(data.sales.find(r => r.id === 'w_' + t.id).pageId)?.title || 'Verkopen')}</button>.</p>` : ''}
      </section>
      <section id="crmPanel-notes" role="tabpanel" aria-labelledby="crmTab-notes" data-crm-panel="notes" ${crmDetailTabs[t.id]==='notes' ? '' : 'hidden'}>${crmDetailHtml(t)}</section>
      <section id="crmPanel-data" role="tabpanel" aria-labelledby="crmTab-data" data-crm-panel="data" ${crmDetailTabs[t.id]==='data' ? '' : 'hidden'}>
        <div class="props">
        ${t.notes ? `<label class="prop"><span>Notities</span><textarea id="dNotes" rows="2" aria-label="Notities">${esc(t.notes)}</textarea></label>` : ''}
        <label class="prop"><span>Project</span><select id="dProject">${sortedProjects().map(x => `<option value="${x.id}" ${x.id === t.projectId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        </div>
        ${!crmDeadlineActionType(t) ? crmDeadlineFieldsHtml(t) : ''}
        ${crmLostStage(t.stage) ? `<div class="crm-loss"><b>Verliesreden: ${esc(t.lostReason || 'Nog niet opgegeven')}</b>${t.lostNote ? `<p>${esc(t.lostNote)}</p>` : ''}<button type="button" class="link" data-crm-loss="${esc(t.id)}">Reden aanpassen</button></div>` : ''}
        <div class="d-sec"><span>Extra gegevens</span><button class="link" data-act="fields">Extra gegevens beheren</button></div>
        <div class="props">${fs.map(f => fieldInput(f, t)).join('') ||
          `<p class="muted small" style="margin:0">Nog geen extra gegevens voor dit project. <button class="link" data-act="newfield">Toevoegen</button></p>`}</div>
        <div class="crm-focus-danger"><button type="button" class="btn danger" data-act="deletetask">Klant verwijderen</button><p class="muted small">Aangemaakt op ${created.getDate()} ${MONTHS[created.getMonth()]} ${created.getFullYear()}</p></div>
      </section>
    </div>`;
  autosize($('#dTitle'));
  $('#crmDeadlineEdit')?.addEventListener('toggle', e => { if (e.target.isConnected) crmFocusOpen.deadline[t.id] = e.target.open; });
  if (keep) restoreFocus(el, keep);
}
// Sleutel van het element met focus: id, veld of knop; zo vinden we het na het hertekenen terug
function focusKey(a, root) {
  if (!a || a === root || !root.contains(a)) return null;
  const d = a.dataset || {};
  const sel = a.id ? '#' + CSS.escape(a.id) : d.field ? `[data-field="${d.field}"]` : d.multi ? `[data-multi="${d.multi}"][data-opt="${String(d.opt || '').replace(/"/g, '\\"')}"]` : d.act ? `[data-act="${d.act}"]` : null;
  if (!sel) return null;
  let pos = null; try { if (a.selectionStart != null) pos = [a.selectionStart, a.selectionEnd]; } catch {}
  return {sel, pos};
}
function restoreFocus(root, k) {
  const n = root.querySelector(k.sel); if (!n) return;
  n.focus({preventScroll:true});
  try { if (k.pos && n.setSelectionRange) n.setSelectionRange(k.pos[0], k.pos[1]); } catch {}
}
const commentDrafts = {};
/* ---- Afbeeldingen bij opmerkingen: verkleind en als JPEG in de versleutelde kluis bewaard (metadata zoals locatie verdwijnt) ---- */
const pendingImgs = {}, IMG_MAX = 6, IMG_EDGE = 1600;
const IMG_OK = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
const imgsHtml = (imgs, act) => { const ok = (imgs || []).filter(u => IMG_OK.test(u)); return ok.length ? `<div class="c-imgs">${ok.map((u, i) => `<button type="button" class="c-img" data-act="${act}" data-i="${i}" aria-label="Afbeelding vergroten"><img src="${u}" alt="Bijlage ${i + 1}" loading="lazy"></button>`).join('')}</div>` : ''; };
const pendingHtml = tid => (pendingImgs[tid] || []).map((u, i) => `<span class="c-thumb"><img src="${u}" alt="Bijlage ${i + 1}"><button type="button" class="c-x" data-act="unattach" data-i="${i}" aria-label="Afbeelding verwijderen">×</button></span>`).join('');
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, IMG_EDGE / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  return cv.toDataURL('image/jpeg', 0.82);
}
async function attachImages(t, files) {
  crmImageLoading[t.id] = (crmImageLoading[t.id] || 0) + 1;
  const updateSave = () => {
    if (selectedId !== t.id) return;
    const button = $('#detail [data-act="addcomment"]');
    if (button) { button.disabled = !!crmImageLoading[t.id]; button.textContent = button.disabled ? 'Afbeelding verwerken…' : 'Notitie bewaren'; }
  };
  updateSave();
  try {
  const list = pendingImgs[t.id] ||= [];
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    if (list.length >= IMG_MAX) { toast(`Maximaal ${IMG_MAX} afbeeldingen per opmerking`); break; }
    try { const image = await shrinkImage(f); if (list.length < IMG_MAX) list.push(image); } catch { toast('Deze afbeelding kan niet gelezen worden'); }
  }
  const el = $('#dPending'); if (el && selectedId === t.id) el.innerHTML = pendingHtml(t.id);
  if (list.length && selectedId === t.id) {
    crmSelectDetailTab('notes');
  }
  } finally { crmImageLoading[t.id]--; updateSave(); }
}
function openLightbox(imgs, i) {
  const ok = imgs.filter(u => IMG_OK.test(u)); if (!ok.length) return;
  let full = false;
  const lb = document.createElement('div'); lb.id = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Afbeelding');
  lb.innerHTML = '<div class="lb-stage"><img alt=""></div><button type="button" class="lb-btn lb-x" aria-label="Sluiten">×</button><button type="button" class="lb-btn lb-prev" aria-label="Vorige">‹</button><button type="button" class="lb-btn lb-next" aria-label="Volgende">›</button><span class="lb-n"></span>';
  const img = lb.querySelector('img'), prev = lb.querySelector('.lb-prev'), next = lb.querySelector('.lb-next');
  const show = n => { i = (n + ok.length) % ok.length; img.src = ok[i]; full = false; lb.classList.remove('full'); lb.querySelector('.lb-n').textContent = ok.length > 1 ? `${i + 1} / ${ok.length}` : ''; prev.hidden = next.hidden = ok.length < 2; };
  const close = () => { lb.remove(); removeEventListener('keydown', onKey, true); };
  const onKey = e => {
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(i - 1); else if (e.key === 'ArrowRight') show(i + 1); else return;
    e.preventDefault(); e.stopImmediatePropagation();
  };
  lb.addEventListener('click', e => {
    if (e.target.closest('.lb-x')) close(); else if (e.target.closest('.lb-prev')) show(i - 1); else if (e.target.closest('.lb-next')) show(i + 1);
    else if (e.target === img) { full = !full; lb.classList.toggle('full', full); } else close();
  });
  addEventListener('keydown', onKey, true);
  document.body.appendChild(lb); show(i); lb.querySelector('.lb-x').focus();
}
function addComment(t) {
  if (crmImageLoading[t.id]) return;
  const ta = $('#dComment'), imgs = pendingImgs[t.id] || [];
  try { crmSaveNote(t, ta?.value, imgs, $('#crmNoteDate')?.value || ''); }
  catch(e) { $('#crmNoteError').textContent = e.message; ta?.focus(); return; }
  delete commentDrafts[t.id]; delete pendingImgs[t.id]; delete crmNoteDates[t.id];
  save(); renderNav(); renderMain(); renderDetail(true);
  $('#crmNoteSaved').textContent = 'Notitie bewaard.';
  $('#dComment')?.focus();
}
function deleteComment(cid) {
  const c = data.comments.find(x => x.id === cid); if (!c) return;
  const copy = {...c};
  data.comments = data.comments.filter(x => x.id !== cid); tombstone(cid);
  save(); renderMain(); renderDetail(true);
  toast('Opmerking verwijderd', () => { delete data.deleted[cid]; data.comments.push(touch(copy)); save(); renderMain(); renderDetail(true); });
}
$('#detail').addEventListener('change', e => { if (e.target.id !== 'dFile') return; const t = taskById(selectedId); if (t) attachImages(t, [...e.target.files]); e.target.value = ''; });
$('#detail').addEventListener('paste', e => {
  if (e.target.id !== 'dComment') return; const t = taskById(selectedId); if (!t) return;
  const files = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type)); if (!files.length) return;
  e.preventDefault(); attachImages(t, files);
});
$('#detail').addEventListener('dragover', e => { if (e.target.closest?.('.c-new') && e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
$('#detail').addEventListener('drop', e => {
  if (!e.target.closest?.('.c-new')) return; const t = taskById(selectedId); if (!t) return;
  e.preventDefault(); attachImages(t, [...(e.dataTransfer?.files || [])]);
});
function autosize(ta) { if (!ta) return; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; }
function setCustom(t, fid, val) {
  if (isEmpty(val)) delete t.custom[fid]; else t.custom[fid] = val;
  touch(t);
}
/* ---- Breedte van het detailpaneel (per toestel onthouden) ---- */
const DETAIL_DEFAULT = 400, DETAIL_MIN = 340, DETAIL_WIDE = 640, DETAIL_KEY = 'taken.detailWidth';
// in de bordweergave schuift het paneel over het bord en mag het breder; anders blijft er ruimte voor de lijst
function detailMax() { return Math.max(DETAIL_MIN, innerWidth - ($('#app').classList.contains('board-mode') ? 300 : 630)); }
const detailIsWide = w => w >= Math.min(DETAIL_WIDE, detailMax()) - 1;
function detailWidth() {
  const v = parseInt(getComputedStyle($('#app')).getPropertyValue('--detail-w'), 10);
  return v || DETAIL_DEFAULT;
}
function setDetailWidth(w, persist) {
  w = Math.round(Math.min(detailMax(), Math.max(DETAIL_MIN, w)));
  $('#app').style.setProperty('--detail-w', w + 'px');
  const btn = $('#detail .d-expand');
  if (btn) {
    const wide = detailIsWide(w);
    btn.innerHTML = wide ? I.shrink : I.expand;
    btn.title = wide ? 'Verkleinen' : 'Vergroten';
    btn.setAttribute('aria-label', wide ? 'Paneel verkleinen' : 'Paneel vergroten');
  }
  if (persist) { try { localStorage.setItem(DETAIL_KEY, String(w)); } catch {} }
}
try {
  const w = parseInt(localStorage.getItem(DETAIL_KEY), 10);
  if (w >= DETAIL_MIN) $('#app').style.setProperty('--detail-w', Math.min(w, innerWidth - 300) + 'px');
} catch {}
addEventListener('resize', () => { if (detailWidth() > detailMax()) setDetailWidth(detailMax()); });
{
  let rs = null;
  document.addEventListener('pointerdown', e => {
    const h = e.target.closest('.d-resize'); if (!h || e.button > 0) return;
    e.preventDefault();
    rs = {id:e.pointerId};
    h.setPointerCapture?.(e.pointerId);
    document.body.classList.add('resizing');
  });
  document.addEventListener('pointermove', e => {
    if (!rs) return;
    // het paneel staat rechts: breedte = afstand van de muis tot de rechterrand
    setDetailWidth(innerWidth - e.clientX);
  });
  const end = () => { if (!rs) return; rs = null; document.body.classList.remove('resizing'); setDetailWidth(detailWidth(), true); };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('dblclick', e => { if (e.target.closest('.d-resize')) setDetailWidth(DETAIL_DEFAULT, true); });
  document.addEventListener('keydown', e => {
    if (!e.target.closest?.('.d-resize')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setDetailWidth(detailWidth() + (e.key === 'ArrowLeft' ? 40 : -40), true);
    }
  });
}
/* ---- Gsm: detailpaneel als sheet, naar beneden vegen om te sluiten ----
   1:1 met de vinger, rubberband naar boven, bij loslaten de snelheid
   projecteren (zoals iOS) om te beslissen: sluiten of terugveren. */
{
  const mq = matchMedia('(max-width:860px)');
  let sd = null;
  const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);
  const rubber = (x, dim, c = 0.55) => (x * dim * c) / (dim + c * Math.abs(x));
  document.addEventListener('pointerdown', e => {
    if (!mq.matches) return;
    const zone = e.target.closest('#detail .d-grab, #detail .d-head');
    if (!zone || e.target.closest('button, input, select, textarea, a')) return;
    const el = $('#detail');
    sd = {el, y0:e.clientY, dy:0, hist:[{y:e.clientY, t:e.timeStamp}], moved:false, h:el.getBoundingClientRect().height};
  });
  document.addEventListener('pointermove', e => {
    if (!sd) return;
    let dy = e.clientY - sd.y0;
    if (!sd.moved && Math.abs(dy) < 6) return;
    if (!sd.moved) { sd.moved = true; sd.el.style.transition = 'none'; }
    if (dy < 0) dy = -rubber(-dy, sd.h);
    sd.dy = dy;
    sd.el.style.transform = `translateY(${dy}px)`;
    sd.hist.push({y:e.clientY, t:e.timeStamp}); if (sd.hist.length > 6) sd.hist.shift();
  });
  const end = () => {
    if (!sd) return;
    const {el, dy, hist, moved, h} = sd; sd = null;
    if (!moved) return;
    const a = hist[0], b = hist[hist.length - 1];
    const v = b.t > a.t ? (b.y - a.y) / (b.t - a.t) * 1000 : 0;   // px/s
    const close = dy + project(v) > h * 0.35 && v > -200;
    el.style.transition = ''; el.style.transform = '';          // CSS-overgang neemt het over vanaf de huidige plek
    if (close) { justSwiped = true; setTimeout(() => justSwiped = false, 80); closeDetail(); }
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('touchmove', e => { if (sd?.moved) e.preventDefault(); }, {passive:false});
}
let justSwiped = false;
/* ---- Klik buiten het detailpaneel = sluiten ----
   Alleen als de klik ook buiten het paneel begon (tekst selecteren en erbuiten
   loslaten sluit dus niet). Kaarten openen zichzelf, vensters en slepen tellen niet. */
{
  let downOutside = false;
  document.addEventListener('pointerdown', e => {
    downOutside = !e.target.closest('#detail, #timePop, #datePop, #ctxMenu');
  }, true);
  document.addEventListener('click', e => {
    if (!selectedId || !downOutside || justDragged || justSwiped || detailJustOpened || drag || dlg.open) return;
    if (document.body.classList.contains('resizing')) return;
    if (e.target.closest('#detail, #dlg, #lightbox, #toast, .card, .task, [data-act], #lock')) return;
    closeDetail();
  });
}
$('#main').addEventListener('scroll', e => {
  $('.main-head')?.classList.toggle('scrolled', e.currentTarget.scrollTop > 4);
}, {passive:true});
const detail = $('#detail');
detail.addEventListener('input', e => {
  const t = taskById(selectedId); if (!t) return;
  const el = e.target;
  if (el.id === 'dComment') { commentDrafts[t.id] = el.value; autosize(el); return; }
  if (el.id === 'dTitle') { t.title = el.value.replace(/\n/g, ' '); autosize(el); }
  else if (el.id === 'dNotes') t.notes = el.value;
  else if (el.dataset.field && ['text','url','number'].includes(el.type)) {
    const f = fieldById(el.dataset.field);
    setCustom(t, f.id, f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value);
  } else return;
  touch(t); save(true); renderMain(); renderNav();
});
let detailDirty = false;
detail.addEventListener('focusout', e => {
  if (e.target.id === 'dTime') setTimeout(() => { if (document.activeElement !== e.target && !timePop?.contains(document.activeElement)) commitTime(e.target, true); }, 0);
  if (!detailDirty) return;
  setTimeout(() => {
    if (!detailDirty || (detail.contains(document.activeElement) && document.activeElement !== detail)) return;
    detailDirty = false; renderDetail(true);
  }, 0);
});

/* ---- Kalender voor datumvelden: typen mag ook ("30/9", "30-09-2026", "morgen", "vrijdag") ---- */
const fmtDateInp = v => /^\d{4}-\d\d-\d\d$/.test(v || '') ? v.split('-').reverse().join('/') : '';
const MONTH_IDX = {jan:0, feb:1, maa:2, mrt:2, apr:3, mei:4, jun:5, jul:6, aug:7, sep:8, okt:9, oct:9, nov:10, dec:11};
function validYmd(y, m, d) { const dt = new Date(y, m - 1, d); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && y >= 2000 && y <= 2099 ? ymd(dt) : null; }
function parseDateText(v) {
  v = String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!v) return '';
  const td = today(), y0 = +td.slice(0, 4);
  if (v === 'vandaag' || v === 'vd') return td;
  if (v === 'morgen') return addDays(td, 1);
  if (v === 'overmorgen') return addDays(td, 2);
  if (v === 'volgende week') return addDays(td, 7);
  const wi = DAYS.findIndex(d => d === v || d.slice(0, 2) === v || d.slice(0, 3) === v);
  if (wi >= 0) { const cur = parseYmd(td).getDay(); return addDays(td, ((wi - cur + 7) % 7) || 7); }
  let m;
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return validYmd(+m[1], +m[2], +m[3]);
  if ((m = v.match(/^(\d{1,2})[\/\-. ](\d{1,2})(?:[\/\-. ](\d{2}|\d{4}))?$/))) return validYmd(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y0, +m[2], +m[1]);
  if ((m = v.match(/^(\d{1,2}) ?([a-z]{3})[a-z]*\.?(?: (\d{4}))?$/)) && m[2] in MONTH_IDX) return validYmd(m[3] ? +m[3] : y0, MONTH_IDX[m[2]] + 1, +m[1]);
  if ((m = v.match(/^(\d{2})(\d{2})(\d{2}|\d{4})?$/))) return validYmd(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y0, +m[2], +m[1]);
  return null;
}
let datePop = null, dateInp = null, dateState = null;
function closeDatePop() { datePop?.remove(); datePop = null; dateInp?.setAttribute('aria-expanded', 'false'); dateInp = null; }
function dateValueOf(inp) {
  const t = taskById(selectedId); if (!t) return '';
  if (inp.id === 'dDue') return t.due || '';
  const v = inp.dataset.field ? t.custom[inp.dataset.field] : ''; return typeof v === 'string' ? v : '';
}
function drawDatePop() {
  if (!datePop) return;
  const {month, hi, sel} = dateState, [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1), start = new Date(first); start.setDate(1 - (first.getDay() + 6) % 7);
  const td = today(), days = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(ymd(d)); }
  datePop.innerHTML = `
    <div class="dp-head"><button type="button" class="icon-btn" data-dnav="-1" aria-label="Vorige maand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
      <b>${cap(MONTHS_LONG[mo - 1])} ${y}</b>
      <button type="button" class="icon-btn" data-dnav="1" aria-label="Volgende maand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button></div>
    <div class="dp-grid" role="grid">${['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(d => `<span class="dp-wd">${d}</span>`).join('')}
      ${days.map(d => { const dt = parseYmd(d); return `<button type="button" role="gridcell" tabindex="-1" data-date="${d}" class="${d.slice(0, 7) !== month ? 'out ' : ''}${d === td ? 'today ' : ''}${d === sel ? 'sel ' : ''}${d === hi ? 'hi ' : ''}${dt.getDay() % 6 === 0 ? 'we' : ''}" aria-label="${dayLabel(d)}" aria-selected="${d === sel}">${dt.getDate()}</button>`; }).join('')}</div>
    <div class="dp-foot"><button type="button" data-dquick="${td}">Vandaag</button><button type="button" data-dquick="${addDays(td, 1)}">Morgen</button><button type="button" data-dquick="${addDays(td, 7)}">Volgende week</button><span class="grow"></span><button type="button" class="dp-clear" data-dquick="">Wissen</button></div>`;
  placeDatePop();
}
function placeDatePop() {
  if (!datePop || !dateInp) return;
  const rc = dateInp.getBoundingClientRect(), vh = window.visualViewport?.height || innerHeight;
  const w = datePop.offsetWidth, h = datePop.offsetHeight, below = vh - rc.bottom - 8;
  datePop.style.left = Math.max(8, Math.min(rc.right - w, innerWidth - w - 8)) + 'px';
  datePop.style.top = (below >= h || rc.top < h + 12 ? Math.min(rc.bottom + 4, Math.max(8, vh - h - 8)) : rc.top - h - 4) + 'px';
}
function openDatePop(inp) {
  closeDatePop(); closeTimePop?.();
  dateInp = inp;
  const sel = dateValueOf(inp), hi = sel || today();
  dateState = {sel, hi, month:hi.slice(0, 7)};
  datePop = document.createElement('div');
  datePop.id = 'datePop'; datePop.setAttribute('role', 'dialog'); datePop.setAttribute('aria-label', 'Datum kiezen');
  document.body.appendChild(datePop);
  inp.setAttribute('aria-expanded', 'true');
  datePop.addEventListener('pointerdown', e => e.preventDefault());   // focus blijft in het veld
  datePop.addEventListener('click', e => {
    const nav = e.target.closest('[data-dnav]');
    if (nav) { const [y, m] = dateState.month.split('-').map(Number), d = new Date(y, m - 1 + +nav.dataset.dnav, 1); dateState.month = ymd(d).slice(0, 7); drawDatePop(); return; }
    const b = e.target.closest('[data-date],[data-dquick]'); if (!b) return;
    const v = b.dataset.date ?? b.dataset.dquick;
    inp.value = fmtDateInp(v); commitDate(inp);
  });
  drawDatePop();
}
function commitDate(inp, fromBlur) {
  const t = taskById(selectedId);
  const same = inp === dateInp;
  if (!t || !inp.isConnected) { if (same) closeDatePop(); return; }
  const v = parseDateText(inp.value);
  if (same) closeDatePop();
  const cur = dateValueOf(inp);
  if (v === null) { inp.value = fmtDateInp(cur); if (!fromBlur) toast('Onbekende datum — typ bv. 30/9, 30-09-2026, morgen of vrijdag'); return; }
  if (v === cur) { inp.value = fmtDateInp(cur); if (!fromBlur) inp.blur(); return; }
  if (inp.id === 'dDue') { t.due = v || null; if (!t.due) t.time = null; }
  else if (inp.dataset.field) setCustom(t, inp.dataset.field, v);
  touch(t); save(); renderNav(); renderMain();
  if (fromBlur) detailDirty = true; else { inp.blur(); renderDetail(true); }
}
let dateFreshFocus = false;
detail.addEventListener('focusin', e => { if (e.target.classList?.contains('date-inp')) { dateFreshFocus = true; openDatePop(e.target); e.target.select(); } });
detail.addEventListener('mouseup', e => { if (e.target.classList?.contains('date-inp') && dateFreshFocus) { e.preventDefault(); e.target.select(); } dateFreshFocus = false; });
detail.addEventListener('input', e => {
  if (!e.target.classList?.contains('date-inp')) return;
  if (!datePop) openDatePop(e.target);
  const v = parseDateText(e.target.value);
  if (v) { dateState.hi = v; dateState.month = v.slice(0, 7); drawDatePop(); }
});
detail.addEventListener('focusout', e => {
  if (!e.target.classList?.contains('date-inp')) return;
  const inp = e.target;
  setTimeout(() => { if (document.activeElement !== inp) commitDate(inp, true); }, 0);
});
detail.addEventListener('keydown', e => {
  const inp = e.target; if (!inp.classList?.contains('date-inp')) return;
  const move = n => { if (!datePop) openDatePop(inp); dateState.hi = addDays(dateState.hi, n); dateState.month = dateState.hi.slice(0, 7); inp.value = fmtDateInp(dateState.hi); drawDatePop(); };
  if (e.key === 'ArrowDown') { e.preventDefault(); move(e.altKey ? 7 : 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(e.altKey ? -7 : -1); }
  else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); const d = parseYmd(dateState.hi); d.setMonth(d.getMonth() + (e.key === 'PageDown' ? 1 : -1)); move(Math.round((d - parseYmd(dateState.hi)) / 86400000)); }
  else if (e.key === 'Enter') { e.preventDefault(); commitDate(inp); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = fmtDateInp(dateValueOf(inp)); closeDatePop(); inp.blur(); }
  else if (e.key === 'Tab') commitDate(inp, true);
}, true);
addEventListener('pointerdown', e => { if (datePop && !datePop.contains(e.target) && e.target !== dateInp) closeDatePop(); }, true);
detail.addEventListener('scroll', () => placeDatePop(), true);
addEventListener('resize', () => placeDatePop());
window.visualViewport?.addEventListener('resize', () => placeDatePop());
/* ---- Uurkiezer: lijst per kwartier, vrij typen mag ook ("14", "930", "14u30", "14:30") ---- */
function parseTimeText(v) {
  v = String(v || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!v) return '';
  let m = v.match(/^(\d{1,2})(?:[:.hu](\d{1,2})?)?u?$/) || v.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = m[2] === undefined ? 0 : +m[2];
  if (h > 23 || mi > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}
const QUARTERS = Array.from({length:96}, (_, i) => String(Math.floor(i / 4)).padStart(2, '0') + ':' + String(i % 4 * 15).padStart(2, '0'));
let timePop = null, timeHi = -1;
function closeTimePop() { timePop?.remove(); timePop = null; timeHi = -1; $('#dTime')?.setAttribute('aria-expanded', 'false'); }
function timeTarget(inp) {
  // welk kwartier hoort bij wat er staat/getypt wordt; anders het eerstvolgende kwartier vanaf nu
  const v = inp.value.trim();
  const p = parseTimeText(v.length >= 3 || v.includes(':') ? v : v + ':00');
  let mins;
  if (p) { const [h, m] = p.split(':').map(Number); mins = h * 60 + m; }
  else if (/^\d{1,2}$/.test(v) && +v < 24) mins = +v * 60;
  else { const d = new Date(); mins = d.getHours() * 60 + d.getMinutes(); if (mins < 7 * 60) mins = 9 * 60; }
  return Math.min(95, Math.ceil(mins / 15));
}
function placeTimePop(inp) {
  if (!timePop) return;
  const rc = inp.getBoundingClientRect(), vh = window.visualViewport?.height || innerHeight;
  const h = Math.min(260, timePop.scrollHeight), below = vh - rc.bottom - 8;
  timePop.style.left = Math.max(8, Math.min(rc.left, innerWidth - timePop.offsetWidth - 8)) + 'px';
  timePop.style.top = (below >= Math.min(h, 160) ? rc.bottom + 4 : Math.max(8, rc.top - h - 4)) + 'px';
  timePop.style.maxHeight = Math.max(140, below >= Math.min(h, 160) ? below : rc.top - 12) + 'px';
}
function highlightTime(i, scroll) {
  if (!timePop) return;
  timeHi = i;
  timePop.querySelectorAll('button').forEach((b, j) => { b.classList.toggle('hi', j === i); b.setAttribute('aria-selected', j === i); });
  const b = timePop.children[i];
  if (b && scroll) timePop.scrollTop = b.offsetTop - timePop.clientHeight / 2 + b.offsetHeight / 2;
}
function openTimePop(inp) {
  closeTimePop();
  const pop = timePop = document.createElement('div');
  pop.id = 'timePop'; pop.setAttribute('role', 'listbox'); pop.setAttribute('aria-label', 'Uur kiezen');
  const cur = parseTimeText(inp.value);
  pop.innerHTML = QUARTERS.map(q => `<button type="button" role="option" tabindex="-1" data-time="${q}" class="${q === cur ? 'on' : ''}">${q}</button>`).join('');
  document.body.appendChild(pop);
  inp.setAttribute('aria-expanded', 'true');
  placeTimePop(inp);
  highlightTime(timeTarget(inp), true);
  // klikken in de lijst mag het veld niet laten vervagen vóór de keuze telt
  pop.addEventListener('pointerdown', e => e.preventDefault());
  pop.addEventListener('click', e => { const b = e.target.closest('[data-time]'); if (!b) return; inp.value = b.dataset.time; commitTime(inp); });
}
function commitTime(inp, fromBlur) {
  const t = taskById(selectedId); if (!t || !inp.isConnected) { closeTimePop(); return; }
  const v = parseTimeText(inp.value);
  closeTimePop();
  if (v === null) { inp.value = t.time || ''; if (!fromBlur) toast('Onbekend uur — typ bv. 14, 930 of 14:30'); return; }
  const nv = v || null;
  if (nv === (t.time || null)) { inp.value = t.time || ''; if (!fromBlur) inp.blur(); return; }
  t.time = nv; if (t.time && !t.due) t.due = today();
  touch(t); save(); renderNav(); renderMain();
  if (fromBlur) detailDirty = true; else { inp.blur(); renderDetail(true); }
}
// bij het aanklikken het hele uur selecteren, zodat je er meteen overheen typt
// (select() bij focus alleen wordt door het loslaten van de muisknop weer ongedaan gemaakt)
let timeFreshFocus = false;
detail.addEventListener('focusin', e => { if (e.target.id === 'dTime') { timeFreshFocus = true; openTimePop(e.target); e.target.select(); } });
detail.addEventListener('mouseup', e => { if (e.target.id === 'dTime' && timeFreshFocus) { e.preventDefault(); e.target.select(); } timeFreshFocus = false; });
detail.addEventListener('input', e => { if (e.target.id === 'dTime') { if (!timePop) openTimePop(e.target); highlightTime(timeTarget(e.target), true); } });
detail.addEventListener('keydown', e => {
  if (e.target.id !== 'dTime') return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!timePop) openTimePop(e.target);
    highlightTime(Math.max(0, Math.min(95, timeHi + (e.key === 'ArrowDown' ? 1 : -1))), true);
    e.target.value = QUARTERS[timeHi];
  } else if (e.key === 'Enter') { e.preventDefault(); commitTime(e.target); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const t = taskById(selectedId); e.target.value = t?.time || ''; closeTimePop(); e.target.blur(); }
  else if (e.key === 'Tab') commitTime(e.target, true);
}, true);
addEventListener('pointerdown', e => { if (timePop && !timePop.contains(e.target) && e.target.id !== 'dTime') closeTimePop(); }, true);
detail.addEventListener('scroll', () => { const i = $('#dTime'); if (timePop && i) placeTimePop(i); }, true);
addEventListener('resize', () => { const i = $('#dTime'); if (timePop && i) placeTimePop(i); });
window.visualViewport?.addEventListener('resize', () => { const i = $('#dTime'); if (timePop && i) placeTimePop(i); });
// 'change' vuurt tijdens het verlaten van het veld (Tab): pas hertekenen als de focus op het volgende veld staat, anders raakt die kwijt
let redrawT = 0;
function redrawDetail() { clearTimeout(redrawT); redrawT = setTimeout(() => renderDetail(true), 0); }
detail.addEventListener('change', e => {
  const t = taskById(selectedId); if (!t) return;
  const el = e.target;
  if (el.classList.contains('date-inp')) return;   // eigen kalender, zie commitDate
  if (el.id === 'dStage') {
    const undo = undoFor(t), res = setStage(t, el.value);
    save(); renderNav(); renderMain(); redrawDetail();
    stageToast(t, res, undo);
    return;
  }
  if (el.id === 'dProject') t.projectId = el.value;
  else if (el.id === 'dDue') {
    t.due = el.value || null; if (!t.due) t.time = null;
    // het datumveld meldt al een wijziging per getypt cijfer: niet heropbouwen zolang je erin typt
    if (document.activeElement === el) { touch(t); save(); renderNav(); renderMain(); detailDirty = true; return; }
  }
  else if (el.id === 'dTime') return;   // eigen uurkiezer, zie commitTime
  else if (el.dataset.field) {
    const f = fieldById(el.dataset.field);
    if (f.type === 'checkbox') setCustom(t, f.id, el.checked);
    else if (f.type === 'select' || f.type === 'date') setCustom(t, f.id, el.value);
    else { redrawDetail(); return; } // tekst/getal/link: al opgeslagen bij 'input'; link-knop verversen
  } else return;
  touch(t); save(); renderNav(); renderMain(); redrawDetail();
});
detail.addEventListener('keydown', e => {
  if (e.target.id === 'dComment' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); const t = taskById(selectedId); if (t) addComment(t); return; }
  if (e.target.id === 'dTitle' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
});
detail.addEventListener('click', e => {
  const b = e.target.closest('[data-act],[data-multi]'); if (!b) return;
  const t = taskById(selectedId); if (!t) return;
  if (b.dataset.multi) {
    const cur = Array.isArray(t.custom[b.dataset.multi]) ? [...t.custom[b.dataset.multi]] : [];
    const i = cur.indexOf(b.dataset.opt);
    if (i >= 0) cur.splice(i, 1); else cur.push(b.dataset.opt);
    setCustom(t, b.dataset.multi, cur); save(); renderMain(); renderDetail(true);
    return;
  }
  switch (b.dataset.act) {
    case 'close': closeDetail(); break;
    case 'delete': deleteTask(t.id); break;
    case 'expand': setDetailWidth(detailIsWide(detailWidth()) ? DETAIL_DEFAULT : Math.max(DETAIL_WIDE, Math.round(innerWidth * 0.55)), true); break;
    case 'addcomment': addComment(t); break;
    case 'attach': $('#dFile')?.click(); break;
    case 'unattach': (pendingImgs[t.id] || []).splice(+b.dataset.i, 1); $('#dPending').innerHTML = pendingHtml(t.id); break;
    case 'zoom': openLightbox(data.comments.find(x => x.id === b.closest('[data-cid]').dataset.cid)?.imgs || [], +b.dataset.i); break;
    case 'gosales': { const r = data.sales.find(x => x.id === 'w_' + t.id); if (r) { closeDetail(); setView({type:'sales', id:r.pageId}); } break; }
    case 'delcomment': deleteComment(b.closest('[data-cid]').dataset.cid); break;
    case 'cleartime': t.time = null; touch(t); save(); renderMain(); renderDetail(true); break;
    case 'more': menuAt(b, taskMenuItems(t)); break;
    case 'toggle': toggleTask(t.id); break;
    case 'deletetask': deleteTask(t.id); break;
    case 'fields': openFieldsDialog(); break;
    case 'newfield': openFieldEditor(null, t.projectId === 'inbox' ? null : t.projectId); break;
  }
});

/* ---------------- Dialogs ---------------- */
const dlg = $('#dlg');
/* ---- Eigen bevestigings- en invoervensters (geen browser-pop-ups: die tonen een wachtwoord leesbaar en vallen uit de stijl) ---- */
function ask({title, text = '', buttons, input = null}) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.id = 'ask'; d.setAttribute('aria-labelledby', 'askT');
    d.innerHTML = `<form method="dialog" class="dlg-inner"><h3 id="askT">${esc(title)}</h3>${text ? `<p class="muted ask-text">${esc(text)}</p>` : ''}${input ? `<label class="fl">${esc(input.label)}<input id="askIn" type="${input.password ? 'password' : 'text'}" autocomplete="${input.password ? 'current-password' : 'off'}" ${input.password ? '' : 'autocapitalize="off" spellcheck="false"'}></label>` : ''}<p class="err" id="askErr"></p>
      <div class="dlg-actions">${buttons.map((b, i) => `<button type="button" class="btn${b.primary ? ' primary' : ''}${b.danger ? ' danger-fill' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></form>`;
    let done = false;
    const finish = v => { if (done) return; done = true; d.close(); d.remove(); resolve(v); };
    d.addEventListener('cancel', e => { e.preventDefault(); finish(buttons.find(b => b.cancel)?.value ?? null); });
    d.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && input && e.target.id === 'askIn') { e.preventDefault(); d.querySelector('.btn.primary')?.click(); } });
    d.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const def = buttons[+b.dataset.i];
      if (input && def.primary) { const v = $('#askIn', d).value; if (input.must && v !== input.must) { $('#askErr', d).textContent = input.mustMsg || 'Dat klopt niet.'; return; } finish(v); return; }
      finish(def.value);
    });
    document.body.appendChild(d); d.showModal();
    setTimeout(() => (d.querySelector('#askIn') || d.querySelector('.btn.primary') || d.querySelector('.btn'))?.focus(), 20);
  });
}
const askConfirm = (title, text, {ok = 'Doorgaan', cancel = 'Annuleren', danger = false} = {}) =>
  ask({title, text, buttons:[{label:cancel, value:false, cancel:true}, {label:ok, value:true, primary:true, danger}]});
function showDialog(html, bind) {
  dlg.innerHTML = `<div class="dlg-inner">${html}</div>`;
  bind?.(dlg);
  if (!dlg.open) dlg.showModal();
  // eerst het veld met autofocus (bv. de naam), anders het eerste invoerveld
  setTimeout(() => (dlg.querySelector('[autofocus]:not([disabled])') || dlg.querySelector('input:not([type=checkbox]):not([disabled]),select'))?.focus(), 20);
}
dlg.addEventListener('click', e => { if (e.target === dlg && !dlg.dataset.sticky) dlg.close(); });
dlg.addEventListener('close', () => { if (dlg.open) return; dlg.innerHTML = ''; dlg.classList.remove('st-dlg'); });   // een direct heropend venster (close + showDialog in één adem) mag niet leeggemaakt worden


function openProjectDialog(p) {
  const isNew = !p, isInbox = p?.id === 'inbox';
  let color = p?.color || COLORS[data.projects.length % COLORS.length];
  const fs = sortedFields();
  showDialog(`
    <h3>${isNew ? 'Nieuw project' : 'Project bewerken'}</h3>
    <label class="fl">Naam<input id="pjName" type="text" value="${esc(p?.name || '')}" ${isInbox ? 'disabled' : 'autofocus'} placeholder="bv. B&W Diksmuide"></label>
    <details class="crm-form-extra"><summary>Kleur en icoon kiezen (optioneel)</summary><label class="fl">Icoon<input id="pjEmoji" type="text" value="${esc(p?.emoji || '')}" maxlength="8" placeholder="Je kunt dit leeg laten"></label>
    <div class="fl">Kleur<div class="swatches">${COLORS.map(c => `<button type="button" class="sw ${c === color ? 'on' : ''}" style="--c:${c}" data-c="${c}" aria-label="Kleur ${c}"></button>`).join('')}</div></div></details>
    <details class="crm-form-extra"><summary>Gegevensvelden kiezen (optioneel)</summary><div class="fl">Extra gegevens in dit project
      ${fs.length ? `<div class="checks">${fs.map(f => `<label class="chk"><input type="checkbox" data-f="${f.id}" ${f.all || (p && f.projectIds.includes(p.id)) ? 'checked' : ''} ${f.all ? 'disabled' : ''}> ${esc(f.name)} <span class="muted small">${TYPES[f.type]}${f.all ? ' · in alle projecten' : ''}</span></label>`).join('')}</div>` : ''}
      <div style="margin-top:8px;font-weight:400"><button type="button" class="link" id="pjNewField">+ Extra gegeven toevoegen</button></div>
    </div></details>
    <div class="dlg-actions">
      ${p && !isInbox ? `<button type="button" class="btn danger" id="pjDel">Verwijderen</button><button type="button" class="btn" id="pjFin">${p.finished ? 'Heropenen' : 'Afwerken'}</button>` : ''}
      <span class="grow"></span>
      <button type="button" class="btn" id="pjCancel">Annuleren</button>
      <button type="button" class="btn primary" id="pjSave">${isNew ? 'Aanmaken' : 'Opslaan'}</button>
    </div>`, d => {
    $$('.sw', d).forEach(b => b.onclick = () => { color = b.dataset.c; $$('.sw', d).forEach(x => x.classList.toggle('on', x === b)); });
    $('#pjCancel', d).onclick = () => dlg.close();
    $('#pjName', d).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#pjSave', d).click(); } };
    const doSave = () => {
      const name = $('#pjName', d).value.trim(), emoji = $('#pjEmoji', d).value.trim();
      if (!isInbox && !name) { $('#pjName', d).focus(); return null; }
      let target = p;
      if (isNew) {
        target = touch({id:uid(), name, color, emoji, notes:'', order:Math.max(0, ...data.projects.map(x => x.order || 0)) + 1});
        data.projects.push(target);
      } else { if (!isInbox) target.name = name; target.color = color; target.emoji = emoji; touch(target); }
      for (const cb of $$('[data-f]', d)) {
        const f = fieldById(cb.dataset.f); if (!f || f.all) continue;
        const has = f.projectIds.includes(target.id);
        if (cb.checked && !has) { f.projectIds.push(target.id); touch(f); }
        if (!cb.checked && has) { f.projectIds = f.projectIds.filter(x => x !== target.id); touch(f); }
      }
      return target;
    };
    $('#pjSave', d).onclick = () => {
      const target = doSave(); if (!target) return;
      dlg.close();
      if (isNew) { save(); setView({type:'project', id:target.id}); } else commit();
    };
    $('#pjNewField', d).onclick = () => {
      const target = doSave(); if (!target) return;
      save();
      if (isNew) view = {type:'project', id:target.id};
      renderAll();
      openFieldEditor(null, target.id === 'inbox' ? null : target.id, () => openProjectDialog(target));
    };
    $('#pjFin', d)?.addEventListener('click', () => { dlg.close(); finishProject(p, !p.finished); });
    $('#pjDel', d)?.addEventListener('click', async () => { if (await deleteProject(p)) dlg.close(); });
  });
}
$('#archBar').addEventListener('click', e => {
  const pg = view.type === 'sales' ? salesPageById(view.id) : null, p = view.type === 'project' ? data.projects.find(x => x.id === view.id) : null;
  if (e.target.closest('[data-reopen]') && p) finishProject(p, false);
});
function finishProject(p, on) {
  p.finished = on; p.finishedAt = on ? now() : null; touch(p); commit();
  if (on) { navigator.vibrate?.(12); toast(`🎉 “${p.name}” afgewerkt`); } else toast(`“${p.name}” heropend`);
}
async function deleteProject(p) {
      const n = data.tasks.filter(t => t.projectId === p.id).length;
      if (!await askConfirm('Project verwijderen?', `Project “${p.name}”${n ? ` en de ${n} deals erin` : ''} wordt definitief verwijderd.`, {ok:'Verwijderen', danger:true})) return false;
      data.projects = data.projects.filter(x => x.id !== p.id); tombstone(p.id);
      for (const t of data.tasks.filter(t => t.projectId === p.id)) tombstone(t.id);
      data.tasks = data.tasks.filter(t => t.projectId !== p.id);
      for (const f of data.fields) if (f.projectIds.includes(p.id)) { f.projectIds = f.projectIds.filter(x => x !== p.id); touch(f); }
      delete data.prefs['p:' + p.id];
      if (view.type === 'project' && view.id === p.id) view = {type:'inbox'};
      if (selectedId && !taskById(selectedId)) selectedId = null;
      commit(); return true;
}

function openStagesDialog() {
  const draft = stages().map(x => ({...x}));
  const count = id => data.tasks.filter(t => t.stage === id).length;
  const read = d => $$('.st-row', d).forEach((row, i) => {
    draft[i].label = $('input[type=text]', row).value;
    draft[i].done = $('input[type=checkbox]', row).checked;
    const positive = $('.st-pos input', row);
    draft[i].positive = draft[i].done && (positive ? positive.checked : !!draft[i].positive);
  });
  const draw = () => showDialog(`
    <h3>Stappen</h3>
    <p class="muted small" style="margin:0">Hernoem, herschik, kleur of voeg kolommen toe. Kaarten in een kolom met <b>afgewerkt</b> aangevinkt tellen als afgewerkt. Bij <b>verkoop</b> komt een deal die hier belandt automatisch in het tabblad Verkopen, op die dag.</p>
    <div id="stRows" style="margin-top:12px">${draft.map((x, i) => `
      <div class="st-row">
        <button type="button" class="sw" style="--c:${x.color}" data-sc="${i}" title="Andere kleur" aria-label="Kleur wijzigen"></button>
        <input type="text" value="${esc(x.label)}" placeholder="Naam van de kolom" aria-label="Naam kolom ${i + 1}">
        <label class="chk st-done" title="Kaarten in deze kolom tellen als afgewerkt"><input type="checkbox" ${x.done ? 'checked' : ''}> afgewerkt</label>
        ${feat('sales') ? `<label class="chk st-done st-pos" title="Een deal die in deze stap komt, wordt automatisch een verkoop in het tabblad Verkopen"><input type="checkbox" ${x.positive ? 'checked' : ''}> verkoop</label>` : ''}
        <button type="button" class="icon-btn" data-sm="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Naar links">${I.up}</button>
        <button type="button" class="icon-btn" data-sm="${i}" data-dir="1" ${i === draft.length - 1 ? 'disabled' : ''} aria-label="Naar rechts">${I.down}</button>
        <button type="button" class="icon-btn" data-sr="${i}" aria-label="Stap verwijderen" title="${count(x.id) ? 'Verwijderen (' + count(x.id) + ' kaarten worden verplaatst)' : 'Verwijderen'}">${I.trash}</button>
      </div>`).join('')}</div>
    <button type="button" class="link" id="stAdd" style="margin-top:10px;font-weight:550">+ Stap toevoegen</button>
    <p class="err" id="stErr"></p>
    <div class="dlg-actions"><button type="button" class="btn" id="stReset">Standaard herstellen</button><span class="grow"></span><button type="button" class="btn" id="stCancel">Annuleren</button><button type="button" class="btn primary" id="stSave">Opslaan</button></div>`, d => {
    $$('[data-sc]', d).forEach(b => b.onclick = () => {
      const x = draft[+b.dataset.sc];
      x.color = COLORS[(COLORS.indexOf(x.color) + 1) % COLORS.length];
      b.style.setProperty('--c', x.color);
    });
    $$('[data-sm]', d).forEach(b => b.onclick = () => {
      read(d);
      const i = +b.dataset.sm, j = i + +b.dataset.dir;
      [draft[i], draft[j]] = [draft[j], draft[i]];
      draw();
    });
    $$('[data-sr]', d).forEach(b => b.onclick = () => { read(d); draft.splice(+b.dataset.sr, 1); draw(); });
    $('#stAdd', d).onclick = () => {
      read(d);
      draft.push({id:uid(), label:'', color:COLORS[draft.length % COLORS.length], done:false});
      draw();
      setTimeout(() => $$('#stRows input[type=text]').at(-1)?.focus(), 30);
    };
    $('#stReset', d).onclick = () => {
      read(d);
      draft.splice(0, draft.length, ...DEFAULT_STAGES.map(x => ({...x, u:data.stages.find(y => y.id === x.id)?.u})));
      draw();
    };
    $('#stCancel', d).onclick = () => dlg.close();
    $('#stSave', d).onclick = async () => {
      read(d);
      const err = $('#stErr', d);
      draft.forEach(x => x.label = x.label.trim());
      if (draft.some(x => !x.label)) { err.textContent = 'Geef elke kolom een naam.'; return; }
      if (!draft.some(x => !x.done)) { err.textContent = 'Hou minstens één kolom die niet afgewerkt is.'; return; }
      if (!draft.some(x => x.done)) { err.textContent = 'Hou minstens één kolom met “afgewerkt” aangevinkt.'; return; }
      const removed = data.stages.filter(x => !draft.some(y => y.id === x.id));
      const moving = data.tasks.filter(t => removed.some(x => x.id === t.stage));
      const openTarget = draft.find(x => !x.done), doneTarget = draft.find(x => x.done);
      if (moving.length && !await askConfirm('Kaarten verplaatsen?', `${moving.length} kaart(en) uit verwijderde kolommen worden verplaatst naar “${openTarget.label}” (open) of “${doneTarget.label}” (afgewerkt).`)) return;
      // kolommen bijwerken
      draft.forEach((x, i) => {
        const cur = data.stages.find(y => y.id === x.id);
        if (!cur) { data.stages.push(touch({id:x.id, label:x.label, color:x.color, done:x.done, positive:!!x.positive, order:i})); delete data.deleted[x.id]; }
        else if (cur.label !== x.label || cur.color !== x.color || cur.done !== x.done || !!cur.positive !== !!x.positive || cur.order !== i) Object.assign(cur, {label:x.label, color:x.color, done:x.done, positive:!!x.positive, order:i}, {u:now()});
      });
      for (const x of removed) { tombstone(x.id); }
      data.stages = data.stages.filter(x => !removed.includes(x));
      // kaarten volgen hun kolom: verplaatsen en afgewerkt-status bijwerken
      for (const t of data.tasks) {
        let st = t.stage;
        if (removed.some(x => x.id === st)) st = t.done ? doneTarget.id : openTarget.id;
        const done = isDoneStage(st);
        if (st !== t.stage || done !== t.done) {
          t.stage = st;
          if (done && !t.done) t.doneAt = now();
          if (!done) t.doneAt = null;
          t.done = done; touch(t);
        }
      }
      dlg.close(); commit(); toast('Stappen opgeslagen');
    };
  });
  draw();
}

function openFieldsDialog() {
  const fs = sortedFields();
  const scope = f => f.all ? 'Alle projecten' : (f.projectIds.map(id => data.projects.find(p => p.id === id)?.name).filter(Boolean).join(', ') || 'Geen projecten');
  showDialog(`
    <h3>Extra gegevens</h3>
    <p class="muted small" style="margin:0">Voeg extra eigenschappen toe aan je deals, zoals klant, locatie, status, budget of een link. Je kunt ze op alle projecten of enkel op bepaalde projecten gebruiken.</p>
    ${fs.length ? `<ul class="flist">${fs.map((f, i) => `<li>
        <div><b>${esc(f.name)}</b><span class="muted">${TYPES[f.type]} · ${esc(scope(f))}${f.showInList ? ' · zichtbaar in lijst' : ''}</span></div>
        <button class="icon-btn" data-mv="${f.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Omhoog">${I.up}</button>
        <button class="icon-btn" data-mv="${f.id}" data-dir="1" ${i === fs.length - 1 ? 'disabled' : ''} aria-label="Omlaag">${I.down}</button>
        <button class="btn" data-edit="${f.id}">Bewerken</button></li>`).join('')}</ul>`
      : '<div class="box muted">Je hebt nog geen extra gegevens. Voeg de eerste toe.</div>'}
    <div class="dlg-actions"><span class="grow"></span><button type="button" class="btn" id="fClose">Sluiten</button><button type="button" class="btn primary" id="fNew">Toevoegen</button></div>`, d => {
    $('#fClose', d).onclick = () => dlg.close();
    $('#fNew', d).onclick = () => openFieldEditor(null, view.type === 'project' ? view.id : null, openFieldsDialog);
    $$('[data-edit]', d).forEach(b => b.onclick = () => openFieldEditor(fieldById(b.dataset.edit), null, openFieldsDialog));
    $$('[data-mv]', d).forEach(b => b.onclick = () => {
      const list = sortedFields(), i = list.findIndex(f => f.id === b.dataset.mv), j = i + +b.dataset.dir;
      if (j < 0 || j >= list.length) return;
      list.forEach((f, k) => { if (f.order !== k) { f.order = k; touch(f); } });
      [list[i].order, list[j].order] = [list[j].order, list[i].order]; touch(list[i]); touch(list[j]);
      commit(); openFieldsDialog();
    });
  });
}

function openFieldEditor(f, presetProject, back) {
  const isNew = !f;
  const draft = f ? JSON.parse(JSON.stringify(f)) : {id:uid(), name:'', type:'select', options:[], all:!presetProject, projectIds:presetProject ? [presetProject] : [], showInList:true};
  if (isNew && draft.type === 'select') draft.options = [{id:uid(), label:'', color:COLORS[0]}];
  const done = () => back ? back() : dlg.close();
  const read = d => {
    draft.name = $('#feName', d).value;
    draft.type = $('#feType', d).value;
    draft.showInList = $('#feList', d).checked;
    draft.all = $('#feAll', d).checked;
    draft.projectIds = $$('[data-pid]', d).filter(c => c.checked).map(c => c.dataset.pid);
    $$('.opt-row', d).forEach((row, i) => { draft.options[i].label = $('input', row).value; });
  };
  const draw = () => showDialog(`
    <h3>${isNew ? 'Extra gegeven toevoegen' : 'Extra gegeven bewerken'}</h3>
    <label class="fl">Naam<input id="feName" type="text" value="${esc(draft.name)}" placeholder="bv. Status, Klant, Locatie, Budget"></label>
    <label class="fl">Type<select id="feType">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${k === draft.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${!isNew && f.type !== draft.type ? '<p class="err">Let op: bestaande waarden passen mogelijk niet bij het nieuwe type.</p>' : ''}
    ${draft.type === 'select' || draft.type === 'multiselect' ? `<div class="fl">Opties
      <div id="feOpts">${draft.options.map((o, i) => `<div class="opt-row" data-i="${i}"><button type="button" class="sw sm" style="--c:${o.color}" data-oc="${i}" title="Andere kleur" aria-label="Kleur wijzigen"></button><input type="text" value="${esc(o.label)}" placeholder="Optie ${i + 1}"><button type="button" class="icon-btn" data-orm="${i}" aria-label="Optie verwijderen">${I.close}</button></div>`).join('')}</div>
      <button type="button" class="link" id="feAddOpt" style="margin-top:8px;font-weight:550">+ Optie toevoegen</button></div>` : ''}
    <div class="fl">Beschikbaar in
      <div class="checks">
        <label class="chk"><input type="checkbox" id="feAll" ${draft.all ? 'checked' : ''}> Alle projecten</label>
        <div id="feProjects" style="display:grid;gap:6px;padding-left:24px;${draft.all ? 'opacity:.5' : ''}">${sortedProjects().map(p => `<label class="chk"><input type="checkbox" data-pid="${p.id}" ${draft.projectIds.includes(p.id) ? 'checked' : ''} ${draft.all ? 'disabled' : ''}><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${p.color}"></span>${esc(p.name)}</label>`).join('')}</div>
      </div></div>
    <label class="chk" style="margin-top:14px"><input type="checkbox" id="feList" ${draft.showInList ? 'checked' : ''}> Tonen in de lijst met deals</label>
    <p class="err" id="feErr"></p>
    <div class="dlg-actions">
      ${!isNew ? '<button type="button" class="btn danger" id="feDel">Verwijderen</button>' : ''}
      <span class="grow"></span>
      <button type="button" class="btn" id="feCancel">${back ? 'Terug' : 'Annuleren'}</button>
      <button type="button" class="btn primary" id="feSave">${isNew ? 'Aanmaken' : 'Opslaan'}</button>
    </div>`, d => {
    $('#feType', d).onchange = () => {
      read(d);
      if ((draft.type === 'select' || draft.type === 'multiselect') && !draft.options.length) draft.options.push({id:uid(), label:'', color:COLORS[0]});
      draw();
    };
    $('#feAll', d).onchange = () => { read(d); draw(); };
    $('#feAddOpt', d)?.addEventListener('click', () => {
      read(d); draft.options.push({id:uid(), label:'', color:COLORS[draft.options.length % COLORS.length]}); draw();
      setTimeout(() => $$('#feOpts input').at(-1)?.focus(), 30);
    });
    $$('[data-orm]', d).forEach(b => b.onclick = () => { read(d); draft.options.splice(+b.dataset.orm, 1); draw(); });
    $$('[data-oc]', d).forEach(b => b.onclick = () => {
      const o = draft.options[+b.dataset.oc];
      o.color = COLORS[(COLORS.indexOf(o.color) + 1) % COLORS.length];
      b.style.setProperty('--c', o.color);
    });
    $$('#feOpts input', d).forEach(inp => inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#feAddOpt', d).click(); } });
    $('#feCancel', d).onclick = done;
    $('#feSave', d).onclick = () => {
      read(d);
      const err = $('#feErr', d);
      draft.name = draft.name.trim();
      if (!draft.name) { err.textContent = 'Geef het een naam.'; return; }
      draft.options = draft.options.map(o => ({...o, label:o.label.trim()})).filter(o => o.label);
      if ((draft.type === 'select' || draft.type === 'multiselect') && !draft.options.length) { err.textContent = 'Voeg minstens één optie toe.'; return; }
      if (isNew) { draft.order = Math.max(-1, ...data.fields.map(x => x.order || 0)) + 1; data.fields.push(touch(draft)); }
      else Object.assign(f, draft, {u:now()});
      commit(); done();
    };
    $('#feDel', d)?.addEventListener('click', async () => {
      if (!await askConfirm('Extra gegeven verwijderen?', `“${f.name}” verwijderen? De waarden in je deals verdwijnen ook.`, {ok:'Verwijderen', danger:true})) return;
      data.fields = data.fields.filter(x => x.id !== f.id); tombstone(f.id);
      for (const t of data.tasks) if (f.id in t.custom) { delete t.custom[f.id]; touch(t); }
      for (const k of Object.keys(data.prefs)) {
        const pr = data.prefs[k];
        for (const key of ['sort','group','ff']) if (pr[key] === 'f:' + f.id) { pr[key] = key === 'sort' ? 'manual' : ''; if (key === 'ff') pr.fv = ''; }
      }
      commit(); done();
    });
  });
  draw();
}

// Ingedrukt houden om te bevestigen (voor onomkeerbare acties): de knop vult zich, bij loslaten stopt het
function holdToConfirm(btn, onDone, ms = 1100) {
  let t0 = 0, raf = 0, done = false;
  const set = f => btn.style.setProperty('--hold', f);
  const stop = () => { cancelAnimationFrame(raf); raf = 0; if (!done) set(0); };
  const tick = () => { const f = Math.min(1, (performance.now() - t0) / ms); set(f); if (f >= 1) { done = true; raf = 0; onDone(); } else raf = requestAnimationFrame(tick); };
  const start = e => { if (btn.disabled || done || raf) return; e.preventDefault(); t0 = performance.now(); raf = requestAnimationFrame(tick); };
  btn.classList.add('hold');
  btn.addEventListener('pointerdown', start);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
  btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') start(e); });
  btn.addEventListener('keyup', stop);
  return {reset() { done = false; set(0); }};
}
let settingsTab = 'algemeen';
function openSettings() {
  const s = data.settings.sync;
  const tabs = [['algemeen', 'Algemeen'], ['account', 'Account'], ['deals', 'Klanten'], ['verkopen', 'Verkopen'], ['beveiliging', 'Beveiliging'], ['gegevens', 'Back-ups']].filter(([k]) => k !== 'verkopen' || feat('sales'));
  const row = (title, desc, ctl) => `<div class="st-row"><div class="st-t"><b>${title}</b>${desc ? `<span>${desc}</span>` : ''}</div><div class="st-c">${ctl}</div></div>`;
  const go = (id, label = 'Beheren') => `<button type="button" class="btn st-go" id="${id}">${label}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>`;
  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const sortOpts = [['manual', 'Eigen volgorde'], ['newest', 'Nieuwste eerst'], ['due', 'Deadline'], ['title', 'Naam'], ...sortedFields().filter(f => f.type !== 'multiselect').map(f => ['f:' + f.id, f.name])];
  const themeNowV = document.documentElement.dataset.theme || 'auto';
  showDialog(`
    <div class="st-wrap">
      <nav class="st-nav" role="tablist" aria-label="Instellingen">
        <h3>Instellingen</h3>
        ${tabs.map(([k, l]) => `<button type="button" role="tab" class="st-tab" data-tab="${k}">${l}</button>`).join('')}
        <span class="grow"></span>
        <button type="button" class="btn primary st-done" id="stClose">Klaar</button>
      </nav>
      <div class="st-pane">
        <section data-pane="algemeen" role="tabpanel">
          <h2>Algemeen</h2><p class="st-lead">Wat je ziet en gebruikt in Klose.</p>
          <h4>Functies</h4>
          <p class="st-note">Zet aan wat je gebruikt. Wat uit staat, verdwijnt uit het menu; je gegevens blijven bewaard.</p>
          <div class="feat-list" id="stFeats">${featureChecks(Object.fromEntries(FEATURES.map(([k]) => [k, feat(k)])))}</div>
          <h4>Uiterlijk</h4>
          <div class="st-card">${row('Thema', 'Volg je toestel, of kies zelf.', sel('stTheme', [['auto', 'Automatisch'], ['light', 'Licht'], ['dark', 'Donker']], themeNowV))}</div>
          <h4>Hulp</h4>
          <div class="st-card">${row('Rondleiding', 'Zie in een minuut waar alles staat.', go('stTour', 'Bekijken'))}${row('Sneltoetsen', 'Sneller werken met het toetsenbord.', go('stKeys', 'Bekijken'))}</div>
        </section>
        <section data-pane="account" role="tabpanel" hidden>
          <h2>Account</h2><p class="st-lead">Aanmelden, synchroniseren en herstellen.</p>
    ${s?.cloud ? `<div class="box">
        <p><b>Ingelogd als</b> ${esc(s.email || '')}</p>
        <p class="muted small">Je gegevens staan veilig online en zijn op al je toestellen hetzelfde. Vergeet je je wachtwoord, dan heb je je noodcode nodig. Maak ook af en toe een back-up (hieronder). ${syncState.state === 'err' ? `<br><span class="err">${esc(syncState.msg)}</span>` : ''}</p>
        <div class="dlg-actions" style="margin-top:4px"><button type="button" class="btn" id="stSync">Nu bijwerken</button>${K?.w ? '<button type="button" class="btn" id="stRecNew">Nieuwe noodcode</button>' : ''}<span class="grow"></span><button type="button" class="btn" id="stLogout">Uitloggen</button></div>
        <div class="dlg-actions" style="margin-top:4px"><span class="grow"></span><button type="button" class="btn danger" id="stDelAcc">Account verwijderen</button></div>
      </div>`
    : `<div class="box">
        <p class="muted small">Je deals staan nu alleen op dit toestel.${CLOUD ? ' Met een account heb je ze op al je toestellen, en kun je je wachtwoord herstellen als je het vergeet.' : ' Maak af en toe een back-up (hieronder).'}</p>
        ${CLOUD ? '<div class="dlg-actions" style="margin-top:4px"><span class="grow"></span><button type="button" class="btn primary" id="stToAccount">Account maken en gegevens meenemen</button></div>' : ''}
      </div>`}
        </section>
        <section data-pane="deals" role="tabpanel" hidden>
          <h2>Klanten</h2><p class="st-lead">De statussen en gegevens bij je klanten.</p>
          <div class="st-card">
            ${row('Standaardvolgorde', 'Geldt voor klantenlijsten en kolommen.', sel('stSort', sortOpts, data.settings.sort || 'due'))}
            ${row('Stappen', 'Namen, kleuren en volgorde van je statussen.', go('stStages'))}
            ${row('Extra gegevens', 'Velden zoals formaat, telefoonnummer of kortingsprijs.', go('stFields'))}
          </div>
          <p class="st-note">De prijsberekening staat bij elk project en past zich aan wat je daar invult.</p>
        </section>
        ${feat('sales') ? `<section data-pane="verkopen" role="tabpanel" hidden>
          <h2>Verkopen</h2><p class="st-lead">Je maandpagina's en wat erin staat.</p>
          <div class="st-card">${row('Kolommen', 'Welke gegevens je per verkoop bijhoudt.', go('stSalesCols'))}</div>
        </section>` : ''}
        <section data-pane="beveiliging" role="tabpanel" hidden>
          <h2>Beveiliging</h2><p class="st-lead">Je gegevens zijn versleuteld; hier regel je de toegang.</p>
          <div class="st-card">${row('Automatisch vergrendelen', 'Na inactiviteit moet je opnieuw ontgrendelen.', `<select id="stAuto">${[[5,'5 minuten'],[15,'15 minuten'],[30,'30 minuten'],[60,'1 uur'],[240,'4 uur'],[0,'Nooit']].map(([v, l]) => `<option value="${v}" ${v === data.settings.autolock ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>
          <h4>Ontgrendelen</h4>
          <div class="st-card st-plain">${bioBox()}</div>
          <h4>Wachtwoord wijzigen</h4>
          <div class="st-card st-plain">
    <label class="fl">Huidig wachtwoord<input id="stOld" type="password" autocomplete="current-password"></label>
      <label class="fl">Nieuw wachtwoord<input id="stNew1" type="password" autocomplete="new-password"></label>
      <label class="fl">Herhaal nieuw wachtwoord<input id="stNew2" type="password" autocomplete="new-password"></label>
      <p class="err" id="stPwErr"></p>
      <button type="button" class="btn" id="stPwSave">Wachtwoord wijzigen</button>          </div>
        </section>
        <section data-pane="gegevens" role="tabpanel" hidden>
          <h2>Back-ups</h2><p class="st-lead">Een kopie bewaren of een eerdere kopie terugzetten.</p>
          <h4>Back-up</h4>
          <div class="st-card">
            ${row('Back-up maken', 'Een versleuteld bestand met al je gegevens.', '<button type="button" class="btn" id="stExpEnc">Maken</button>')}
            ${row('Leesbare back-up', 'Niet versleuteld: bewaar het bestand veilig.', '<button type="button" class="btn" id="stExpPlain">Maken</button>')}
            ${row('Back-up terugzetten', 'Voegt de gegevens samen met wat er al is.', '<button type="button" class="btn" id="stImp">Kiezen…</button><input type="file" id="stFile" accept=".json,application/json" hidden>')}
          </div>
          <h4>Dit toestel</h4>
          <div class="st-card">${row('Alles wissen', 'Verwijdert alle gegevens van dit toestel.', '<button type="button" class="btn danger" id="stWipe">Wissen</button>')}</div>
        </section>
      </div>
    </div>`, d => {
    dlg.classList.add('st-dlg');
    const showTab = k => { settingsTab = k; d.querySelectorAll('.st-tab').forEach(b => { const on = b.dataset.tab === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); d.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== k); d.querySelector('.st-pane').scrollTop = 0; };
    d.querySelector('.st-nav').addEventListener('click', e => { const b = e.target.closest('.st-tab'); if (b) showTab(b.dataset.tab); });
    showTab(tabs.some(([k]) => k === settingsTab) ? settingsTab : 'algemeen');
    $('#stTheme', d).onchange = e => { if (e.target.value === 'auto') { delete document.documentElement.dataset.theme; try { localStorage.removeItem('taken.theme'); } catch {} paintThemeColor(); } else setTheme(e.target.value); };
    $('#stKeys', d).onclick = () => openShortcutsDialog();
    $('#stSort', d).onchange = e => { data.settings.sort = e.target.value;for(const filter of Object.values(crmListFilters))filter.sort=e.target.value;commit(); };
    $('#stStages', d).onclick = () => openStagesDialog();
    $('#stFields', d).onclick = () => openFieldsDialog();
    $('#stSalesCols', d)?.addEventListener('click', () => openSalesColsDialog());
    $('#stClose', d).onclick = () => dlg.close();
    $('#stAuto', d).onchange = e => { data.settings.autolock = +e.target.value; save(); };
    bindBioBox(d);
    $('#stSync', d)?.addEventListener('click', () => syncNow());
    $('#stLogout', d)?.addEventListener('click', () => lock());
    $('#stDelAcc', d)?.addEventListener('click', () => {
      showDialog(`<h3>Account verwijderen</h3>
        <p class="muted small">Je account en al je gegevens online worden <b>definitief gewist</b>, ook op je andere toestellen. Dit kan niet ongedaan gemaakt worden en je noodcode helpt dan niet meer. Download eerst een back-up als je je gegevens wilt houden (Instellingen → Back-up).</p>
        <label class="fl">Wachtwoord<input id="daPw" type="password" autocomplete="current-password" autofocus></label>
        <label class="fl">Typ VERWIJDEREN om te bevestigen<input id="daTxt" type="text" autocomplete="off"></label>
        <p class="err" id="daErr"></p>
        <div class="dlg-actions"><button type="button" class="btn" id="daNo">Annuleren</button><span class="grow"></span><button type="button" class="btn danger" id="daOk">Houd ingedrukt om definitief te verwijderen</button></div>`, dd => {
        $('#daNo', dd).onclick = () => dd.close();
        const okBtn = $('#daOk', dd), hold = holdToConfirm(okBtn, async () => {
          const err = $('#daErr', dd); err.textContent = '';
          if ($('#daTxt', dd).value.trim() !== 'VERWIJDEREN') { err.textContent = 'Typ VERWIJDEREN om te bevestigen.'; hold.reset(); return; }
          try { const b = vaultBlob(); await unseal((await openKey($('#daPw', dd).value, b)).key, b); }
          catch { err.textContent = 'Wachtwoord klopt niet.'; hold.reset(); return; }
          try { await deleteAccount(); }
          catch (ex) { err.textContent = ex.message; hold.reset(); return; }
          try { localStorage.removeItem(VAULT); localStorage.removeItem(BIO_KEY); localStorage.removeItem(CLOUD_USER); localStorage.removeItem(REM_KEY); } catch {}
          idbKV('del', VAULT).catch(() => {}).finally(() => location.reload());
        });
      });
    });
    $('#stRecNew', d)?.addEventListener('click', () => {
      showDialog(`<h3>Nieuwe noodcode</h3>
        <p class="muted small">Je huidige noodcode werkt daarna niet meer. Vul je wachtwoord in om door te gaan.</p>
        <label class="fl">Wachtwoord<input id="rnPw" type="password" autocomplete="current-password" autofocus></label>
        <p class="err" id="rnErr"></p>
        <div class="dlg-actions"><button type="button" class="btn" id="rnNo">Annuleren</button><span class="grow"></span><button type="button" class="btn primary" id="rnOk">Maken</button></div>`, dd => {
        $('#rnNo', dd).onclick = () => dd.close();
        $('#rnOk', dd).onclick = async e => {
          const pw = $('#rnPw', dd).value, err = $('#rnErr', dd); err.textContent = ''; e.target.disabled = true;
          try { await unwrapRaw(K.w.pw, pw); } catch { err.textContent = 'Wachtwoord klopt niet.'; e.target.disabled = false; return; }
          const rec = newRecoveryKey();
          setKeyWrap('rec', await wrapRaw(K.raw, recNorm(rec), REC_ITER));
          try { await persist(); syncDirty = true; await syncNow(pw); } catch {}
          showRecoveryKey(rec, true);
        };
      });
    });
    $('#stFeats', d).addEventListener('change', e => {
      const k = e.target.dataset.feat; if (!k) return;
      data.settings.features = {...Object.fromEntries(FEATURES.map(([x]) => [x, feat(x)])), [k]:e.target.checked};
      commit();
    });
    $('#stTour', d).addEventListener('click', () => { dlg.close(); setTimeout(startTour, 250); });
    $('#stToAccount', d)?.addEventListener('click', async () => {
      try { localStorage.setItem('taken.lock.mode', 'cloud-up'); } catch {}
      lock();
    });
    $('#stPwSave', d).onclick = async () => {
      const err = $('#stPwErr', d), o = $('#stOld', d).value, n1 = $('#stNew1', d).value, n2 = $('#stNew2', d).value;
      err.textContent = '';
      const cl = data.settings.sync?.cloud;
      if (n1.length < (cl ? CLOUD_MINPW : 8)) { err.textContent = `Gebruik minstens ${cl ? CLOUD_MINPW : 8} tekens.`; return; }
      if (n1 !== n2) { err.textContent = 'De nieuwe wachtwoorden komen niet overeen.'; return; }
      try { await persist(); const kk = await openKey(o, vaultBlob()); await unseal(kk.key, vaultBlob()); }
      catch { err.textContent = 'Huidig wachtwoord klopt niet.'; return; }
      if (cl) {   // eerst het login-geheim bij de dienst vervangen; lukt dat niet, dan blijft alles zoals het was
        try {
          const ss = await cloudToken(), nsec = await authSecret(data.settings.sync.email, n1);
          await sb('/auth/v1/user', {method:'PUT', token:ss.token, body:{password:nsec}});
          cloudAuth = {email:data.settings.sync.email, secret:nsec};
        } catch (ex) { err.textContent = 'Wachtwoord niet gewijzigd: ' + ex.message; return; }
      }
      if (K.w) setKeyWrap('pw', await wrapRaw(K.raw, n1, ITER));   // snel: enkel de datasleutel opnieuw inpakken
      else { const salt = crypto.getRandomValues(new Uint8Array(16)); K = {key:await deriveKey(n1, salt, ITER), salt, iter:ITER}; }
      await persist(); const blob = await persistRemote(data.settings.sync);
      forgetPw();
      if (bioGet()) { localStorage.removeItem(BIO_KEY); toast('Wachtwoord gewijzigd; zet ' + bioName() + ' opnieuw aan'); }
      if (data.settings.sync) {
        try { await remotePut(data.settings.sync, blob); setSync('ok'); }
        catch (ex) { if (ex.conflict) { syncDirty = true; scheduleSync(300); } else setSync('err', ex.message); }
      }
      dlg.close(); toast('Wachtwoord gewijzigd');
    };
    const download = (name, obj) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], {type:'application/json'}));
      a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    };
    $('#stExpEnc', d).onclick = async () => { try { download(`taken-backup-${today()}.json`, await persistFull()); } catch (ex) { toast('Back-up mislukt: ' + ex.message); } };
    $('#stExpPlain', d).onclick = async () => {
      if (!await askConfirm('Leesbare export maken?', 'Dit bestand is NIET versleuteld. Bewaar het veilig en wis het als je het niet meer nodig hebt.', {ok:'Exporteren'})) return;
      const copy = JSON.parse(JSON.stringify(data)); copy.settings.sync = null;
      download(`taken-export-${today()}.json`, copy);
    };
    $('#stImp', d).onclick = () => $('#stFile', d).click();
    $('#stFile', d).onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const obj = JSON.parse(await file.text());
        let incoming;
        if (obj.ct && obj.salt) {
          const pw = await ask({title:'Wachtwoord van de back-up', text:'Deze back-up is versleuteld. Vul het wachtwoord in waarmee hij gemaakt is.', input:{label:'Wachtwoord', password:true}, buttons:[{label:'Annuleren', value:null, cancel:true}, {label:'Terugzetten', primary:true}]}); if (pw === null) return;
          try { incoming = await unseal((await openKey(pw, obj)).key, obj); }
          catch { throw new Error('Onjuist wachtwoord voor deze back-up.'); }
        } else if (Array.isArray(obj.tasks)) incoming = obj;
        else throw new Error('Onbekend bestandsformaat.');
        const sync = data.settings.sync;
        data = merge(data, normalize(incoming));
        data.settings.sync = sync;
        commit(); dlg.close(); toast('Import voltooid');
      } catch (ex) { toast('Importeren mislukt: ' + ex.message); }
    };
    $('#stWipe', d).onclick = async () => {
      if (await ask({title:'Alles op dit toestel wissen?', text:'Alle deals op dit toestel worden gewist. Dit kan niet ongedaan gemaakt worden.', input:{label:'Typ WISSEN om te bevestigen', must:'WISSEN', mustMsg:'Typ het woord WISSEN.'}, buttons:[{label:'Annuleren', value:null, cancel:true}, {label:'Alles wissen', primary:true, danger:true}]}) === null) return;
      localStorage.removeItem(VAULT); localStorage.removeItem(BIO_KEY); localStorage.removeItem(CLOUD_USER); localStorage.removeItem(REM_KEY);
      idbKV('del', VAULT).catch(() => {}).finally(() => location.reload());
    };
  });
}

/* ---------------- Verkopen ---------------- */
const eurFmt = new Intl.NumberFormat('nl-BE', {style:'currency', currency:'EUR'});
const numFmt = new Intl.NumberFormat('nl-BE', {maximumFractionDigits:2});
const moneyFmt = new Intl.NumberFormat('nl-BE', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtCell = (c, v) => (c.type === 'money' ? moneyFmt : numFmt).format(v);
const eur = n => eurFmt.format(n || 0);
const eurShort = n => n ? '€ ' + new Intl.NumberFormat('nl-BE', {maximumFractionDigits:0}).format(n) : '';
const salesPageById = id => data.salesPages.find(x => x.id === id);
const sortedSalesPages = () => [...data.salesPages].sort((a, b) => (b.month || '').localeCompare(a.month || '') || (b.order || 0) - (a.order || 0));
const salesCols = () => [...data.salesCols].sort((a, b) => (a.order || 0) - (b.order || 0));
const salesRows = pid => data.sales.filter(r => r.pageId === pid).sort((a, b) => (a.order || 0) - (b.order || 0));
const monthTitle = m => { const [y, mo] = m.split('-').map(Number); return `${cap(MONTHS_LONG[mo - 1])} ${y}`; };
/* ---- Gewonnen deals worden vanzelf een verkoop: op de dag dat de deal op "positief" kwam, in het verkooptabblad van die maand.
   Titel → Klant, veld Prijs → Bedrag, veld Formaat → Formaat. De regel volgt de deal tot je hem zelf bewerkt; gaat de deal terug naar een andere stap, dan verdwijnt hij. ---- */
const isWinStage = id => !!data.stages.find(x => x.id === id)?.positive;
function fieldText(f, v) {
  if (f.type === 'select') return f.options.find(o => o.id === v)?.label ?? '';
  if (f.type === 'multiselect') return (Array.isArray(v) ? v : []).map(id => f.options.find(o => o.id === id)?.label).filter(Boolean).join(', ');
  return v == null ? '' : String(v);
}
function winValues(t) {
  const fs = fieldsFor(t.projectId), by = rx => fs.find(f => rx.test(f.name.trim()));
  const pf = by(/^prijs$/i) || by(/prijs/i), ff = by(/^formaat$/i) || by(/formaat/i);
  const price = pf ? (pf.type === 'number' && typeof t.custom[pf.id] === 'number' ? t.custom[pf.id] : parseNl(fieldText(pf, t.custom[pf.id]))) : null;
  let format = ff ? fieldText(ff, t.custom[ff.id]) : '';
  const known = formatList(format); if (known.length) format = known.join(', ');
  return {title:(t.title || '').trim(), price, format};
}
function winCols() {
  const cols = salesCols(), texts = cols.filter(c => c.type === 'text');
  return {date:cols.find(c => c.type === 'date'), client:texts.find(c => /klant|bedrijf|naam/i.test(c.name)) || texts[0],
    amount:cols.find(c => c.type === 'money'), format:cols.find(c => c.type === 'format'), qty:cols.find(c => c.type === 'number' && /aantal|stuks|#/i.test(c.name))};
}
function fillWinRow(r, t) {
  let c = winCols(); const v = winValues(t); let changed = false;
  if (r.projectId !== t.projectId) { r.projectId = t.projectId; changed = true; }
  if (v.format && !c.format) {   // de verkopentabel heeft nog geen kolom Formaat: die komt er nu bij, achter het bedrag
    const top = Math.max(0, ...data.salesCols.map(x => x.order || 0));
    data.salesCols.push(touch({id:uid(), name:'Formaat', type:'format', fmtMig:true, order:top + 1})); c = winCols();
  }
  const put = (col, val) => { if (!col) return; const same = val == null || val === '' ? r.values[col.id] === undefined : r.values[col.id] === val; if (same) return; if (val == null || val === '') delete r.values[col.id]; else r.values[col.id] = val; changed = true; };
  put(c.client, v.title); put(c.amount, v.price); put(c.format, v.format);
  return changed;
}
function syncWins() {
  if (!data || !data.stages || !feat('sales')) return false;
  let changed = false, byId = null;
  for (const t of data.tasks) {
    const win = isWinStage(t.stage);
    if (!win && !t.wonAt) continue;
    byId ||= new Map(data.sales.map(r => [r.id, r]));
    const rid = 'w_' + t.id, row = byId.get(rid);
    if (win && !t.wonAt) {
      t.wonAt = now(); touch(t); changed = true;
      const month = ymd(new Date(t.wonAt)).slice(0, 7), c = winCols();
      let pg = data.salesPages.find(x => x.month === month);
      if (!pg) { pg = touch({id:uid(), title:monthTitle(month), month, notes:'', target:null, workdays:null, order:now()}); data.salesPages.push(pg); }
      if (row) continue;
      const r = touch({id:rid, pageId:pg.id, order:now(), values:{}, dealId:t.id});
      if (c.date) r.values[c.date.id] = ymd(new Date(t.wonAt));
      if (c.qty) r.values[c.qty.id] = 1;
      fillWinRow(r, t); delete data.deleted[rid]; data.sales.push(r); byId.set(rid, r);
    } else if (!win && t.wonAt) {
      t.wonAt = null; touch(t); changed = true;
      if (row && row.dealId === t.id) { data.sales = data.sales.filter(x => x !== row); tombstone(rid); }
    } else if (win && row && row.dealId === t.id && fillWinRow(row, t)) { touch(row); changed = true; }
  }
  return changed;
}
const toNum = v => parseNl(v);
// Werkdagen: ma–vr zonder Belgische wettelijke feestdagen.
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114;
  return new Date(y, Math.floor(n / 31) - 1, n % 31 + 1);
}
function beHolidays(y) {
  const e = easter(y), plus = n => { const d = new Date(e); d.setDate(d.getDate() + n); return ymd(d); };
  return new Set([`${y}-01-01`, plus(1), `${y}-05-01`, plus(39), plus(50), `${y}-07-21`, `${y}-08-15`, `${y}-11-01`, `${y}-11-11`, `${y}-12-25`]);
}
function workdaysOf(month) {
  const [y, m] = month.split('-').map(Number), hol = beHolidays(y), out = [];
  for (const d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) {
    const w = d.getDay(), k = ymd(d);
    if (w > 0 && w < 6 && !hol.has(k)) out.push(k);
  }
  return out;
}
function salesPace(pg, total) {
  const target = toNum(pg.target);
  if (!target || !/^\d{4}-\d\d$/.test(pg.month || '')) return null;
  const days = workdaysOf(pg.month), td = today(), n = pg.workdays > 0 ? pg.workdays : days.length;
  let elapsed = days.filter(d => d < td).length;
  elapsed = Math.min(elapsed, n);
  const remaining = Math.max(0, n - elapsed);                       // werkdagen over, vandaag meegeteld
  const after = Math.max(0, n - Math.min(n, days.filter(d => d <= td).length));   // werkdagen na vandaag
  const left = round2(target - total);
  // Het bedrag per dag wordt verdeeld over de werkdagen ná vandaag: wat vandaag verkocht wordt zit al in de omzet.
  return {n, elapsed, remaining, after, left, perDay:after ? left / after : null, todayWork:days.includes(td),
    diff:round2(total - target * elapsed / n), past:td.slice(0, 7) > pg.month, future:td.slice(0, 7) < pg.month};
}
function paceHtml(pg, total) {
  const p = salesPace(pg, total); if (!p) return '';
  if (p.left <= 0) return `<div class="pace hit"><b>Doel behaald.</b><span>${eur(-p.left)} boven de doelstelling · ${p.n} werkdagen</span></div>`;
  if (p.past || !p.remaining) return `<div class="pace behind"><b>Nog ${eur(p.left)} tekort</b><span>maand afgelopen · ${p.n} werkdagen</span></div>`;
  const sched = p.elapsed ? (p.diff >= 0 ? `<em class="ahead">${eur(p.diff)} vóór op schema</em>` : `<em class="behind">${eur(-p.diff)} achter op schema</em>`) : '';
  if (!p.after) return `<div class="pace behind"><div><b>Nog ${eur(p.left)} te gaan</b><span>vandaag is de laatste werkdag van de maand</span></div>${sched ? `<div>${sched}</div>` : ''}</div>`;
  const nd = p.after;
  return `<div class="pace ${p.elapsed && p.diff < 0 ? 'behind' : ''}">
    <div><b>Nog ${eur(p.left)} te gaan</b><span>${nd} ${nd === 1 ? 'werkdag' : 'werkdagen'} over${p.future || !p.todayWork ? '' : ' (vandaag niet meegeteld)'} van ${p.n}</span></div>
    <div><b>${eur(p.perDay)} per dag nodig</b>${sched}</div>
  </div>`;
}
// Commissie- en bonusregeling Adrem (vanaf 1 februari 2026, bruto).
// Commissie: 10 % op de omzet boven 88,90 € per effectief gewerkt uur (675,62 € per werkdag).
// Bonus: vast bedrag volgens de hoogste bereikte schijf netto-omzet per maand.
const PAY = {rate:0.10, perDay:675.62, tiers:[
  [13579.81, 226.33], [15843.10, 271.60], [18106.41, 316.87], [20369.71, 362.11], [22633.02, 407.39], [24896.30, 452.65],
  [27159.61, 497.92], [29422.91, 543.18], [31686.22, 588.46], [33949.51, 633.72], [36212.81, 678.99], [38476.12, 724.25],
  [40739.42, 769.53], [43002.71, 814.79], [45266.01, 905.32], [47529.32, 995.86], [49792.62, 1086.38], [52055.94, 1176.90]]};
function salesPay(pg, total) {
  if (!/^\d{4}-\d\d$/.test(pg.month || '')) return null;
  const days = pg.workdays > 0 ? pg.workdays : workdaysOf(pg.month).length;
  const threshold = round2(days * PAY.perDay), commission = round2(Math.max(0, total - threshold) * PAY.rate);
  let tier = null, next = null;
  for (const t of PAY.tiers) { if (total >= t[0]) tier = t; else { next = t; break; } }
  const bonus = tier ? tier[1] : 0;
  return {days, threshold, commission, bonus, tier, next, sum:round2(commission + bonus)};
}
// Netto-schatting: 13,07 % RSZ, daarna bedrijfsvoorheffing (instelbaar, standaard 45 %).
const RSZ = 0.1307, payTax = () => { const v = data.settings.payTax; return v >= 0 && v < 100 ? v : 45; };
const pctFmt = n => String(n).replace('.', ',') + ' %';
const netOf = gross => round2(gross * (1 - RSZ) * (1 - payTax() / 100));
function payHtml(pg, total) {
  const p = salesPay(pg, total); if (!p) return '';
  const nextTxt = p.next ? `nog ${eur(p.next[0] - total)} tot bonus ${eur(p.next[1])}` : 'hoogste schijf bereikt';
  const comTxt = p.commission ? `10 % op ${eur(total - p.threshold)} boven ${eur(p.threshold)}` : `nog ${eur(p.threshold - total)} tot de drempel van ${eur(p.threshold)}`;
  return `<div class="pace pay">
    <div><b>${eur(p.sum)}</b><span>commissie + bonus (bruto)</span></div>
    <div><b>Commissie ${eur(p.commission)}</b><span>${comTxt} · ${p.days} werkdagen</span></div>
    <div><b>Bonus ${eur(p.bonus)}</b><span>${p.tier ? `schijf vanaf ${eur(p.tier[0])} · ` : ''}${nextTxt}</span></div>
    <div class="pay-net"><div><b>± ${eur(netOf(p.sum))} netto</b><span>commissie ${eur(netOf(p.commission))} · bonus ${eur(netOf(p.bonus))}</span></div>
      <span class="muted">na ${pctFmt(RSZ * 100)} RSZ en ${pctFmt(payTax())} bedrijfsvoorheffing · <button type="button" class="linklike" data-paytax>aanpassen</button></span></div>
  </div>`;
}
function salesTotals(pid) {
  const rows = salesRows(pid), cols = salesCols(), per = {};
  let money = 0;
  for (const c of cols) if (c.type === 'money' || c.type === 'number') {
    per[c.id] = rows.reduce((sum, r) => sum + (toNum(r.values[c.id]) || 0), 0);
    if (c.type === 'money') money += per[c.id];
  }
  return {per, money, count:rows.length};
}
const fmtChips = v => { const l = formatList(v); return l.length ? l.map(o => `<span class="fchip ${o === 'Annulatie' ? 'neg' : ''}">${esc(o)}</span>`).join('') : `<span class="fph">${v ? esc(v) : 'Kies…'}</span>`; };
function cellInput(c, r) {
  const v = r.values[c.id] ?? '';
  const a = `class="cell t-${c.type}" data-col="${c.id}" aria-label="${esc(c.name)}"`;
  // een echt datumveld per rij is zwaar om te tekenen: tekstveld tot je erin klikt, dan pas de datumkiezer (zie focusin)
  if (c.type === 'date') return `<input type="text" ${a} value="${esc(fmtDateInp(v))}" data-iso="${esc(v)}" placeholder="dd/mm/jjjj" autocomplete="off">`;
  if (c.type === 'format') return `<button type="button" ${a} aria-haspopup="true">${fmtChips(v)}</button>`;
  if (c.type === 'money' || c.type === 'number') return `<input type="text" inputmode="decimal" ${a} value="${esc(v === '' ? '' : fmtCell(c, v))}" placeholder="${c.type === 'money' ? '€ 0,00' : '0'}">`;
  const input = `<input type="text" ${a} value="${esc(v)}">`;
  if (c.id === winCols().client?.id) {
    const pid = r.projectId !== undefined ? r.projectId : taskById(r.dealId || (r.id.startsWith('w_') ? r.id.slice(2) : ''))?.projectId || '';
    const name = pid ? data.projects.find(p => p.id === pid)?.name || 'Verwijderd project' : 'Project koppelen';
    return `<div class="crm-sales-client">${input}<button type="button" class="crm-sales-project-btn" data-crm-sales-project="${esc(r.id)}" title="Project aanpassen" aria-label="Project aanpassen: ${esc(name)}">${esc(name)}<span aria-hidden="true">⌄</span></button></div>`;
  }
  return input;
}
// Weeknummer binnen de maand zoals je het zelf noteert: week 1 = de (eventueel onvolledige) eerste week.
function weekOfMonth(dateStr) {
  const d = parseYmd(dateStr), first = new Date(d.getFullYear(), d.getMonth(), 1);
  return Math.floor((d.getDate() + (first.getDay() + 6) % 7 - 1) / 7) + 1;
}
// Groepeert rijen per week en per dag, nieuwste eerst; rijen zonder datum komen onderaan.
function salesGroups(rows, dateCol, moneyCol) {
  const amt = r => moneyCol ? (toNum(r.values[moneyCol.id]) || 0) : 0;
  const weeks = new Map(), none = {key:'none', rows:[], sum:0};
  const sorted = [...rows].sort((a, b) => (b.values[dateCol.id] || '').localeCompare(a.values[dateCol.id] || '') || (b.order || 0) - (a.order || 0));
  for (const r of sorted) {
    const d = r.values[dateCol.id];
    if (!d || !/^\d{4}-\d\d-\d\d$/.test(d)) { none.rows.push(r); none.sum += amt(r); continue; }
    const wk = d.slice(0, 7) + ':' + weekOfMonth(d);
    if (!weeks.has(wk)) weeks.set(wk, {key:wk, n:weekOfMonth(d), sum:0, days:new Map()});
    const w = weeks.get(wk);
    if (!w.days.has(d)) w.days.set(d, {date:d, sum:0, rows:[]});
    const day = w.days.get(d);
    day.rows.push(r); day.sum += amt(r); w.sum += amt(r);
  }
  return {weeks:[...weeks.values()], none};
}
function renderSales(force) {
  const pg = salesPageById(view.id); if (!pg) return;
  const active = document.activeElement;
  const focusCell = active?.classList.contains('cell') && $('#salesPage').contains(active) ? {row:active.closest('tr').dataset.row, col:active.dataset.col} : null;
  if (!force && focusCell) { updateSalesTotals(true); return; }
  const cols = salesCols(), rows = salesRows(pg.id), tot = salesTotals(pg.id);
  const moneyCols = cols.filter(c => c.type === 'money');
  const dateCol = cols.find(c => c.type === 'date');
  const grouped = !!dateCol;
  const el = $('#salesPage');
  const focusedNotes = active?.id === 'spNotes';
  const span = cols.length + 1;
  const rowHtml = r => `<tr data-row="${r.id}">${cols.map(c => `<td class="c-${c.type}">${cellInput(c, r)}</td>`).join('')}<td class="del"><button type="button" class="icon-btn" data-delrow aria-label="Verkoop verwijderen" title="Verwijderen">${I.trash}</button></td></tr>`;
  let body = '';
  if (grouped) {
    const g = salesGroups(rows, dateCol, moneyCols[0]);
    for (const w of g.weeks) {
      body += `<tr class="grp-week"><td colspan="${span}"><span>Week ${w.n}</span><b data-gsum="${w.key}">${eur(w.sum)}</b></td></tr>`;
      for (const d of w.days.values()) {
        const dt = parseYmd(d.date);
        body += `<tr class="grp-day"><td colspan="${span}"><span>${cap(DAYS[dt.getDay()])} ${dt.getDate()} ${MONTHS[dt.getMonth()]}</span><b data-gsum="${d.date}">${eur(d.sum)}</b></td></tr>`;
        body += d.rows.map(rowHtml).join('');
      }
    }
    if (g.none.rows.length) body += `<tr class="grp-week"><td colspan="${span}"><span>Zonder datum</span><b data-gsum="none">${eur(g.none.sum)}</b></td></tr>` + g.none.rows.map(rowHtml).join('');
  } else body = [...rows].reverse().map(rowHtml).join('');
  const target = toNum(pg.target), main = moneyCols[0] ? tot.per[moneyCols[0].id] : 0;
  const pct = target ? Math.round(main / target * 100) : 0;
  el.innerHTML = `
    ${crmSalesToolsHtml(pg)}
    <section class="pcalc sp-card">
    <div class="sales-head">
      ${moneyCols.map(c => `<div class="sales-stat"><span>${esc(c.name)} totaal</span><b data-total="${c.id}">${eur(tot.per[c.id])}</b></div>`).join('')}
      ${target ? `<div class="sales-stat target ${pct >= 100 ? 'hit' : ''}"><span>Doelstelling ${eur(target)}</span><b data-pct>${pct}% behaald</b><i class="bar"><i data-bar style="width:${Math.min(100, pct)}%"></i></i></div>` : ''}
      <div class="sales-stat count"><span>Aantal verkopen</span><b data-count>${rows.length}</b></div>
      <span class="grow"></span>
    </div>
    ${target?`<details class="crm-optional" data-crm-disclosure="pace:${esc(pg.id)}" ${crmMoreOpen['pace:'+pg.id]?'open':''}><summary>Voortgang en dagdoel bekijken</summary><div id="spPace">${paceHtml(pg, main)}</div></details>`:'<div id="spPace"></div>'}
    <details class="crm-optional" data-crm-disclosure="pay:${esc(pg.id)}" ${crmMoreOpen['pay:'+pg.id]?'open':''}><summary>Commissie en bonus bekijken</summary><div id="spPay">${payHtml(pg, main)}</div></details>
    </section>
    <p class="crm-screen-help">${crmSalesLayout==='table'?'Je wijzigingen in de tabel worden automatisch bewaard.':'Je verkopen staan hieronder. Klik op Bewerken om iets aan te passen.'}</p>
    ${crmSalesLayout==='list'?crmSalesListHtml(pg,rows,cols):''}
    <div class="table-wrap" ${crmSalesLayout==='list'?'hidden':''}><table class="sales ${grouped ? 'grouped' : ''}">
      <thead><tr>${cols.map(c => `<th class="t-${c.type}">${esc(c.name)}</th>`).join('')}<th class="del"></th></tr></thead>
      <tbody>${body || `<tr class="empty-row"><td colspan="${span}">Nog geen verkopen deze maand. Klik op Verkoop toevoegen.</td></tr>`}</tbody>
      <tfoot><tr>${cols.map((c, i) => `<td class="t-${c.type}" data-foot="${c.id}">${c.type === 'money' ? eur(tot.per[c.id]) : c.type === 'number' ? numFmt.format(tot.per[c.id]) : i === 0 ? 'Totaal' : ''}</td>`).join('')}<td></td></tr></tfoot>
    </table></div>
    <details class="crm-optional" data-crm-disclosure="notes:${esc(pg.id)}" ${crmMoreOpen['notes:'+pg.id]?'open':''}><summary>Maandnotities${pg.notes?' · ingevuld':''}</summary><label class="fl">Notities<textarea id="spNotes" rows="3" placeholder="Doelen, opmerkingen…">${esc(pg.notes || '')}</textarea></label><p class="muted">Wordt automatisch bewaard.</p></details>`;
  if (focusedNotes) { const n = $('#spNotes'); n.focus(); n.selectionStart = n.selectionEnd = n.value.length; }
  if (focusCell) $(`tr[data-row="${focusCell.row}"] .cell[data-col="${focusCell.col}"]`)?.focus();
  autosize($('#spNotes'));
}
function updateSalesTotals(skipNav) {
  const pg = salesPageById(view.id); if (!pg) return;
  const tot = salesTotals(view.id), cols = salesCols();
  for (const c of cols) {
    if (c.type === 'money') { $(`[data-total="${c.id}"]`) && ($(`[data-total="${c.id}"]`).textContent = eur(tot.per[c.id])); $(`[data-foot="${c.id}"]`).textContent = eur(tot.per[c.id]); }
    if (c.type === 'number') $(`[data-foot="${c.id}"]`).textContent = numFmt.format(tot.per[c.id]);
  }
  $('[data-count]').textContent = tot.count;
  const moneyCol = cols.find(c => c.type === 'money'), dateCol = cols.find(c => c.type === 'date');
  const target = toNum(pg.target);
  const pe = $('#spPace'); if (pe) pe.innerHTML = paceHtml(pg, moneyCol ? tot.per[moneyCol.id] : 0);
  const pp = $('#spPay'); if (pp) pp.innerHTML = payHtml(pg, moneyCol ? tot.per[moneyCol.id] : 0);
  if (target && $('[data-pct]')) {
    const pct = Math.round((moneyCol ? tot.per[moneyCol.id] : 0) / target * 100);
    $('[data-pct]').textContent = pct + '% behaald'; $('[data-bar]').style.width = Math.min(100, pct) + '%';
    $('[data-pct]').closest('.sales-stat').classList.toggle('hit', pct >= 100);
  }
  if (dateCol && !pg.flat) {
    const g = salesGroups(salesRows(pg.id), dateCol, moneyCol);
    for (const w of g.weeks) {
      const e = $(`[data-gsum="${w.key}"]`); if (e) e.textContent = eur(w.sum);
      for (const d of w.days.values()) { const e2 = $(`[data-gsum="${d.date}"]`); if (e2) e2.textContent = eur(d.sum); }
    }
    const en = $('[data-gsum="none"]'); if (en) en.textContent = eur(g.none.sum);
  }
  if (!skipNav) renderNav();
}
function openPayTaxDialog() {
  showDialog(`
    <h3>Netto berekening</h3>
    <p class="muted small" style="margin:0 0 10px">Netto = bruto − ${pctFmt(RSZ * 100)} RSZ, daarna − bedrijfsvoorheffing. Bij een voltijds loon ligt die op commissie en bonus meestal rond 40 à 50 %. Het juiste percentage vind je op je loonfiche: ingehouden bedrijfsvoorheffing ÷ belastbaar bedrag van een maand met commissie of bonus.</p>
    <label class="fl">Bedrijfsvoorheffing (%)<input id="ptPct" type="text" inputmode="decimal" value="${esc(pctFmt(payTax()).replace(' %', ''))}"></label>
    <div class="dlg-actions"><span class="grow"></span>
      <button type="button" class="btn" id="ptCancel">Annuleren</button>
      <button type="button" class="btn primary" id="ptSave">Opslaan</button></div>`, d => {
    $('#ptCancel', d).onclick = () => dlg.close();
    $('#ptSave', d).onclick = () => {
      const v = toNum($('#ptPct', d).value.replace('%', ''));
      if (v === null || v < 0 || v >= 100) { $('#ptPct', d).focus(); return; }
      data.settings.payTax = v; dlg.close(); save(); renderSales(true);
    };
    $('#ptPct', d).onkeydown = e => { if (e.key === 'Enter') $('#ptSave', d).click(); };
  });
}
let fmtPop = null;
function closeFormatPop() { fmtPop?.remove(); fmtPop = null; }
function openFormatPop(cell) {
  const same = fmtPop && fmtPop.dataset.for === cell.closest('tr').dataset.row + cell.dataset.col;
  closeFormatPop(); if (same) return;
  const r = data.sales.find(x => x.id === cell.closest('tr').dataset.row), colId = cell.dataset.col; if (!r) return;
  const pop = fmtPop = document.createElement('div');
  pop.id = 'fmtPop'; pop.dataset.for = r.id + colId; pop.setAttribute('role', 'listbox'); pop.setAttribute('aria-multiselectable', 'true');
  const draw = () => {
    const cur = formatList(r.values[colId]);
    pop.innerHTML = FORMATS.map(o => `<button type="button" role="option" aria-selected="${cur.includes(o)}" data-fmt="${esc(o)}" class="${cur.includes(o) ? 'on' : ''}"><i>${I.check}</i>${esc(o)}</button>`).join('')
      + `<div class="fp-foot"><button type="button" data-fclear>Wissen</button><button type="button" data-fdone>Klaar</button></div>`;
  };
  draw();
  document.body.appendChild(pop);
  pop.place = () => {
    const live = $(`tr[data-row="${r.id}"] .cell[data-col="${colId}"]`) || cell;
    const rc = live.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    if (!live.isConnected || rc.bottom < 0 || rc.top > innerHeight) { closeFormatPop(); return; }
    const left = Math.max(8, Math.min(rc.left, innerWidth - pw - 8));
    const top = rc.bottom + ph + 8 < innerHeight ? rc.bottom + 4 : Math.max(8, rc.top - ph - 4);
    Object.assign(pop.style, {left:left + 'px', top:top + 'px'});
  };
  pop.place();
  pop.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-fdone')) { closeFormatPop(); cell.focus(); return; }
    let cur = formatList(r.values[colId]);
    if (b.hasAttribute('data-fclear')) cur = [];
    else { const o = b.dataset.fmt; cur = cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o]; }
    const nv = FORMATS.filter(o => cur.includes(o)).join(', ');
    if (nv) r.values[colId] = nv; else delete r.values[colId];
    delete r.dealId;
    touch(r); save(true); draw();
    const live = $(`tr[data-row="${r.id}"] .cell[data-col="${colId}"]`); if (live) live.innerHTML = fmtChips(r.values[colId]);
  });
}
document.addEventListener('pointerdown', e => { if (fmtPop && !fmtPop.contains(e.target) && !e.target.closest('.cell.t-format')) closeFormatPop(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && fmtPop) { e.stopPropagation(); closeFormatPop(); } }, true);
for (const t of [$('#main'), window]) t.addEventListener('scroll', () => fmtPop?.place(), {passive:true, capture:true});
addEventListener('resize', () => fmtPop?.place());
function addSalesRow() { crmOpenSaleEditor(); }
const sp = $('#salesPage');
sp.addEventListener('input', e => {
  const pg = salesPageById(view.id); if (!pg) return;
  if (e.target.id === 'spNotes') { pg.notes = e.target.value; touch(pg); autosize(e.target); save(true); return; }
  const cell = e.target.closest('.cell'); if (!cell) return;
  const r = data.sales.find(x => x.id === cell.closest('tr').dataset.row); if (!r) return;
  const c = data.salesCols.find(x => x.id === cell.dataset.col);
  const v = c.type === 'money' || c.type === 'number' ? toNum(cell.value) : cell.value;
  if (v === null || v === '') delete r.values[c.id]; else r.values[c.id] = v;
  delete r.dealId;   // handmatig aangepast: de regel volgt de deal niet meer
  touch(r); save(true); updateSalesTotals();
});
sp.addEventListener('change', e => {
  if (e.target.matches('.cell.t-date')) setTimeout(() => renderSales(true), 0);
});
sp.addEventListener('focusout', e => {
  const dc = e.target.closest('.cell.t-date');
  if (dc && dc.type === 'date') { dc.dataset.iso = dc.value; dc.type = 'text'; dc.value = fmtDateInp(dc.dataset.iso); return; }
  // bedragen netjes opmaken na het typen
  const cell = e.target.closest('.cell.t-money,.cell.t-number'); if (!cell) return;
  const r = data.sales.find(x => x.id === cell.closest('tr').dataset.row);
  const v = r?.values[cell.dataset.col], c = data.salesCols.find(x => x.id === cell.dataset.col);
  cell.value = v === undefined || !c ? '' : fmtCell(c, v);
});
sp.addEventListener('focusin', e => {
  const dc = e.target.closest('.cell.t-date');
  if (dc && dc.type === 'text') { dc.type = 'date'; dc.value = dc.dataset.iso || ''; return; }
  const cell = e.target.closest('.cell.t-money,.cell.t-number'); if (!cell) return;
  const r = data.sales.find(x => x.id === cell.closest('tr').dataset.row);
  const v = r?.values[cell.dataset.col];
  cell.value = v === undefined ? '' : String(v).replace('.', ',');
  cell.select();
});
sp.addEventListener('keydown', e => {
  const cell = e.target.closest('.cell'); if (!cell || e.key !== 'Enter' || cell.matches('.t-format')) return;
  e.preventDefault();
  const tr = cell.closest('tr'), next = tr.nextElementSibling;
  if (next?.dataset.row) $(`.cell[data-col="${cell.dataset.col}"]`, next).focus();
  else addSalesRow();
});
sp.addEventListener('click', e => {
  const fc = e.target.closest('.cell.t-format'); if (fc) { openFormatPop(fc); return; }
  const flat = e.target.closest('[data-flat]');
  if (flat) { const pg = salesPageById(view.id); pg.flat = flat.dataset.flat === '1'; touch(pg); commit(); return; }
  if (e.target.closest('#spImport')) { openSalesImportDialog(); return; }
  if (e.target.closest('#spAdd')) addSalesRow();
  if (e.target.closest('[data-paytax]')) openPayTaxDialog();
  else if (e.target.closest('#spCols')) openSalesColsDialog();
  else if (e.target.closest('#spCsv')) exportSalesCsv();
  else if (e.target.closest('[data-delrow]')) {
    const id = e.target.closest('tr').dataset.row, r = data.sales.find(x => x.id === id);
    const copy = JSON.parse(JSON.stringify(r));
    data.sales = data.sales.filter(x => x.id !== id); tombstone(id); commit();
    toast('Verkoop verwijderd', () => { delete data.deleted[id]; data.sales.push(touch(copy)); commit(); });
  }
});
function exportSalesCsv() {
  const pg = salesPageById(view.id), cols = salesCols();
  const q = v => /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  const fmt = (c, v) => v === undefined ? '' : (c.type === 'money' || c.type === 'number') ? String(v).replace('.', ',')
    : c.type === 'date' && /^\d{4}-\d\d-\d\d$/.test(v) ? v.split('-').reverse().join('/') : String(v);
  const lines = [cols.map(c => q(c.name)).join(';'), ...salesRows(pg.id).map(r => cols.map(c => q(fmt(c, r.values[c.id]))).join(';'))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], {type:'text/csv;charset=utf-8'}));
  a.download = `verkopen-${pg.month || pg.title}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function openSalesPageDialog(pg) {
  const isNew = !pg;
  let month = pg?.month;
  if (!month) {
    const d = new Date(); d.setDate(1);
    for (let i = 0; i < 24; i++) { const m = ymd(d).slice(0, 7); if (!data.salesPages.some(x => x.month === m)) { month = m; break; } d.setMonth(d.getMonth() + 1); }
  }
  const n = pg ? salesRows(pg.id).length : 0;
  let titleTouched = !!pg;
  showDialog(`
    <h3>${isNew ? 'Verkoopmaand toevoegen' : 'Verkoopmaand bewerken'}</h3>
    <label class="fl">Maand<input id="pgMonth" type="month" value="${esc(month || '')}"></label>
    <label class="fl">Titel<input id="pgTitle" type="text" value="${esc(pg?.title || (month ? monthTitle(month) : ''))}"></label>
    <label class="fl">Doelstelling (€) <span class="muted">(optioneel)</span><input id="pgTarget" type="text" inputmode="decimal" value="${esc(pg?.target ? moneyFmt.format(pg.target) : '')}" placeholder="bv. 13.881,21"></label>
    <details class="crm-form-extra"><summary>Werkdagen aanpassen (optioneel)</summary><label class="fl">Werkdagen <span class="muted" id="pgWorkHint">(leeg = automatisch${month ? ': ' + workdaysOf(month).length : ''})</span><input id="pgWork" type="number" inputmode="numeric" min="1" max="31" value="${esc(pg?.workdays || '')}" placeholder="automatisch"></label>
    <p class="muted small" style="margin:6px 0 0">Automatisch = maandag tot vrijdag, zonder Belgische feestdagen.</p></details>
    <div class="dlg-actions">
      ${pg ? `<button type="button" class="btn danger" id="pgDel">Verwijderen</button>` : ''}
      <span class="grow"></span>
      <button type="button" class="btn" id="pgCancel">Annuleren</button>
      <button type="button" class="btn primary" id="pgSave">${isNew ? 'Aanmaken' : 'Opslaan'}</button>
    </div>`, d => {
    $('#pgTitle', d).oninput = () => titleTouched = true;
    $('#pgMonth', d).onchange = e => {
      if (!titleTouched && e.target.value) $('#pgTitle', d).value = monthTitle(e.target.value);
      $('#pgWorkHint', d).textContent = `(leeg = automatisch${e.target.value ? ': ' + workdaysOf(e.target.value).length : ''})`;
    };
    $('#pgCancel', d).onclick = () => dlg.close();
    $('#pgSave', d).onclick = () => {
      const m = $('#pgMonth', d).value, title = $('#pgTitle', d).value.trim() || (m ? monthTitle(m) : 'Verkopen');
      const target = parseAmount($('#pgTarget', d).value);
      const workdays = parseInt($('#pgWork', d).value, 10) || null;
      if (isNew) {
        const np = touch({id:uid(), title, month:m, notes:'', target, workdays, order:now()});
        data.salesPages.push(np); dlg.close(); save(); setView({type:'sales', id:np.id}); return;
      } else Object.assign(pg, {title, month:m, target, workdays}, {u:now()});
      dlg.close(); commit();
    };
    $('#pgDel', d)?.addEventListener('click', async () => { if (await deleteSalesPage(pg)) dlg.close(); });
  });
}
async function deleteSalesPage(pg) {
  const n = salesRows(pg.id).length;
  if (!await askConfirm('Pagina verwijderen?', `Pagina “${pg.title}”${n ? ` en de ${n} verkopen erop` : ''} wordt definitief verwijderd.`, {ok:'Verwijderen', danger:true})) return false;
  for (const r of salesRows(pg.id)) tombstone(r.id);
  data.sales = data.sales.filter(r => r.pageId !== pg.id);
  data.salesPages = data.salesPages.filter(x => x.id !== pg.id); tombstone(pg.id);
  view = {type:'all'}; commit(); return true;
}
/* ---- Notities plakken: je eigen notatie omzetten naar verkopen ----
   Week 2 - €4.665
   Maandag - €600
   1x 1/16 - €100
   1x 1/4 (€1295 ⇒ deler) - €647,5
   2x annulatie - €360          (wordt afgetrokken)
   Doelstelling: €13.881,21 */
const WEEKDAYS_NL = {maandag:0, dinsdag:1, woensdag:2, donderdag:3, vrijdag:4, zaterdag:5, zondag:6};
function parseAmount(v) {
  if (v == null) return null;
  let s = String(v).replace(/[€\s]/g, '').replace(/−/g, '-');
  if (!s) return null;
  const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : neg ? -n : n;
}
const round2 = n => Math.round(n * 100) / 100;
function parseSalesNotes(text, month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const monday1 = new Date(y, m - 1, 1 - (first.getDay() + 6) % 7);
  const res = {weeks:[], target:null, notedTotal:null, warnings:[], unknown:[]};
  let week = null, day = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let mm;
    if ((mm = line.match(/^week\s*(\d+)\s*(?:[-–:]\s*(.*))?$/i))) {
      week = {n:+mm[1], noted:parseAmount(mm[2]), days:[]}; res.weeks.push(week); day = null; continue;
    }
    if ((mm = line.match(/^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\s*(?:[-–:]\s*(.*))?$/i))) {
      if (!week) { week = {n:1, noted:null, days:[]}; res.weeks.push(week); }
      const d = new Date(monday1); d.setDate(d.getDate() + (week.n - 1) * 7 + WEEKDAYS_NL[mm[1].toLowerCase()]);
      day = {name:cap(mm[1].toLowerCase()), date:ymd(d), noted:parseAmount(mm[2]), items:[], week:week.n};
      week.days.push(day);
      if (day.date.slice(0, 7) !== month) res.warnings.push(`${day.name} van week ${week.n} valt buiten deze maand (${day.date.split('-').reverse().join('/')}).`);
      continue;
    }
    if ((mm = line.match(/^doelstelling\s*[:\-–]?\s*(.+)$/i))) {
      const wd = mm[1].match(/(\d+)\s*werkdag/i); if (wd) res.workdays = +wd[1];
      res.target = parseAmount(mm[1].replace(/\(.*\)/, '')); continue;
    }
    if ((mm = line.match(/^totaal[^:\-–]*[:\-–]\s*(.+)$/i))) { res.notedTotal = parseAmount(mm[1]); continue; }
    if ((mm = line.match(/^(?:(\d+)\s*x\s*)?(.+?)\s+[-–]\s*(-?\s*€?\s*-?[\d.,]+)\s*$/i))) {
      if (!day) { res.unknown.push(line); continue; }
      let desc = mm[2].trim(), note = '';
      const pm = desc.match(/^(.*?)\s*\((.*)\)\s*$/); if (pm) { desc = pm[1].trim(); note = pm[2].trim(); }
      let qty = mm[1] ? +mm[1] : 1, amount = parseAmount(mm[3]);
      if (amount === null) { res.unknown.push(line); continue; }
      if (/annul/i.test(desc)) { amount = -Math.abs(amount); qty = -qty; desc = 'Annulatie'; }
      day.items.push({qty, format:desc, amount, note});
      continue;
    }
    res.unknown.push(line);
  }
  // controles
  let total = 0;
  for (const w of res.weeks) {
    w.sum = 0;
    for (const d of w.days) {
      d.sum = round2(d.items.reduce((a, it) => a + it.amount, 0));
      d.diff = d.noted == null ? 0 : round2(d.noted - d.sum);
      w.sum += d.sum;
    }
    w.sum = round2(w.sum); total += w.sum;
    w.notedDays = round2(w.days.reduce((a, d) => a + (d.noted ?? d.sum), 0));
  }
  res.total = round2(total);
  return res;
}
function openSalesImportDialog() {
  const pg = salesPageById(view.id); if (!pg) return;
  const existing = salesRows(pg.id).length;
  let text = '';
  showDialog(`
    <h3>Notities plakken</h3>
    <p class="muted small" style="margin:0">Plak je verkopen zoals je ze noteert: <code>Week 2 - €4.665</code>, <code>Maandag - €600</code>, <code>2x 1/16 - €175</code>, <code>1x annulatie - €150</code>, <code>Doelstelling: €13.881,21</code>. Ze komen op <b>${esc(pg.title)}</b>.</p>
    ${pg.month ? '' : '<p class="err">Kies eerst een maand voor deze pagina (via ⋯), anders kunnen de datums niet berekend worden.</p>'}
    <textarea id="imText" rows="9" style="margin-top:10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px" placeholder="Week 1 - €935&#10;Vrijdag - €935&#10;1x annulatie - €150&#10;…"></textarea>
    <div id="imPreview"></div>
    <label class="chk" style="margin-top:10px"><input type="checkbox" id="imFill" checked> Als de regels van een dag niet optellen tot het genoteerde dagtotaal: een regel “Niet gespecificeerd” toevoegen voor het verschil (vanaf € 1)</label>
    ${existing ? `<label class="chk" style="margin-top:6px"><input type="checkbox" id="imReplace"> De ${existing} bestaande regels op deze pagina vervangen</label>` : ''}
    <div class="dlg-actions"><span class="grow"></span><button type="button" class="btn" id="imCancel">Annuleren</button><button type="button" class="btn primary" id="imGo" disabled>Importeren</button></div>`, d => {
    const preview = () => {
      text = $('#imText', d).value;
      const box = $('#imPreview', d);
      if (!text.trim() || !pg.month) { box.innerHTML = ''; $('#imGo', d).disabled = true; return; }
      const r = parseSalesNotes(text, pg.month);
      const fill = $('#imFill', d).checked;
      const items = r.weeks.reduce((a, w) => a + w.days.reduce((b, x) => b + x.items.length, 0), 0);
      const fills = r.weeks.flatMap(w => w.days.filter(x => Math.abs(x.diff) >= 1));
      const total = round2(r.total + (fill ? fills.reduce((a, x) => a + x.diff, 0) : 0));
      const issues = [];
      for (const w of r.weeks) {
        for (const x of w.days) if (Math.abs(x.diff) >= 0.01) issues.push(`Week ${w.n}, ${x.name.toLowerCase()}: regels samen ${eur(x.sum)}, genoteerd ${eur(x.noted)} (verschil ${eur(x.diff)})${Math.abs(x.diff) >= 1 ? (fill ? ' → aangevuld' : '') : ' → afronding, niet aangevuld'}.`);
        if (w.noted != null && Math.abs(w.noted - w.notedDays) >= 0.01) issues.push(`Week ${w.n}: dagtotalen samen ${eur(w.notedDays)}, genoteerd ${eur(w.noted)}.`);
      }
      if (r.notedTotal != null && Math.abs(r.notedTotal - total) >= 0.01) issues.push(`Genoteerd maandtotaal ${eur(r.notedTotal)}, na import ${eur(total)} (verschil ${eur(round2(r.notedTotal - total))}).`);
      box.innerHTML = `
        <div class="im-sum">
          <div><span>Regels</span><b>${items + (fill ? fills.length : 0)}</b></div>
          <div><span>Dagen</span><b>${r.weeks.reduce((a, w) => a + w.days.length, 0)}</b></div>
          <div><span>Totaal</span><b>${eur(total)}</b></div>
          ${r.target != null ? `<div><span>Doelstelling</span><b>${eur(r.target)}</b></div>` : ''}
          ${r.workdays ? `<div><span>Werkdagen</span><b>${r.workdays}</b></div>` : ''}
        </div>
        <table class="im-weeks">${r.weeks.map(w => `<tr><td>Week ${w.n}</td><td>${w.days.map(x => x.name.slice(0, 2).toLowerCase()).join(' ')}</td><td>${eur(round2(w.sum + (fill ? w.days.filter(x => Math.abs(x.diff) >= 1).reduce((a, x) => a + x.diff, 0) : 0)))}</td></tr>`).join('')}</table>
        ${issues.length ? `<div class="im-warn"><b>Controle</b><ul>${issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '<p class="im-ok">✓ Alle dag- en weektotalen kloppen.</p>'}
        ${r.warnings.length || r.unknown.length ? `<div class="im-warn"><b>Let op</b><ul>${r.warnings.map(x => `<li>${esc(x)}</li>`).join('')}${r.unknown.map(x => `<li>Niet herkend en overgeslagen: “${esc(x)}”</li>`).join('')}</ul></div>` : ''}`;
      $('#imGo', d).disabled = !items && !fills.length;
    };
    $('#imText', d).oninput = preview;
    $('#imFill', d).onchange = preview;
    $('#imCancel', d).onclick = () => dlg.close();
    $('#imGo', d).onclick = () => {
      const r = parseSalesNotes(text, pg.month), fill = $('#imFill', d).checked;
      if ($('#imReplace', d)?.checked) {
        for (const x of salesRows(pg.id)) tombstone(x.id);
        data.sales = data.sales.filter(x => x.pageId !== pg.id);
      }
      const cols = ensureImportCols();
      let order = now(), n = 0;
      for (const w of r.weeks) for (const x of w.days) {
        const lines = [...x.items];
        if (fill && Math.abs(x.diff) >= 1) lines.push({qty:null, format:'Niet gespecificeerd', amount:x.diff, note:`aangevuld tot genoteerd dagtotaal ${eur(x.noted)}`});
        for (const it of lines) {
          const values = {[cols.date.id]:x.date, [cols.money.id]:round2(it.amount)};
          if (it.qty != null) values[cols.qty.id] = it.qty;
          if (it.format) {
            const {opts, rest} = parseFormats(it.format);
            if (opts.length) values[cols.format.id] = opts.join(', ');
            if (rest) it.note = [rest, it.note].filter(Boolean).join(' · ');
          }
          if (it.note) values[cols.note.id] = it.note;
          data.sales.push(touch({id:uid(), pageId:pg.id, order:order++, values})); n++;
        }
      }
      if (r.target != null) pg.target = r.target;
      if (r.workdays) pg.workdays = r.workdays;
      pg.flat = false; touch(pg);
      dlg.close(); commit();
      toast(`${n} regels geïmporteerd`);
    };
    setTimeout(() => $('#imText', d).focus(), 30);
  });
}
// Zorgt dat de kolommen Datum, Aantal, Formaat, Bedrag en Opmerking bestaan (bestaande kolommen worden hergebruikt).
function ensureImportCols() {
  const cols = salesCols();
  const find = (type, re) => cols.find(c => c.type === type && (!re || re.test(c.name)));
  const add = (name, type, order) => { const c = touch({id:uid(), name, type, order}); data.salesCols.push(c); cols.push(c); return c; };
  const date = find('date') || add('Datum', 'date', -1);
  const base = date.order || 0;
  const qty = find('number', /aantal|stuks|#/i) || add('Aantal', 'number', base + 0.1);
  let format = find('format') || find('text', /formaat|format|product|type/i);
  if (format && format.type === 'text') { format.type = 'format'; format.fmtMig = true; touch(format); convertFormatCol(data, format); }
  if (!format) format = add('Formaat', 'format', base + 0.2);
  const money = find('money') || add('Bedrag', 'money', base + 0.3);
  const note = find('text', /opmerking|omschrijving|notitie/i) || add('Opmerking', 'text', 99);
  return {date, qty, format, money, note};
}

function openSalesColsDialog() {
  const draft = salesCols().map(c => ({...c}));
  const read = d => $$('.st-row', d).forEach((row, i) => { draft[i].name = $('input', row).value; draft[i].type = $('select', row).value; });
  const draw = () => showDialog(`
    <h3>Kolommen voor verkopen</h3>
    <p class="muted small" style="margin:0">Deze kolommen gelden voor al je maandpagina’s. Kolommen van het type <b>Bedrag</b> en <b>Getal</b> worden opgeteld.</p>
    <div style="margin-top:12px">${draft.map((c, i) => `
      <div class="st-row">
        <input type="text" value="${esc(c.name)}" placeholder="Naam van de kolom" aria-label="Naam kolom ${i + 1}">
        <select aria-label="Type">${Object.entries(SALES_TYPES).map(([k, l]) => `<option value="${k}" ${k === c.type ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button type="button" class="icon-btn" data-sm="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Naar links">${I.up}</button>
        <button type="button" class="icon-btn" data-sm="${i}" data-dir="1" ${i === draft.length - 1 ? 'disabled' : ''} aria-label="Naar rechts">${I.down}</button>
        <button type="button" class="icon-btn" data-sr="${i}" aria-label="Kolom verwijderen">${I.trash}</button>
      </div>`).join('')}</div>
    <button type="button" class="link" id="scAdd" style="margin-top:10px;font-weight:550">+ Kolom toevoegen</button>
    <p class="err" id="scErr"></p>
    <div class="dlg-actions"><span class="grow"></span><button type="button" class="btn" id="scCancel">Annuleren</button><button type="button" class="btn primary" id="scSave">Opslaan</button></div>`, d => {
    $$('[data-sm]', d).forEach(b => b.onclick = () => { read(d); const i = +b.dataset.sm, j = i + +b.dataset.dir; [draft[i], draft[j]] = [draft[j], draft[i]]; draw(); });
    $$('[data-sr]', d).forEach(b => b.onclick = () => { read(d); draft.splice(+b.dataset.sr, 1); draw(); });
    $('#scAdd', d).onclick = () => { read(d); draft.push({id:uid(), name:'', type:'text'}); draw(); setTimeout(() => $$('.st-row input', dlg).at(-1)?.focus(), 30); };
    $('#scCancel', d).onclick = () => dlg.close();
    $('#scSave', d).onclick = async () => {
      read(d);
      draft.forEach(c => c.name = c.name.trim());
      if (!draft.length) { $('#scErr', d).textContent = 'Hou minstens één kolom.'; return; }
      if (draft.some(c => !c.name)) { $('#scErr', d).textContent = 'Geef elke kolom een naam.'; return; }
      const removed = data.salesCols.filter(c => !draft.some(x => x.id === c.id));
      if (removed.length && !await askConfirm('Kolommen verwijderen?', `Kolom(men) ${removed.map(c => '“' + c.name + '”').join(', ')} verwijderen? De waarden erin verdwijnen.`, {ok:'Verwijderen', danger:true})) return;
      draft.forEach((c, i) => {
        const cur = data.salesCols.find(x => x.id === c.id);
        if (!cur) data.salesCols.push(touch({id:c.id, name:c.name, type:c.type, order:i}));
        else if (cur.name !== c.name || cur.type !== c.type || cur.order !== i) {
          const toFmt = cur.type !== 'format' && c.type === 'format';
          Object.assign(cur, {name:c.name, type:c.type, order:i, fmtMig:true}, {u:now()});
          if (toFmt) convertFormatCol(data, cur);
        }
      });
      for (const c of removed) {
        tombstone(c.id);
        for (const r of data.sales) if (c.id in r.values) { delete r.values[c.id]; touch(r); }
      }
      data.salesCols = data.salesCols.filter(c => !removed.includes(c));
      dlg.close(); commit();
    };
  });
  draw();
}

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Ongedaan maken</button>' : ''}`;
  el.hidden = false;
  if (undo) el.querySelector('button').onclick = () => { el.hidden = true; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, undo ? 6000 : 3500);
}

/* ---------------- Events ---------------- */
$('#nav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setView({type:b.dataset.view}); });
$('#toolNav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setView({type:b.dataset.view}); });
for (const id of ['#projNav', '#salesNav']) $(id).addEventListener('click', e => {
  const yb = e.target.closest('[data-year]'); if (yb) { e.stopPropagation(); toggleSalesYear(yb.dataset.year); return; }
  const a = e.target.closest('[data-navarch]'); if (!a) return;
  e.stopPropagation(); navArchOpen[a.dataset.navarch] = !navArchOpen[a.dataset.navarch]; renderNav();
});
$('#projNav').addEventListener('click', e => { if (Date.now() - navDragged < 400) return; const b = e.target.closest('[data-project]'); if (b) setView({type:'project', id:b.dataset.project}); });

$('.brand').style.cursor = 'pointer'; $('.brand').title = 'Vandaag'; $('.brand').addEventListener('click', () => { $('#app').classList.remove('side-open'); setView({type:'today'}); });
$('#addProject').onclick = () => openProjectDialog(null);
$('#editProject').onclick = e => menuAt(e.currentTarget, view.type === 'sales' ? salesPageMenuItems(salesPageById(view.id), true) : projectMenuItems(proj(view.type === 'inbox' ? 'inbox' : view.id)));
$('#salesNav').addEventListener('click', e => { const b = e.target.closest('[data-sales]'); if (b) setView({type:'sales', id:b.dataset.sales}); });
$('#addSales').onclick = () => openSalesPageDialog(null);
// Licht/donker: zonder keuze volgt Deals je toestel; de knop onderaan de zijbalk onthoudt je keuze op dit toestel
function paintThemeColor() {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0A0A0A';
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = c; m.removeAttribute('media'); });
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('taken.theme', t); } catch {}
  paintThemeColor();
}
matchMedia('(prefers-color-scheme:dark)').addEventListener?.('change', () => { if (!document.documentElement.dataset.theme) paintThemeColor(); });
paintThemeColor();
$('#openSettings').onclick = () => { $('#app').classList.remove('side-open'); openSettings(); };
$('#lockNow').onclick = lock;
$('#syncStatus').onclick = () => data.settings.sync ? syncNow() : openSettings();
$('#menuBtn').onclick = $('#topAvatar').onclick = () => $('#app').classList.add('side-open');
// iOS 27 tabbalk
$$('#tabBar [data-tab]').forEach(b => {
  const icon = {all:I.all, today:I.today, sales:I.sales, agenda:I.agenda}[b.dataset.tab];
  if (icon) b.querySelector('.ti').innerHTML = icon;
});
$('#tabBar').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  const t = b.dataset.tab;
  if (t === 'more') { $('#app').classList.add('side-open'); return; }
  if (t === 'sales') {
    const pg = sortedSalesPages()[0];
    if (pg) setView({type:'sales', id:pg.id}); else { $('#app').classList.add('side-open'); openSalesPageDialog(null); }
    return;
  }
  setView({type:t});
});
// Nieuwe deal: meteen een deal aanmaken en het paneel openen met de titel geselecteerd (de aparte invoerbalk is weg)
function newDealNow() { crmOpenNewCustomer(); }

document.addEventListener('click', e => { if (e.target.closest('[data-qa]')) newDealNow(); });
$('#fab').addEventListener('click', () => {
  if (view.type === 'sales') { addSalesRow(); return; }
  if (view.type === 'agenda') { openEventDialog(null, agendaSel || today()); return; }
  if (view.type === 'btw') { $('#btwEx')?.focus(); return; }
  newDealNow();
});
// compacte titel verschijnt zodra de grote titel wegscrolt (gsm)
$('#main').addEventListener('scroll', e => {
  document.body.classList.toggle('mini-title', e.currentTarget.scrollTop > 44);
}, {passive:true});
$('#scrim').onclick = () => $('#app').classList.remove('side-open');
// iOS toont :active (drukfeedback) enkel als er een touchstart-listener is
document.addEventListener('touchstart', () => {}, {passive:true});
// Zijmenu met de vinger: vanaf de linkerrand openvegen, naar links dichtvegen (gsm).
// Volgt de vinger 1:1, start vanaf de huidige positie (onderbreekbaar) en beslist met de worpsnelheid.
(() => {
  const side = $('#side'), app = $('#app');
  const phone = () => matchMedia('(max-width:860px)').matches;
  const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);
  let g = null;
  addEventListener('touchstart', e => {
    g = null;
    if (!phone() || e.touches.length !== 1 || dlg.open || document.body.classList.contains('sheet-open')) return;
    const t = e.touches[0], open = app.classList.contains('side-open');
    if (open ? !(side.contains(e.target) || e.target.id === 'scrim') : t.clientX > 24) return;
    if (e.target === document.activeElement && e.target.closest('input,textarea,select,[contenteditable]')) return;
    g = {x0:t.clientX, y0:t.clientY, open, lock:null, base:0, x:0, v:0, lx:t.clientX, lt:performance.now()};
  }, {passive:true});
  addEventListener('touchmove', e => {
    if (!g) return;
    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (!g.lock) {
      if (Math.hypot(dx, dy) < 8) return;
      g.lock = Math.abs(dx) > Math.abs(dy) * 1.15 && (g.open ? dx < 0 : dx > 0) ? 'x' : 'y';
      if (g.lock !== 'x') { g = null; return; }
      g.w = side.offsetWidth;
      g.base = new DOMMatrix(getComputedStyle(side).transform).m41;   // vanaf waar hij nu staat
      g.x0 = t.clientX; app.classList.add('side-drag');
    }
    e.preventDefault();
    const now = performance.now();
    g.v = (t.clientX - g.lx) / Math.max(1, now - g.lt) * 1000; g.lx = t.clientX; g.lt = now;
    let x = g.base + (t.clientX - g.x0);
    if (x > 0) x = (x * 0.55 * g.w) / (g.w + 0.55 * x);   // elastisch voorbij volledig open
    g.x = Math.max(-g.w, x);
    side.style.transform = `translateX(${g.x}px)`;
    app.style.setProperty('--side-p', String(1 + g.x / g.w));
  }, {passive:false});
  const end = () => {
    if (!g || g.lock !== 'x') { g = null; return; }
    const open = g.x + project(g.v) > -g.w / 2;
    app.classList.remove('side-drag');
    side.style.transform = ''; app.style.removeProperty('--side-p');
    app.classList.toggle('side-open', open);
    g = null;
  };
  addEventListener('touchend', end, {passive:true});
  addEventListener('touchcancel', end, {passive:true});
})();
function hideColumn(id) {
  const st = stageById(id);
  const before = setHiddenCols([...new Set([...(prefs().hidden || []), id])]);
  toast(`“${st.label}” verborgen in deze weergave`, () => setHiddenCols(before));
}
$('#list').addEventListener('click', e => {
  if (justDragged || e.target.closest('[data-act=link]')) return;
  if (e.target.closest('[data-cols]')) { openStagesDialog(); return; }
  const plus = e.target.closest('[data-addtop]'); if (plus) { openTopAdd(plus.dataset.addtop); return; }
  const hideCol = e.target.closest('[data-hidecol]');
  if (hideCol) { hideColumn(hideCol.dataset.hidecol); return; }
  const cm = e.target.closest('[data-colmenu]');
  if (cm) {
    const id = cm.dataset.colmenu, st = stageById(id), n = +cm.dataset.total || 0;
    menuAt(cm, [{label:'Nieuwe kaart', run:() => openTopAdd(id)},
      '-',
      {label:'Verbergen in deze weergave', attrs:`data-hidecol="${id}"`, run:() => hideColumn(id)},
      {label:'Stappen beheren…', attrs:'data-cols', run:() => openStagesDialog()}]);
    return;
  }
  const showCol = e.target.closest('[data-showcol]');
  if (showCol) { setHiddenCols((prefs().hidden || []).filter(x => x !== showCol.dataset.showcol)); return; }
  const jump = e.target.closest('[data-jump]');
  if (jump) { $(`.col[data-stage="${jump.dataset.jump}"]`)?.scrollIntoView({behavior:'smooth', inline:'start', block:'nearest'}); return; }
  const more = e.target.closest('[data-more]');
  if (more) { boardExpanded[more.dataset.more] = true; renderMain(); return; }
  const row = e.target.closest('.task,.card'); if (!row) return;
  if (e.target.closest('[data-act=toggle]')) toggleTask(row.dataset.id);
  else openTask(row.dataset.id);
});
$('#list').addEventListener('submit', e => {
  const form = e.target.closest('.col-add'); if (!form) return;
  e.preventDefault();
  const stage = form.dataset.stage, input = $('input', form);
  const r = parseQuick(input.value);
  if (!r.title) return;
  createTask(r, stage);
  $(`.col-add[data-stage="${stage}"] input`)?.focus();
});
// Plusje in de kolomkop: naar het invoerveld bovenaan die kolom
function openTopAdd(stage) {
  const inp = $(`.col-add[data-stage="${stage}"] input`);
  inp?.focus(); inp?.scrollIntoView({block:'nearest', behavior:'smooth'});
}

/* ---------------- Kanban: slepen (muis + aanraken) ---------------- */
let drag = null, justDragged = false;
$('#list').addEventListener('pointerdown', e => {
  const card = e.target.closest('.card');
  if (!card || e.button > 0 || e.target.closest('a,button,input')) return;
  drag = {card, id:card.dataset.id, x0:e.clientX, y0:e.clientY, x:e.clientX, y:e.clientY, touch:e.pointerType !== 'mouse', active:false};
  // op een touchscreen start slepen na even ingedrukt houden, zodat gewoon scrollen blijft werken
  if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.active) startDrag(); }, 280);
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.active) {
    const d = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
    if (drag.touch) { if (d > 10) cancelDrag(); return; }
    if (d < 6) return;
    startDrag();
  }
  e.preventDefault();
  moveDrag();
});
document.addEventListener('touchmove', e => { if (drag?.active) e.preventDefault(); }, {passive:false});
document.addEventListener('pointerup', () => { if (drag?.active) endDrag(true); else cancelDrag(); });
document.addEventListener('pointercancel', () => { if (drag?.active) endDrag(false); else cancelDrag(); });
$('#list').addEventListener('contextmenu', e => { if (drag?.touch && e.target.closest('.card')) e.preventDefault(); });
function cancelDrag() { if (drag) clearTimeout(drag.timer); drag = null; }
function startDrag() {
  clearTimeout(drag.timer);
  drag.active = true;
  const r = drag.card.getBoundingClientRect();
  drag.dx = drag.x - r.left; drag.dy = drag.y - r.top;
  const g = drag.card.cloneNode(true);
  g.classList.add('ghost'); g.classList.remove('sel'); g.style.width = r.width + 'px';
  document.body.appendChild(g); drag.ghost = g;
  drag.ph = document.createElement('div'); drag.ph.className = 'card-ph'; drag.ph.style.height = r.height + 'px';
  drag.card.after(drag.ph); drag.card.classList.add('dragging');
  document.body.classList.add('is-dragging');
  navigator.vibrate?.(12);
  drag.raf = requestAnimationFrame(autoScroll);
  moveDrag();
}
function moveDrag() {
  const {x, y} = drag;
  drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px) rotate(2deg) scale(1.03)`;
  const col = document.elementFromPoint(x, y)?.closest('.col');
  if (!col) return;
  const cards = $('.cards', col);
  const before = [...cards.querySelectorAll('.card:not(.dragging)')].find(c => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
  if (before) { if (drag.ph.nextElementSibling !== before) cards.insertBefore(drag.ph, before); }
  else if (drag.ph.parentElement !== cards || drag.ph.nextElementSibling?.classList.contains('card')) cards.appendChild(drag.ph);
  $$('.col.over').forEach(c => c !== col && c.classList.remove('over'));
  col.classList.add('over');
}
function autoScroll() {
  if (!drag?.active) return;
  const board = $('.board'), main = $('#main'), edge = 50, sp = 12;
  if (board) {
    const r = board.getBoundingClientRect();
    if (drag.x < r.left + edge) board.scrollLeft -= sp; else if (drag.x > r.right - edge) board.scrollLeft += sp;
  }
  if (drag.y < edge + 30) main.scrollTop -= sp; else if (drag.y > innerHeight - edge) main.scrollTop += sp;
  moveDrag();
  drag.raf = requestAnimationFrame(autoScroll);
}
function endDrag(drop) {
  cancelAnimationFrame(drag.raf);
  const {id, ph, ghost} = drag;
  const from = ghost.getBoundingClientRect();
  ghost.remove();
  $$('.col.over').forEach(c => c.classList.remove('over'));
  document.body.classList.remove('is-dragging');
  const stage = ph.parentElement?.dataset.stage;
  const neighbour = dir => { let n = ph[dir]; while (n && !n.matches('.card:not(.dragging)')) n = n[dir]; return n && taskById(n.dataset.id); };
  const prev = neighbour('previousElementSibling'), next = neighbour('nextElementSibling');
  drag = null; justDragged = true; setTimeout(() => justDragged = false, 60);
  const t = taskById(id);
  if (!drop || !t || !stage) { renderMain(); settleCard(id, from); return; }
  const undo = undoFor(t);
  let res, changed = false;
  if (stage !== t.stage) { res = setStage(t, stage); changed = true; }
  if (prefs().sort === 'manual' && !isDoneStage(stage)) {
    const order = prev && next ? (prev.order + next.order) / 2 : prev ? prev.order + 1 : next ? next.order - 1 : t.order;
    if (order !== t.order) { t.order = order; touch(t); changed = true; }
  }
  if (!changed) { renderMain(); settleCard(id, from); return; }
  commit();
  settleCard(id, from);
  stageToast(t, res, undo);
}
$('#toolbar').addEventListener('input', e => { if (e.target.id === 'tbSearch') { searchQ = e.target.value; renderMain(); } });
document.addEventListener('keydown', e => {
  if (!data || dlg.open) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') {
    if (typing) document.activeElement.blur();
    else if ($('#app').classList.contains('side-open')) $('#app').classList.remove('side-open');
    else if (selectedId) closeDetail();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && !e.shiftKey) {
    const views = {'1':'all'};
    if (views[e.key]) { e.preventDefault(); setView({type:views[e.key]}); return; }
    if (e.key === '5') { e.preventDefault(); const pg = sortedSalesPages()[0]; if (pg) setView({type:'sales', id:pg.id}); return; }
    if (e.key === ',') { e.preventDefault(); openSettings(); return; }
    if (e.key.toLowerCase() === 'f' && $('#tbSearch') && view.type !== 'sales') { e.preventDefault(); openSearch(); return; }
    if (e.key.toLowerCase() === 'k') { e.preventDefault(); if (view.type === 'sales') addSalesRow(); else newDealNow(); return; }
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '?') { e.preventDefault(); openHelp(); return; }
  if (e.key === 'Delete' && selectedId && view.type !== 'sales') { e.preventDefault(); deleteTask(selectedId); return; }
  if (isPageView()) return;
  if (view.type === 'sales') { if (e.key === 'n') { e.preventDefault(); addSalesRow(); } return; }
  if (e.key === 'q' || e.key === 'n') { e.preventDefault(); newDealNow(); }
  else if (e.key === '/') { e.preventDefault(); openSearch(); }
});

$('#topSearch').onclick = () => { if (isPageView() || view.type === 'sales') setView({type:'all'}); openSearch(); };
$('#topHelp').onclick = () => openHelp();
function openHelp() {
  showDialog(`<h3>Hulp</h3>
    <ul class="help-list">
      <li><b>Wat doe ik vandaag?</b><span>Open Vandaag. Klik op de klant die je wilt opvolgen.</span></li>
      <li><b>Een klant toevoegen</b><span>Klik op Klant toevoegen, vul de naam in en bevestig. De rest kun je later aanvullen.</span></li>
      <li><b>Een klant zoeken</b><span>Open Klanten en typ de naam, het telefoonnummer of een notitie in het zoekveld.</span></li>
      <li><b>Een gesprek bewaren</b><span>Open een klant en klik op Notitie toevoegen. Schrijf wat er besproken is en klik op Notitie bewaren.</span></li>
      <li><b>Opvolging plannen</b><span>Kies bij de klant een datum voor de volgende stap. Terugbellen en offerte opvolgen gebruiken diezelfde deadline.</span></li>
      <li><b>Een verkoop bewaren</b><span>Open Verkopen en klik op Verkoop toevoegen. Bij een gewonnen klant verschijnt de verkoop automatisch.</span></li>
    </ul>
    <div class="dlg-actions"><button type="button" class="btn" id="hpTour">Rondleiding bekijken</button><button type="button" class="btn" id="hpKeys">Sneltoetsen</button><span class="grow"></span><button type="button" class="btn primary" id="hpClose">Sluiten</button></div>`, d => {
    $('#hpClose', d).onclick = () => dlg.close();
    $('#hpTour', d).onclick = () => { dlg.close(); setTimeout(startTour, 250); };
    $('#hpKeys', d).onclick = () => openShortcutsDialog();
  });
}
// Esc in het zoekveld: wissen en sluiten
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.target.id !== 'tbSearch') return;
  e.preventDefault(); searchQ = ''; tbOpen = false; e.target.blur(); renderToolbar(); renderMain();
});
// het zoekveld sluit zodra je ernaast klikt (en niets zoekt)
document.addEventListener('pointerdown', e => {
  if (!tbOpen || e.target.closest('.toolbar,#topSearch')) return;
  tbOpen = false; if (!$('#toolbar').hidden) renderToolbar();
}, true);
function openSearch() { if (!tbOpen) { tbOpen = true; renderToolbar(); } $('#tbSearch')?.focus(); $('#tbSearch')?.select(); }

function openShortcutsDialog() {
  const k = navigator.platform?.startsWith('Mac') ? '⌘' : 'Ctrl';
  const rows = [['N of Q', 'Klant toevoegen'], [k + ' K', 'Klant toevoegen (ook in een veld)'], ['/', 'Zoeken'], [k + ' F', 'Zoeken'],
    [k + ' 1', 'Klanten'], [k + ' 5', 'Verkopen (laatste maand)'], [k + ' ,', 'Instellingen'],
    ['Delete', 'Open kaart verwijderen'], ['Esc', 'Sluiten'], ['Rechtsklik', 'Snelmenu op kaarten, projecten en pagina’s'], ['?', 'Deze lijst']];
  showDialog(`<h3>Sneltoetsen</h3><div class="kbd-list">${rows.map(([a, b]) => `<div><span>${esc(b)}</span><span>${a.split(' ').map(x => x === '…' || x === 'of' ? `<i>${x}</i>` : `<kbd>${esc(x)}</kbd>`).join('')}</span></div>`).join('')}</div>
    <div class="dlg-actions"><span class="grow"></span><button type="button" class="btn primary" id="kbOk">Sluiten</button></div>`, d => { $('#kbOk', d).onclick = () => dlg.close(); });
}
/* ---- Snelmenu met rechtsklik (desktop) ---- */
const ctx = $('#ctxMenu');
function closeCtx() { ctx.hidden = true; ctx.innerHTML = ''; ctx.onclick = null; menuAnchor = null; }
// ⋯-knop: menu onder de knop (nog eens klikken sluit het)
let menuAnchor = null;
function menuAt(el, items) {
  if (!ctx.hidden && menuAnchor === el) { closeCtx(); return; }
  const r = el.getBoundingClientRect();
  openCtx(r.right - 220, r.bottom + 4, items);
  menuAnchor = el;
}
function openCtx(x, y, items) {
  items = items.filter(Boolean).filter((it, i, a) => it !== '-' || (i > 0 && i < a.length - 1 && a[i - 1] !== '-'));
  ctx.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''} ${it.attrs || ''}>${it.dot ? `<span class="dot" style="background:${it.dot}"></span>` : '<span class="ci"></span>'}<span>${esc(it.label)}</span>${it.on ? I.check : ''}</button>`).join('');
  ctx.hidden = false;
  const w = ctx.offsetWidth, h = ctx.offsetHeight;
  ctx.style.left = Math.min(x, innerWidth - w - 6) + 'px';
  ctx.style.top = (y + h > innerHeight - 6 ? Math.max(6, y - h) : y) + 'px';
  ctx.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b) return; const it = items[+b.dataset.i]; closeCtx(); it.run(); };
  ctx.querySelector('button:not([disabled])')?.focus({preventScroll:true});
}
addEventListener('pointerdown', e => { if (!ctx.hidden && !ctx.contains(e.target) && !(menuAnchor && menuAnchor.contains(e.target))) closeCtx(); }, true);
addEventListener('keydown', e => {
  if (ctx.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCtx(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const bs = [...ctx.querySelectorAll('button:not([disabled])')], i = bs.indexOf(document.activeElement);
    bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
  }
}, true);
addEventListener('blur', closeCtx);
addEventListener('resize', closeCtx);
$('#main').addEventListener('scroll', closeCtx, {passive:true});
function taskMenuItems(t) {
  return [{label:'Verwijderen', danger:true, attrs:'data-act="delete"', run:() => deleteTask(t.id)}];
}
/* ---- Prijsberekening bovenaan een project: (streef − huidig verkoopcijfer) ÷ beschikbare 1/8-ruimtes → prijs per formaat ---- */
const CALC_FORMATS = [['1/1', 8], ['1/2', 4], ['1/4', 2], ['1/8', 1], ['1/12', 2 / 3], ['1/16', .5], ['1/32', .25]];
// 1.514 = duizendtal, 4,5 en 4.5 = decimaal
function parseNl(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v ?? '').replace(/[€\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t); return isFinite(n) ? n : null;
}
// nog te verkopen = streef − huidig verkoopcijfer (oude berekeningen met enkel "To go" blijven werken)
function calcTogo(c) {
  if (c?.target === undefined) return parseNl(c?.togo);
  const t = parseNl(c.target); if (t == null) return null;
  return Math.max(0, t - (parseNl(c.current) || 0));
}
function calcPrices(c) {
  const togo = calcTogo(c), pk = parseNl(c?.pk);
  return CALC_FORMATS.map(([label, f]) => [label, togo != null && pk > 0 ? Math.ceil(Math.round(togo / pk * f * 1e6) / 1e6) : null]);
}
function calcNegotiation(c) {
  const rawMin = c?.minPrice, rawDiscount = c?.discount;
  const floor = rawMin === '' || rawMin == null ? 0 : parseNl(rawMin), discount = rawDiscount === '' || rawDiscount == null ? 0 : parseNl(rawDiscount);
  const configured = (rawMin !== '' && rawMin != null) || (rawDiscount !== '' && rawDiscount != null);
  if (floor == null || floor < 0 || discount == null || discount < 0 || discount > 100) return {configured, error:'Gebruik een minimumprijs vanaf € 0 en een korting tussen 0 en 100 %.', rows:[]};
  const prices = calcPrices(c);
  const rows = CALC_FORMATS.map(([format,factor],i) => {
    const base = prices[i][1], minimum = Math.ceil(Math.round(floor * factor * 1e6) / 1e6);
    const requested = base == null ? null : Math.ceil(Math.round(base * (1-discount/100) * 1e6) / 1e6);
    const offer = requested == null ? null : Math.max(minimum, requested);
    return {format,base,minimum,requested,offer,room:offer==null?null:offer-minimum,limited:requested!=null && requested<minimum};
  });
  return {configured, floor, discount, rows, error:null};
}
function calcNegotiationHtml(c, printing = false) {
  const n = calcNegotiation(c);
  if (printing && !n.configured) return '';
  if (n.error) return `<p class="err pc-neg-error" role="status">${esc(n.error)}</p>`;
  const price = v => v == null ? '—' : '€ ' + calcNum(v);
  return `<div class="pc-neg-summary"><span>Minimum per 1/8: <b>${price(n.floor)}</b></span><span>Korting: <b>${calcNum(n.discount)} %</b></span></div>
    ${n.rows.some(r => r.limited) ? '<p class="pc-neg-warning" role="status">Het voorstel is bij de gemarkeerde formaten verhoogd tot de minimumprijs.</p>' : ''}
    <div class="pc-neg-scroll"><table class="pc-neg-table"><thead><tr><th>Formaat</th><th>Richtprijs</th><th>Voorstel</th><th>Minimum</th><th>Ruimte tot minimum</th></tr></thead><tbody>${n.rows.map(r => `<tr class="${r.limited ? 'limited' : ''}"><th>${r.format}</th><td>${price(r.base)}</td><td><b>${price(r.offer)}</b>${r.limited?'<small>Minimum toegepast</small>':''}</td><td>${price(r.minimum)}</td><td>${price(r.room)}</td></tr>`).join('')}</tbody></table></div>`;
}
const calcNum = n => n == null ? '—' : n.toLocaleString('nl-BE');
function calcText(c) {
  const togo = calcTogo(c);
  return [`Streef - ${c.target ?? c.togo ?? ''}`, `Huidig verkoopcijfer - ${c.current || ''}`, `Nog te verkopen - ${togo == null ? '' : calcNum(togo)}`, `Beschikbaar 1/8 - ${c.pk || ''}`, '', ...calcPrices(c).map(([l, n]) => `${l} - ${n == null ? '' : n}`)].join('\n');
}
function calcTogoHtml(c) { const t = calcTogo(c); return t == null ? 'Vul het streefcijfer in' : t === 0 ? 'Streefcijfer bereikt: <b>€ 0</b> nog te verkopen' : `Nog te verkopen: <b>€ ${calcNum(t)}</b>`; }
function calcOut(c) {
  return calcPrices(c).map(([l, n]) => `<li class="${l === '1/8' ? 'base' : ''}"><span>${l}</span><b>${n == null ? '—' : '€ ' + calcNum(n)}</b></li>`).join('');
}
function calcPrintHtml(p) {
  const c = p.calc, field = (label, value) => `<div class="pc-print-field"><span>${label}</span><b>${esc(calcNum(value))}</b></div>`;
  return `<header class="pc-print-head"><span class="pc-print-brand">Klose</span><span>Prijsberekening · ${esc(new Date().toLocaleDateString('nl-BE'))}</span></header>
    <h1>${esc(p.name)}</h1>
    <section class="pcalc">
      <div class="pc-row"><span class="pc-title">Prijsberekening</span>
        <div class="pc-fields">${field('Streef (€)', parseNl(c.target ?? c.togo))}${field('Huidig (€)', parseNl(c.current) || 0)}${field('Beschikbaar 1/8', parseNl(c.pk))}</div>
        <p class="pc-togo">${calcTogoHtml(c)}</p>
      </div>
      <ul class="pc-out" aria-label="Prijs per formaat">${calcOut(c)}</ul>
    </section>
    <p class="pc-print-note">Prijzen per formaat · afgerond naar boven op hele euro’s</p>`;
}
let calcPrintCleanup = null;
async function printCalc(p) {
  calcPrintCleanup?.();
  const sheet = document.createElement('section'), oldTitle = document.title;
  sheet.id = 'calcPrint'; sheet.innerHTML = calcPrintHtml(p);
  document.body.append(sheet); document.body.classList.add('printing-calc');
  document.title = 'Prijsberekening - ' + p.name;
  const cleanup = () => {
    sheet.remove(); document.body.classList.remove('printing-calc'); document.title = oldTitle;
    window.removeEventListener('afterprint', cleanup); calcPrintCleanup = null;
  };
  calcPrintCleanup = cleanup;
  window.addEventListener('afterprint', cleanup, {once:true});
  try {
    if (document.fonts) await document.fonts.ready;
    window.print();
  } catch { cleanup(); toast('Afdrukken is niet beschikbaar op dit toestel.'); }
}
function renderCalc() {
  const el = $('#projCalc'), p = view.type === 'project' ? data.projects.find(x => x.id === view.id) : null;
  // projecten met "To go" en "PK" in de notities krijgen de berekening één keer automatisch, met die waarden ingevuld
  if (!p || p.id === 'inbox') { el.hidden = true; el.innerHTML = ''; return; }
  if (!p.calc) {   // de prijsberekening staat altijd bij een project; oude notities met To go/PK vullen hem één keer in
    const m = String(p.notes || '');
    p.calc = {target:(m.match(/(?:to\s*go|streef)\s*[-:=]?\s*([\d.,]+)/i) || [])[1] || '', current:'', pk:(m.match(/\bPK\s*[-:=]?\s*([\d.,]+)/i) || [])[1] || ''};
    touch(p); save(true);
  }
  el.hidden = false;
  // oude berekening (To go): omzetten naar streef + huidig verkoopcijfer
  if (p.calc.target === undefined) { p.calc = {...p.calc,target:p.calc.togo || '', current:p.calc.current || '', pk:p.calc.pk || ''}; touch(p); save(true); }
  if (el.dataset.pid === p.id && el.contains(document.activeElement)) { $('.pc-out', el).innerHTML = calcOut(p.calc); $('.pc-togo', el).innerHTML = calcTogoHtml(p.calc); return; }
  el.dataset.pid = p.id;
  el.innerHTML = `<details class="crm-price-details" data-crm-disclosure="calc:${esc(p.id)}" ${crmMoreOpen['calc:'+p.id]?'open':''}><summary>Prijsberekening <span data-crm-price-preview>${calcPrices(p.calc)[3][1]===null?'Open om prijzen te berekenen':'1/8 · € '+calcNum(calcPrices(p.calc)[3][1])}</span></summary><div class="pc-row">
      <span class="pc-title">Prijsberekening</span>
      <div class="pc-fields">
        <label class="fl">Streef (€)<input id="pcTarget" type="text" inputmode="decimal" value="${esc(p.calc.target || '')}" placeholder="13.000" autocomplete="off"></label>
        <label class="fl">Huidig (€)<input id="pcCur" type="text" inputmode="decimal" value="${esc(p.calc.current || '')}" placeholder="6.204" autocomplete="off"></label>
        <label class="fl">Beschikbaar 1/8<input id="pcPk" type="text" inputmode="decimal" value="${esc(p.calc.pk || '')}" placeholder="4,5" autocomplete="off"></label>
      </div>
      <p class="pc-togo">${calcTogoHtml(p.calc)}</p>
      <button type="button" class="btn" id="pcCopy" title="Kopieer als lijst">Kopieer</button>
      <button type="button" class="btn" id="pcPrint" title="Afdrukken of bewaren als PDF">Afdrukken</button>
    </div>
    <ul class="pc-out" aria-label="Prijs per formaat">${calcOut(p.calc)}</ul></details>`;
}
$('#projCalc').addEventListener('input', e => {
  const p = data.projects.find(x => x.id === view.id); if (!p?.calc) return;
  if (e.target.id === 'pcTarget') p.calc.target = e.target.value; else if (e.target.id === 'pcCur') p.calc.current = e.target.value; else if (e.target.id === 'pcPk') p.calc.pk = e.target.value; else return;
  touch(p); save(true); $('#projCalc .pc-out').innerHTML = calcOut(p.calc); $('#projCalc .pc-togo').innerHTML = calcTogoHtml(p.calc);
  const preview=$('[data-crm-price-preview]');if(preview)preview.textContent=calcPrices(p.calc)[3][1]===null?'Open om prijzen te berekenen':'1/8 · € '+calcNum(calcPrices(p.calc)[3][1]);
});
$('#projCalc').addEventListener('click', e => {
  const p = data.projects.find(x => x.id === view.id); if (!p?.calc) return;
  if (e.target.closest('#pcCopy')) copyText(calcText(p.calc), 'Prijzen');
  else if (e.target.closest('#pcPrint')) printCalc(p);
});
/* ---- Projecten in de zijbalk handmatig rangschikken: slepen (muis: gewoon slepen, aanraken: even ingedrukt houden), Alt+↑/↓ of via het menu ---- */
const navActiveIds = () => sortedProjects().filter(p => p.id !== 'inbox' && !p.finished).map(p => p.id);
function moveProject(id, to) {
  const ids = navActiveIds(), from = ids.indexOf(id); if (from < 0) return false;
  to = Math.max(0, Math.min(ids.length - 1, to)); if (to === from) return false;
  ids.splice(from, 1); ids.splice(to, 0, id);
  ids.forEach((pid, i) => { const p = data.projects.find(x => x.id === pid); if (p && p.order !== (i + 1) * 10) { p.order = (i + 1) * 10; touch(p); } });
  save(); renderNav(); return true;
}
let navDrag = null, navDragged = 0;
const navItems = () => $$('#projNav .nav-item[data-project]:not(.is-arch):not(.is-fin)');
function navDragEnd() {
  const d = navDrag; navDrag = null; if (!d) return;
  clearTimeout(d.timer); document.body.classList.remove('nav-sorting');
  navItems().forEach(i => i.classList.remove('nav-dragging', 'drop-before', 'drop-after'));
}
function navDragStart() {
  const d = navDrag; if (!d) return;
  d.active = true; d.it.classList.add('nav-dragging'); document.body.classList.add('nav-sorting');
  try { navigator.vibrate?.(8); } catch {}
}
function navDragOver(y) {
  const items = navItems(); let idx = items.length;
  for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { idx = i; break; } }
  items.forEach(i => i.classList.remove('drop-before', 'drop-after'));
  if (idx < items.length) items[idx].classList.add('drop-before'); else items.at(-1)?.classList.add('drop-after');
  navDrag.idx = idx;
}
$('#projNav').addEventListener('pointerdown', e => {
  const it = e.target.closest('.nav-item[data-project]');
  if (!it || it.classList.contains('is-arch') || it.classList.contains('is-fin') || e.button > 0 || navItems().length < 2) return;
  navDrag = {it, id:it.dataset.project, x:e.clientX, y:e.clientY, active:false, touch:e.pointerType !== 'mouse', pid:e.pointerId, idx:null};
  if (navDrag.touch) navDrag.timer = setTimeout(navDragStart, 350);
});
document.addEventListener('pointermove', e => {
  const d = navDrag; if (!d || e.pointerId !== d.pid) return;
  if (!d.active) {
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (d.touch) { if (moved > 8) navDragEnd(); return; }
    if (moved < 5) return;
    navDragStart();
  }
  e.preventDefault(); navDragOver(e.clientY);
});
document.addEventListener('touchmove', e => { if (navDrag?.active) e.preventDefault(); }, {passive:false});
document.addEventListener('pointerup', e => {
  const d = navDrag; if (!d || e.pointerId !== d.pid) return;
  if (d.active && d.idx != null) {
    const from = navActiveIds().indexOf(d.id); navDragged = Date.now();
    const to = d.idx > from ? d.idx - 1 : d.idx;
    navDragEnd(); moveProject(d.id, to);
  } else { if (d.active) navDragged = Date.now(); navDragEnd(); }
});
document.addEventListener('pointercancel', () => navDragEnd());
$('#projNav').addEventListener('keydown', e => {
  const it = e.target.closest?.('.nav-item[data-project]'); if (!it || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const id = it.dataset.project, from = navActiveIds().indexOf(id);
  if (moveProject(id, from + (e.key === 'ArrowUp' ? -1 : 1))) $(`#projNav [data-project="${id}"]`)?.focus();
});
function projectMenuItems(p) {
  const ids = navActiveIds(), pos = ids.indexOf(p.id);
  return [{label:'Bewerken…', attrs:'data-act="editproj"', run:() => openProjectDialog(p)},
    pos > 0 ? {label:'Hoger in de lijst', run:() => moveProject(p.id, pos - 1)} : null,
    pos >= 0 && pos < ids.length - 1 ? {label:'Lager in de lijst', run:() => moveProject(p.id, pos + 1)} : null,
    p.id === 'inbox' ? null : '-',
    p.id === 'inbox' ? null : {label:p.finished ? 'Heropenen' : 'Afwerken', attrs:'data-act="finish"', run:() => finishProject(p, !p.finished)},
    p.id === 'inbox' ? null : '-',
    p.id === 'inbox' ? null : {label:'Verwijderen…', danger:true, run:() => deleteProject(p)}];
}
function salesPageMenuItems(pg, withTools) {
  return [...(withTools ? [{label:'Notities plakken…', attrs:'id="spImport"', run:() => openSalesImportDialog()}, {label:'Kolommen…', attrs:'id="spCols"', run:() => openSalesColsDialog()}, {label:'Exporteren als CSV', attrs:'id="spCsv"', run:() => exportSalesCsv()}, '-'] : []),
    {label:'Bewerken…', attrs:'data-act="editproj"', run:() => openSalesPageDialog(pg)},
    '-',
    {label:'Verwijderen…', danger:true, run:() => deleteSalesPage(pg)}];
}
document.addEventListener('contextmenu', e => {
  if (!data || $('#app').hidden || matchMedia('(pointer:coarse)').matches) return;
  // tekstvelden en geselecteerde tekst houden het gewone menu (kopiëren/plakken)
  if (e.target.closest('input,textarea,select,[contenteditable]') || String(getSelection()).trim()) return;
  const card = e.target.closest('.card[data-id], .task[data-id], [data-id].row');
  const t = card && taskById(card.dataset.id);
  const pEl = e.target.closest('#projNav [data-project]'), sEl = e.target.closest('#salesNav [data-sales]');
  let items = null;
  if (t) {
    items = [{label:'Openen', run:() => openTask(t.id)}, '-',
      ...stages().map(st => ({label:st.label, dot:st.color, on:t.stage === st.id, run:() => { const undo = undoFor(t); setStage(t, st.id); commit(); stageToast(t, null, undo); }})), '-',
      {label:'Verwijderen', danger:true, run:() => deleteTask(t.id)}];
  } else if (pEl) {
    const p = data.projects.find(x => x.id === pEl.dataset.project); if (!p) return;
    items = [{label:'Openen', run:() => setView({type:'project', id:p.id})}, ...projectMenuItems(p)];
  } else if (sEl) {
    const pg = salesPageById(sEl.dataset.sales); if (!pg) return;
    items = [{label:'Openen', run:() => setView({type:'sales', id:pg.id})}, ...salesPageMenuItems(pg, false)];
  }
  e.preventDefault();          // geen browsermenu (Terug, Herladen, …) in de app
  if (items) openCtx(e.clientX, e.clientY, items); else closeCtx();
});

/* ================= Klanten, statistieken, jaaroverzicht ================= */
const PAGE_VIEWS = ['agenda', 'btw', 'today', 'dashboard'];
const isPageView = () => PAGE_VIEWS.includes(view.type);
async function copyText(txt, label) {
  try { await navigator.clipboard.writeText(txt); toast(`${label} gekopieerd`); }
  catch { toast('Kopiëren lukt niet in deze browser'); }
}

// Alle verkoopregels, plat: datum, bedrag, formaten, klant.
const dayLabel = s => { const d = parseYmd(s); return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`; };
function renderPage(force) {
  const el = $('#pageView');
  const a = document.activeElement;
  if (!force && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  el.innerHTML = view.type === 'today' ? crmTodayHtml() : view.type === 'dashboard' ? crmDashboardHtml() : view.type === 'btw' ? btwHtml() : agendaHtml();
  if (view.type === 'btw') btwOut();
}

/* ---- Grafiekjes (één reeks, één kleur; waarde via hover/tik en in de tabel) ---- */

/* ================= Agenda: drukdata en deadlines ================= */
const EV_TYPES = [['druk', 'Drukdatum'], ['deadline', 'Deadline'], ['verschijning', 'Verschijning'], ['anders', 'Anders']];
const evTypeLabel = k => (EV_TYPES.find(x => x[0] === k) || EV_TYPES[0])[1];
const evSorted = () => [...data.events].sort((a, b) => a.date.localeCompare(b.date) || (a.order || 0) - (b.order || 0));
const eventsSoon = () => { const td = today(), wk = addDays(td, 6); return data.events.filter(e => e.date >= td && e.date <= wk).length; };
// kort: wat je in de kalender en lijst ziet (de kleur toont de soort al)
const evShort = e => e.title || e.edition || (e.projectId && data.projects.find(p => p.id === e.projectId)?.name) || evTypeLabel(e.type);
const evTitle = e => e.title || [evTypeLabel(e.type), e.edition || (e.projectId && data.projects.find(p => p.id === e.projectId)?.name) || ''].filter(Boolean).join(' ');
// werkdagen tot een datum (za/zo en Belgische feestdagen tellen niet mee)
function workdaysUntil(d) {
  const td = today(); if (d <= td) return 0;
  let n = 0; const hol = new Map();
  for (let x = addDays(td, 1); x <= d; x = addDays(x, 1)) {
    const y = +x.slice(0, 4); if (!hol.has(y)) hol.set(y, beHolidays(y));
    const wd = parseYmd(x).getDay(); if (wd && wd < 6 && !hol.get(y).has(x)) n++;
  }
  return n;
}
function countdown(d) {
  const td = today();
  if (d === td) return 'vandaag';
  if (d < td) { const n = Math.round((parseYmd(td) - parseYmd(d)) / 86400000); return n === 1 ? 'gisteren' : `${n} dagen geleden`; }
  if (d === addDays(td, 1)) return 'morgen';
  const w = workdaysUntil(d);
  return `over ${w} ${w === 1 ? 'werkdag' : 'werkdagen'}`;
}
let agendaMonth = today().slice(0, 7), agendaSel = '';
function agendaHtml() {
  const [y, mo] = agendaMonth.split('-').map(Number), td = today();
  const first = new Date(y, mo - 1, 1), start = new Date(first); start.setDate(1 - (first.getDay() + 6) % 7);
  const weeks = Math.ceil(((first.getDay() + 6) % 7 + new Date(y, mo, 0).getDate()) / 7);
  const byDay = new Map(); for (const e of evSorted()) { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); }
  const hol = beHolidays(y);
  const chip = e => { const pr = e.projectId && data.projects.find(p => p.id === e.projectId);
    return `<button type="button" class="ev ev-${esc(e.type || 'druk')}" data-ev="${e.id}" title="${esc(evTypeLabel(e.type))}: ${esc(evTitle(e))}${e.note ? ' — ' + esc(e.note) : ''}">${pr ? `<span class="dot" style="background:${pr.color}"></span>` : ''}<span class="ev-t">${esc(evShort(e))}</span></button>`; };
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); const k = ymd(d), evs = byDay.get(k) || [];
    cells += `<div class="ag-day ${k.slice(0, 7) !== agendaMonth ? 'out ' : ''}${k === td ? 'today ' : ''}${k === agendaSel ? 'sel ' : ''}${d.getDay() % 6 === 0 ? 'we ' : ''}${hol.has(k) ? 'hol' : ''}" data-day="${k}" tabindex="0" aria-label="${dayLabel(k)}${evs.length ? ', ' + evs.length + ' items' : ''}">
      <span class="ag-num">${d.getDate()}</span>${hol.has(k) ? '<span class="ag-hol">feestdag</span>' : ''}
      <div class="ag-evs">${evs.slice(0, 3).map(chip).join('')}${evs.length > 3 ? `<span class="ag-more">+${evs.length - 3}</span>` : ''}</div>
      ${evs.length ? `<span class="ag-dots">${evs.slice(0, 4).map(e => `<i class="ev-${esc(e.type || 'druk')}"></i>`).join('')}</span>` : ''}</div>`;
  }
  const soon = evSorted().filter(e => e.date >= td).slice(0, 12);
  const selList = agendaSel ? (byDay.get(agendaSel) || []) : null;
  const row = e => { const pr = e.projectId && data.projects.find(p => p.id === e.projectId);
    return `<li><button type="button" data-ev="${e.id}"><span class="ev-bar ev-${esc(e.type || 'druk')}"></span><span class="nm"><b>${esc(evShort(e))}</b><small>${[evTypeLabel(e.type), e.title ? e.edition : '', pr && evShort(e) !== pr.name ? pr.name : ''].filter(Boolean).map(esc).join(' · ')}</small></span><span class="meta"><b>${dayLabel(e.date)}</b><small class="${e.date === td ? 'now' : ''}">${countdown(e.date)}</small></span></button></li>`; };
  return `
    <div class="pg-bar">
      <div class="ag-nav"><button type="button" class="icon-btn" data-amonth="-1" aria-label="Vorige maand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
        <b class="ag-title">${cap(MONTHS_LONG[mo - 1])} ${y}</b>
        <button type="button" class="icon-btn" data-amonth="1" aria-label="Volgende maand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button></div>
      <button type="button" class="btn" data-amonth="0">Vandaag</button>
      <span class="legend ag-legend">${EV_TYPES.map(([k, l]) => `<span><i class="lg-ev ev-${k}"></i>${l}</span>`).join('')}</span>
      <span class="grow"></span>
      <button type="button" class="btn primary" id="evNew">+ Datum toevoegen</button>
    </div>
    <div class="ag-wrap">
      <div class="ag-cal pg-card">
        <div class="ag-head">${['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(d => `<span>${d}</span>`).join('')}</div>
        <div class="ag-grid" style="--weeks:${weeks}">${cells}</div>
      </div>
      <aside class="ag-side">
        ${selList ? `<section class="pg-card"><h3>${cap(dayLabel(agendaSel))}<span class="grow"></span><button type="button" class="btn" data-newon="${agendaSel}">+ Toevoegen</button></h3>${selList.length ? `<ul class="pg-list ag-list">${selList.map(row).join('')}</ul>` : '<p class="muted small">Niets gepland op deze dag.</p>'}</section>` : ''}
        <section class="pg-card"><h3>Komende data</h3>${soon.length ? `<ul class="pg-list ag-list">${soon.map(row).join('')}</ul>` : '<p class="muted small">Nog niets gepland. Klik op Datum toevoegen of kies een dag in de kalender.</p>'}</section>
      </aside>
    </div>`;
}
function openEventDialog(ev, date) {
  const isNew = !ev;
  const st = {date:ev?.date || date || today(), month:(ev?.date || date || today()).slice(0, 7), type:ev?.type || 'druk'};
  const eds = [];
  const projs = sortedProjects().filter(p => p.id !== 'inbox');
  showDialog(`
    <h3>${isNew ? 'Nieuwe datum in de agenda' : 'Agenda-item bewerken'}</h3>
    <div class="seg ev-types" role="group" aria-label="Soort">${EV_TYPES.map(([k, l]) => `<button type="button" data-etype="${k}" class="${st.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <label class="fl">Titel <span class="muted">(optioneel)</span><input id="evTitle" type="text" value="${esc(ev?.title || '')}" placeholder="bv. Druk Turnhout Deze Week" autofocus></label>
    <div class="ev-row">
      <label class="fl">Uitgave<input id="evEd" type="text" list="evEds" value="${esc(ev?.edition || '')}" placeholder="bv. Kempen Info" autocomplete="off"><datalist id="evEds">${eds.map(e => `<option value="${esc(e)}">`).join('')}</datalist></label>
      <label class="fl">Project<select id="evProj"><option value="">— geen —</option>${projs.map(p => `<option value="${p.id}" ${ev?.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    </div>
    <label class="fl">Datum<input id="crmEventDate" type="date" value="${esc(st.date)}" required></label><p class="err" id="crmEventError" role="alert"></p>
    ${isNew ? `<details class="crm-form-extra"><summary>Deze datum herhalen (optioneel)</summary><div class="ev-row"><label class="fl">Herhalen<select id="evRep"><option value="">Niet</option><option value="7">Elke week</option><option value="14">Om de 2 weken</option><option value="m">Elke maand</option></select></label>
      <label class="fl" id="evCntWrap" hidden>Aantal keer<input id="evCnt" type="number" min="2" max="104" value="12" inputmode="numeric"></label></div></details>` : ''}
    <label class="fl">Notitie <span class="muted">(optioneel)</span><textarea id="evNote" rows="2" placeholder="bv. materiaal binnen tegen 12u">${esc(ev?.note || '')}</textarea></label>
    <div class="dlg-actions">
      ${ev ? '<button type="button" class="btn danger" id="evDel">Verwijderen</button>' : ''}
      <span class="grow"></span>
      <button type="button" class="btn" id="evCancel">Annuleren</button>
      <button type="button" class="btn primary" id="evSave">${isNew ? 'Toevoegen' : 'Opslaan'}</button>
    </div>`, d => {
    d.querySelectorAll('[data-etype]').forEach(b => b.onclick = () => { st.type = b.dataset.etype; d.querySelectorAll('[data-etype]').forEach(x => x.classList.toggle('on', x === b)); });
    $('#evRep', d)?.addEventListener('change', e => { $('#evCntWrap', d).hidden = !e.target.value; });
    $('#evCancel', d).onclick = () => dlg.close();
    $('#evSave', d).onclick = () => {
      const date=$('#crmEventDate',d).value;if(!date || ymd(parseYmd(date))!==date){$('#crmEventError',d).textContent='Kies een geldige datum.';return;}st.date=date;
      const base = {title:$('#evTitle', d).value.trim(), edition:$('#evEd', d).value.trim(), projectId:$('#evProj', d).value || null, note:$('#evNote', d).value.trim(), type:st.type};
      if (ev) { Object.assign(ev, base, {date:st.date}); touch(ev); }
      else {
        const rep = $('#evRep', d)?.value || '', n = rep ? Math.max(2, Math.min(104, parseInt($('#evCnt', d).value, 10) || 2)) : 1;
        const series = rep ? uid() : null;
        for (let i = 0; i < n; i++) {
          let dt = st.date;
          if (rep === 'm') { const [y, m, dd] = st.date.split('-').map(Number); const x = new Date(y, m - 1 + i, 1); x.setDate(Math.min(dd, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); dt = ymd(x); }
          else if (rep) dt = addDays(st.date, i * +rep);
          data.events.push(touch({id:uid(), ...base, date:dt, series, order:now() + i}));
        }
        if (n > 1) toast(`${n} data toegevoegd`);
      }
      agendaMonth = st.date.slice(0, 7);
      dlg.close(); commit();
    };
    $('#evDel', d)?.addEventListener('click', async () => {
      const same = ev.series ? data.events.filter(x => x.series === ev.series && x.date >= ev.date) : [];
      let ids = [ev.id];
      if (same.length > 1) {
        const all = await ask({title:'Reeks verwijderen?', text:`Ook de ${same.length - 1} volgende data uit deze reeks verwijderen?`, buttons:[{label:'Annuleren', value:null, cancel:true}, {label:'Enkel deze', value:false}, {label:'Deze en volgende', value:true, primary:true, danger:true}]});
        if (all === null) return;
        if (all) ids = same.map(x => x.id);
      }
      data.events = data.events.filter(x => !ids.includes(x.id)); ids.forEach(tombstone);
      dlg.close(); commit(); toast(ids.length > 1 ? `${ids.length} data verwijderd` : 'Verwijderd');
    });
    d.querySelectorAll('#evTitle, #evEd').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#evSave', d).click(); } }));
  });
}

/* ---- Events op de pagina's ---- */
/* ---- BTW-calculator: van exclusief naar inclusief btw en omgekeerd ---- */
const BTW_RATES = [6, 9, 12, 21];
const btwState = {ex:'', exRate:21, inc:'', incRate:21};
const btwMoney = n => n == null ? '—' : eur(n);
function btwCalc() {
  const ex = parseNl(btwState.ex), inc = parseNl(btwState.inc), a = btwState.exRate / 100, b = btwState.incRate / 100;
  const exVat = ex == null ? null : ex * a, incExcl = inc == null ? null : inc / (1 + b);
  return {exVat, exTotal:ex == null ? null : ex + exVat, incVat:inc == null ? null : inc - incExcl, incExcl};
}
function btwOut() {
  const c = btwCalc();
  $('#btwExVat').textContent = btwMoney(c.exVat); $('#btwExTot').textContent = btwMoney(c.exTotal);
  $('#btwIncVat').textContent = btwMoney(c.incVat); $('#btwIncEx').textContent = btwMoney(c.incExcl);
  $('#btwExRate').textContent = btwState.exRate; $('#btwIncRate').textContent = btwState.incRate;
  $$('[data-btw-rate]').forEach(b => b.classList.toggle('on', +b.dataset.btwRate === btwState[b.dataset.btwFor + 'Rate']));
}
function btwHtml() {
  const rates = k => `<div class="btw-rates" role="group" aria-label="Btw-percentage">${BTW_RATES.map(r => `<button type="button" data-btw-for="${k}" data-btw-rate="${r}" class="${btwState[k + 'Rate'] === r ? 'on' : ''}" aria-pressed="${btwState[k + 'Rate'] === r}">${r}%</button>`).join('')}</div>`;
  return `<div class="btw">
    <section class="btw-card"><span class="eyebrow">Mijn bedrag is</span><h3>Exclusief btw</h3>
      <label class="fl">Bedrag (excl. btw)<span class="btw-field"><i>€</i><input id="btwEx" class="btw-in" data-btw="ex" type="text" inputmode="decimal" value="${esc(btwState.ex)}" placeholder="0,00" autocomplete="off"></span></label>
      <div class="btw-sub">Kies je btw-percentage</div>${rates('ex')}
      <dl class="btw-res"><div><dt>Btw (<span id="btwExRate"></span>%)</dt><dd id="btwExVat"></dd></div><div class="tot"><dt>Totaal (incl. btw)</dt><dd id="btwExTot"></dd></div></dl>
    </section>
    <section class="btw-card ink"><span class="eyebrow">Mijn bedrag is</span><h3>Inclusief btw</h3>
      <label class="fl">Bedrag (incl. btw)<span class="btw-field"><i>€</i><input id="btwInc" class="btw-in" data-btw="inc" type="text" inputmode="decimal" value="${esc(btwState.inc)}" placeholder="0,00" autocomplete="off"></span></label>
      <div class="btw-sub">Kies je btw-percentage</div>${rates('inc')}
      <dl class="btw-res"><div><dt>Btw (<span id="btwIncRate"></span>%)</dt><dd id="btwIncVat"></dd></div><div class="tot"><dt>Bedrag (excl. btw)</dt><dd id="btwIncEx"></dd></div></dl>
    </section></div>`;
}
$('#pageView').addEventListener('input', e => {
  const k = e.target.dataset?.btw; if (!k) return;
  btwState[k] = e.target.value; btwOut();
});
$('#pageView').addEventListener('click', e => {
  const b = e.target.closest('[data-btw-rate]'); if (!b) return;
  btwState[b.dataset.btwFor + 'Rate'] = +b.dataset.btwRate; btwOut();
});
const pv = $('#pageView');
pv.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('#evNew')) { openEventDialog(null, agendaSel || (agendaMonth === today().slice(0, 7) ? today() : agendaMonth + '-01')); return; }
  const evb = t.closest('[data-ev]'); if (evb) { const ev = data.events.find(x => x.id === evb.dataset.ev); if (ev) openEventDialog(ev); return; }
  const nwo = t.closest('[data-newon]'); if (nwo) { openEventDialog(null, nwo.dataset.newon); return; }
  const am = t.closest('[data-amonth]'); if (am) { const k = +am.dataset.amonth; if (!k) { agendaMonth = today().slice(0, 7); agendaSel = today(); } else { const [y, m] = agendaMonth.split('-').map(Number); agendaMonth = ymd(new Date(y, m - 1 + k, 1)).slice(0, 7); } renderPage(true); return; }
  const dayEl = t.closest('[data-day]');
  if (dayEl) { const k = dayEl.dataset.day; if (agendaSel === k && !matchMedia('(max-width:860px)').matches) { openEventDialog(null, k); return; } agendaSel = k; if (k.slice(0, 7) !== agendaMonth) agendaMonth = k.slice(0, 7); renderPage(true); return; }
  const tk = t.closest('[data-task]'); if (tk) { openTask(tk.dataset.task); return; }
  const sp = t.closest('[data-salespage]'); if (sp) { setView({type:'sales', id:sp.dataset.salespage}); return; }
});
pv.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const day = e.target.closest?.('[data-day]'); if (day && e.target === day) { e.preventDefault(); openEventDialog(null, day.dataset.day); return; }
  const row = e.target.closest?.('tr[data-salespage]');
  if (row && e.target === row) { e.preventDefault(); row.click(); }
});
// hover-/tiklabel voor de grafieken

/* ---------------- Timers: auto-lock, periodieke sync, datumwissel ---------------- */
let lastAct = now(), timersStarted = false, lastDay = today(), lastMin = -1, lastDueSig = null;
function startTimers() {
  if (timersStarted) return; timersStarted = true;
  ['pointerdown','keydown','touchstart','wheel'].forEach(ev => addEventListener(ev, () => lastAct = now(), {passive:true}));
  const check = () => {
    const m = data?.settings.autolock;
    if (m && now() - lastAct > m * 60000) { lock(); return; }
    if (today() !== lastDay) { lastDay = today(); renderAll(); }
    // kleuren van kaarten met een uur elke minuut bijwerken (niet tijdens typen of slepen)
    const min = new Date().getMinutes();
    if (data && min !== lastMin) {
      lastMin = min;
      // alleen hertekenen als de kleur van een kaart met uur (bijna te laat / te laat) echt verandert
      const dsig = data.tasks.filter(t => t.time && !t.done && t.due && t.due <= today()).map(t => t.id + dueState(t)).join('|');
      if (dsig === lastDueSig) return;
      const busy = drag || document.activeElement?.closest?.('#list,#detail,#toolbar');
      if (busy) lastMin = -1;   // bezig met typen of slepen: volgende ronde opnieuw proberen
      else if (view.type !== 'sales' && $('#lock').hidden) { lastDueSig = dsig; renderMain(); }
    }
  };
  setInterval(check, 15000);
  document.addEventListener('visibilitychange', () => {
    check();
    if (document.visibilityState === 'visible') syncNow();
    else if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; persist(); scheduleSync(0); }
  });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 30000);
  addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; persist(); } });
  addEventListener('online', () => syncNow());
  addEventListener('offline', () => { if (data?.settings.sync) setSync('offline'); });
}

// Snel starten: heeft dit toestel al een kluis, dan meteen het wachtwoord vragen.
const cloudDefaultMode = () => 'cloud-in';   // de meeste bezoekers hebben al een account (nieuw toestel); "Account aanmaken" staat eronder
loadVault().finally(async () => {
if (!CLOUD) await loadCloudCfg().catch(() => {});   // eerst weten of er een accountdienst is
if (CLOUD) lockMode = cloudDefaultMode(); else lockMode = vaultBlob() ? 'unlock' : 'setup';
try { if (CLOUD && localStorage.getItem('taken.lock.mode') === 'cloud-up') { lockMode = 'cloud-up'; lockModeChosen = true; } localStorage.removeItem('taken.lock.mode'); } catch {}
if (/type=recovery/.test(location.hash)) {   // link uit de herstelmail
  if (!CLOUD) await loadCloudCfg();
  if (CLOUD && await takeRecoveryLink()) { lockMode = 'cloud-reset'; lockModeChosen = true; }
}
renderLock();
loadCloudCfg().then(c => {
  if (!c || lockModeChosen || $('#lock').hidden) return;
  const typed = [...$$('#lockFields input')].some(i => i.value);
  if (!lockMode.startsWith('cloud') && !typed) { lockMode = cloudDefaultMode(); renderLock(); }
});
});

/* ---------------- Face ID / Touch ID ----------------
   Het wachtwoord wordt versleuteld met een sleutel die enkel met Face ID/Touch ID (WebAuthn PRF) opgevraagd kan worden.
   Op dit toestel staat dus enkel een versleutelde kopie; zonder biometrie is ze onbruikbaar. */
const BIO_KEY = 'taken.bio.v1';
const bioGet = () => { try { return JSON.parse(localStorage.getItem(BIO_KEY)); } catch { return null; } };
const bioSupported = () => !!(window.PublicKeyCredential && navigator.credentials?.create && window.crypto?.subtle);
const bioName = () => /iP(hone|ad)/.test(navigator.userAgent) ? 'Face ID' : 'biometrie';
const rndBytes = n => crypto.getRandomValues(new Uint8Array(n));
async function bioKey(secret) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF', hash:'SHA-256', salt:new Uint8Array(0), info:te.encode('taken-bio-v1')}, base, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
}
const bioAssert = (credId, salt) => navigator.credentials.get({publicKey:{challenge:rndBytes(32), rpId:location.hostname, allowCredentials:[{type:'public-key', id:credId}], userVerification:'required', timeout:60000, extensions:{prf:{eval:{first:salt}}}}});
async function bioEnable(pw) {
  const salt = rndBytes(32);
  const cred = await navigator.credentials.create({publicKey:{challenge:rndBytes(32), rp:{name:'Klose', id:location.hostname}, user:{id:rndBytes(16), name:'klose', displayName:'Klose'},
    pubKeyCredParams:[{type:'public-key', alg:-7}, {type:'public-key', alg:-257}], timeout:60000,
    authenticatorSelection:{authenticatorAttachment:'platform', userVerification:'required', residentKey:'preferred'}, extensions:{prf:{eval:{first:salt}}}}});
  const ext = cred.getClientExtensionResults().prf;
  let secret = ext?.results?.first;
  if (!secret && ext?.enabled !== false) secret = (await bioAssert(cred.rawId, salt)).getClientExtensionResults().prf?.results?.first;
  if (!secret) throw new Error('Dit toestel of deze browser ondersteunt dit niet (iOS 18 of nieuwer is nodig).');
  const iv = rndBytes(12), ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await bioKey(new Uint8Array(secret)), te.encode(pw));
  localStorage.setItem(BIO_KEY, JSON.stringify({cred:b64(cred.rawId), salt:b64(salt), iv:b64(iv), ct:b64(ct)}));
}
async function bioReadPassword() {
  const b = bioGet(); if (!b) throw new Error('Face ID is niet ingesteld.');
  const secret = (await bioAssert(unb64(b.cred), unb64(b.salt))).getClientExtensionResults().prf?.results?.first;
  if (!secret) throw new Error('Geen sleutel ontvangen.');
  return td.decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(b.iv)}, await bioKey(new Uint8Array(secret)), unb64(b.ct)));
}
$('#lockBio').addEventListener('click', async () => {
  const err = $('#lockErr'); err.textContent = '';
  try {
    $('#pw1').value = await bioReadPassword();
    $('#lockForm').requestSubmit();
    for (let i = 0; i < 120 && $('#app').hidden; i++) {
      await new Promise(r => setTimeout(r, 150));
      if (/onjuist/i.test(err.textContent)) { localStorage.removeItem(BIO_KEY); renderLock(); err.textContent = 'Je wachtwoord is gewijzigd. Log in met je wachtwoord en zet ' + bioName() + ' opnieuw aan.'; break; }
    }
  } catch (e) { if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') err.textContent = bioName() + ' mislukt: ' + (e.message || e); }
  finally { const f = $('#pw1'); if (f) f.value = ''; }
});
function bioBox() {
  const name = bioName();
  if (!bioSupported()) return `<div class="box"><b>${name}</b><p class="muted small">Niet beschikbaar in deze browser.</p></div>`;
  if (bioGet()) return `<div class="box bio-box"><div class="nt-head"><div><b>Ontgrendelen met ${name}</b><br><span class="muted small">Aan op dit toestel</span></div><button type="button" class="btn" id="bioOff">Uitzetten</button></div></div>`;
  return `<div class="box bio-box"><b>Ontgrendelen met ${name}</b>
    <p class="muted small">Ontgrendel Klose op dit toestel met ${name} in plaats van je wachtwoord te typen. Je wachtwoord wordt enkel bewaard in een versleutelde vorm die alleen ${name} kan openen. Vereist een toestel en browser die dit ondersteunen.</p>
    <label class="fl">Je wachtwoord<input id="bioPw" type="password" autocomplete="current-password"></label>
    <p class="err" id="bioErr"></p>
    <button type="button" class="btn" id="bioOn">${cap(name)} aanzetten</button></div>`;
}
function bindBioBox(d) {
  const redraw = () => { const el = $('#bioOn', d)?.closest('.box') || $('#bioOff', d)?.closest('.box'); if (el) el.outerHTML = bioBox(); bindBioBox(d); };
  $('#bioOff', d)?.addEventListener('click', () => { localStorage.removeItem(BIO_KEY); toast(bioName() + ' staat uit'); redraw(); });
  $('#bioOn', d)?.addEventListener('click', async e => {
    const err = $('#bioErr', d), pw = $('#bioPw', d).value; err.textContent = '';
    if (!pw) { err.textContent = 'Vul je wachtwoord in.'; return; }
    e.target.disabled = true;
    try {
      try { await unseal((await openKey(pw, vaultBlob())).key, vaultBlob()); } catch { throw new Error('Wachtwoord klopt niet.'); }
      await bioEnable(pw);
      toast(bioName() + ' staat aan');
      redraw();
    } catch (ex) { err.textContent = ex.name === 'NotAllowedError' ? 'Geannuleerd.' : ex.message; e.target.disabled = false; }
  });
}

/* ---------------- Offline & updates (service worker) ---------------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker niet geregistreerd', e));
  // Nieuwe versie: vaste melding rechtsonder, op elk scherm (ook bij het inloggen), tot de gebruiker ververst
  const showUpdate = () => {
    if ($('#updBar')) return;
    const el = document.createElement('div');
    el.id = 'updBar'; el.setAttribute('role', 'status');
    el.innerHTML = '<span>Er is een nieuwe versie van Klose.</span><button type="button" id="updGo">Verversen</button><button type="button" id="updX" class="x" aria-label="Later">×</button>';
    document.body.appendChild(el);
    $('#updGo').onclick = () => location.reload();
    $('#updX').onclick = () => el.remove();
  };
  const hadCtl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadCtl) showUpdate(); });
  navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'update-ready') showUpdate(); });
  // regelmatig zelf controleren, ook als de app dagen openstaat
  const checkUpdate = () => navigator.serviceWorker.ready.then(r => { r.update().catch(() => {}); r.active?.postMessage({type: 'check'}); }).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
  setInterval(checkUpdate, 10 * 60 * 1000);
}

// privacy: browsers bewaren of delen ingetypte tekst soms voor suggesties; deal- en klantvelden doen dat niet
(() => {
  const off = root => root.querySelectorAll?.('input:not([autocomplete]):not([type=password]):not([type=checkbox]):not([type=radio]),textarea:not([autocomplete])').forEach(el => { if (!el.closest('#lock')) el.setAttribute('autocomplete', 'off'); });
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('input,textarea') && !n.hasAttribute('autocomplete') && !n.closest('#lock') && n.type !== 'password') n.setAttribute('autocomplete', 'off'); off(n); } }).observe(document.body, {childList: true, subtree: true});
  off(document);
})();

// oude lokale klantenblokken (IndexedDB) wissen: de klantendatabase bestaat niet meer
(async () => { try { const db = await idbOpen(), st = db.transaction('kv', 'readwrite').objectStore('kv'); st.openKeyCursor().onsuccess = e => { const c = e.target.result; if (c) { if (String(c.key).startsWith(CL_KEY)) st.delete(c.key); c.continue(); } }; } catch {} })();

bindCrm();

bindUsability();

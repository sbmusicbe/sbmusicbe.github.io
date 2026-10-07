import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { prefersMarkdown } from './worker.js';

const FILES = {
  '/': ['text/html; charset=utf-8', '<html>home</html>', 200],
  '/index.md': ['text/markdown', '# Home markdown', 200],
  '/about.md': ['text/markdown', '# Over SB', 200],
  '/about.html': ['text/html; charset=utf-8', '<html>about</html>', 200],
  '/privacy.html': ['text/html; charset=utf-8', '<html>privacy</html>', 200],
  '/404.md': ['text/markdown', '# 404 — Pagina niet gevonden\n\nBekijk /llms.txt en /sitemap.xml.', 200],
};
globalThis.fetch = async (req) => {
  const f = FILES[new URL(req.url).pathname];
  if (!f) return new Response('<html>niet gevonden</html>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', Vary: 'accept-encoding' } });
  return new Response(f[1], { status: f[2], headers: { 'Content-Type': f[0], Vary: 'accept-encoding' } });
};
const get = (path, accept) => worker.fetch(new Request('https://sbmusic.be' + path, { headers: accept ? { Accept: accept } : {} }));

test('prefersMarkdown parses Accept', () => {
  assert.equal(prefersMarkdown('text/markdown'), true);
  assert.equal(prefersMarkdown('text/markdown, text/html;q=0.5'), true);
  assert.equal(prefersMarkdown('text/html, text/markdown;q=0.5'), false);
  assert.equal(prefersMarkdown('text/html'), false);
  assert.equal(prefersMarkdown('*/*'), false);
  assert.equal(prefersMarkdown('text/markdown;q=0'), false);
  assert.equal(prefersMarkdown(null), false);
});

test('homepage: Markdown met Vary: Accept', async () => {
  const r = await get('/', 'text/markdown');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/markdown/);
  assert.match(r.headers.get('vary'), /Accept/);
  assert.equal(await r.text(), '# Home markdown');
});

test('homepage: HTML blijft HTML, ook met Vary: Accept', async () => {
  for (const accept of ['text/html', undefined]) {
    const r = await get('/', accept);
    assert.match(r.headers.get('content-type'), /^text\/html/);
    assert.match(r.headers.get('vary'), /accept-encoding/);
    assert.match(r.headers.get('vary'), /Accept/);
    assert.equal(await r.text(), '<html>home</html>');
  }
});

test('/about en /about.html geven Markdown', async () => {
  for (const p of ['/about', '/about.html']) {
    FILES['/about'] = FILES['/about.html'];
    const r = await get(p, 'text/markdown');
    assert.equal(await r.text(), '# Over SB');
  }
});

test('pagina zonder .md-versie valt terug op HTML', async () => {
  const r = await get('/privacy.html', 'text/markdown');
  assert.match(r.headers.get('content-type'), /^text\/html/);
  assert.match(r.headers.get('vary'), /Accept/);
});

test('404 met Accept: text/markdown geeft status 404 en Markdown-body met links', async () => {
  const r = await get('/__bestaat-niet', 'text/markdown');
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type'), /^text\/markdown/);
  const body = await r.text();
  assert.ok(body.length >= 20);
  assert.match(body, /llms\.txt|sitemap\.xml/);
});

test('404 zonder Markdown-Accept blijft HTML 404', async () => {
  const r = await get('/__bestaat-niet', 'text/html');
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type'), /^text\/html/);
});

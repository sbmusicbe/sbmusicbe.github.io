import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const text = html => (html.match(/<main[\s\S]*?<\/main>/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const home = read('index.html');
const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const node = t => ld['@graph'].find(n => n['@type'] === t);

test('homepage metadata: canonical, lang, og:image, og:type', () => {
  assert.match(home, /<html lang="nl">/);
  assert.match(home, /<link rel="canonical" href="https:\/\/sbmusic\.be\/"/);
  assert.match(home, /<meta property="og:image" content="https:\/\/sbmusic\.be\/[^"]+"/);
  assert.match(home, /<meta property="og:type" content="website"/);
});

test('JSON-LD: Organization met contactPoint en PostalAddress', () => {
  const o = node('Organization');
  assert.equal(o.url, 'https://sbmusic.be/');
  assert.ok(o.name && o.description);
  assert.equal(o.contactPoint[0].email, 'hey@sbmusic.be');
  assert.ok(o.contactPoint[0].contactType);
  assert.equal(o.address['@type'], 'PostalAddress');
  assert.ok(o.sameAs.length >= 3);
  assert.equal(node('Person').name, 'SB');
  assert.equal(node('WebSite').url, 'https://sbmusic.be/');
});

test('trust pages: /about, /contact, /privacy hebben ≥500 tekens', () => {
  for (const f of ['about.html', 'contact.html', 'privacy.html']) {
    assert.ok(existsSync(new URL('../' + f, import.meta.url)), f);
    assert.ok(text(read(f)).length >= 500, f);
  }
});

test('footer linkt naar trust pages en ze staan in de sitemap', () => {
  const sm = read('sitemap.xml');
  for (const f of ['about.html', 'contact.html', 'privacy.html', 'voorwaarden.html']) {
    assert.ok(sm.includes(`https://sbmusic.be/${f}`), f);
  }
  for (const f of ['about.html', 'contact.html', 'privacy.html', 'voorwaarden.html']) assert.ok(home.includes(`href="${f}"`), f);
});

test('llms.txt heeft when-to-use sectie en wijst naar Markdown-versies', () => {
  const l = read('llms.txt');
  assert.match(l, /^# /);
  assert.match(l, /^> /m);
  assert.match(l, /## Wanneer gebruik je SB \(when to use this\)/);
  assert.match(l, /hey@sbmusic\.be/);
  assert.match(l, /https:\/\/sbmusic\.be\/index\.md/);
});

test('Markdown-bestanden en 404.md zijn niet leeg en 404.md bevat links', () => {
  for (const f of ['index.md', 'about.md', 'contact.md']) assert.ok(read(f).length > 200, f);
  const nf = read('404.md');
  assert.ok(nf.length >= 20);
  assert.match(nf, /sitemap\.xml/);
  assert.match(nf, /llms\.txt/);
});

test('homepage verwijst naar Markdown-alternatief', () => {
  assert.match(home, /<link rel="alternate" type="text\/markdown" href="\/index\.md"/);
});

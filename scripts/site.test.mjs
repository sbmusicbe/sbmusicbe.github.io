import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const text = html => (html.match(/<main[\s\S]*?<\/main>/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const home = read('index.html');
const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const node = t => ld['@graph'].find(n => [].concat(n['@type']).includes(t));

test('homepage metadata: canonical, lang, og:image, og:type', () => {
  assert.match(home, /<html lang="nl-BE">/);
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

test('privacy-pagina bestaat en heeft ≥500 tekens', () => {
  for (const f of ['privacy.html', 'voorwaarden.html']) {
    assert.ok(existsSync(new URL('../' + f, import.meta.url)), f);
    assert.ok(text(read(f)).length >= 500, f);
  }
});

test('footer linkt naar privacy/voorwaarden en ze staan in de sitemap', () => {
  const sm = read('sitemap.xml');
  for (const f of ['privacy.html', 'voorwaarden.html']) {
    assert.ok(sm.includes(`https://sbmusic.be/${f}`), f);
  }
  for (const f of ['privacy.html', 'voorwaarden.html']) assert.ok(home.includes(`href="${f}"`), f);
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
  for (const f of ['index.md']) assert.ok(read(f).length > 200, f);
  const nf = read('404.md');
  assert.ok(nf.length >= 20);
  assert.match(nf, /sitemap\.xml/);
  assert.match(nf, /llms\.txt/);
});

test('homepage verwijst naar Markdown-alternatief', () => {
  assert.match(home, /<link rel="alternate" type="text\/markdown" href="\/index\.md"/);
});

test('link in bio: formulier-popup en socials op de homepage', () => {
  assert.match(home, /id="openForm"/);
  assert.match(home, /role="dialog" aria-modal="true"/);
  assert.match(home, /formsubmit\.co\/ajax\/hey@sbmusic\.be/);
  for (const u of ['instagram.com/sbmusicbe', 'tiktok.com/@sbmusicbe', 'facebook.com/sbmusicbe']) assert.ok(home.includes(u), u);
  for (const f of ['assets/sb-avatar.jpg', 'assets/logo-sb-white.png']) assert.ok(existsSync(new URL('../' + f, import.meta.url)), f);
});

test('SEO: title, description, robots, twitter card, hreflang, ProfilePage', () => {
  assert.match(home, /<title>[^<]{20,70}<\/title>/);
  assert.match(home, /<meta name="description" content="[^"]{80,170}"/);
  assert.match(home, /<meta name="robots" content="index, follow/);
  assert.match(home, /<meta name="twitter:card" content="summary_large_image"/);
  assert.match(home, /hreflang="nl-be"/);
  assert.ok(node('ProfilePage'));
  assert.ok(node('Organization') || ld['@graph'].some(n => [].concat(n['@type']).includes('Organization')));
});

test('h1 en zichtbare tekst voor zoekmachines en AI', () => {
  assert.match(home, /<h1>[\s\S]*alt="SB — Allround DJ"/);
  assert.match(home, /<h2 id="boek-h">Boek SB voor<\/h2>/);
  assert.match(home, /Café De Zwarte Ruiter/);
});

test('geen scripts of fonts van derden; lettertypes zelf gehost', () => {
  for (const f of ['index.html', 'privacy.html', 'voorwaarden.html', '404.html']) {
    const h = read(f);
    assert.doesNotMatch(h, /fonts\.googleapis|fonts\.gstatic|unpkg\.com|cdn\./, f);
    assert.match(h, /\/assets\/fonts\/onest-\d+\.woff2/, f);
  }
  for (const w of [400, 500, 600]) assert.ok(existsSync(new URL(`../assets/fonts/onest-${w}.woff2`, import.meta.url)));
});

test('robots.txt, sitemap, icons en og-image', () => {
  assert.match(read('robots.txt'), /Sitemap: https:\/\/sbmusic\.be\/sitemap\.xml/);
  assert.match(read('robots.txt'), /User-agent: GPTBot\nAllow: \//);
  assert.match(read('sitemap.xml'), /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  for (const f of ['favicon.ico', 'apple-touch-icon.png', 'og-image.jpg', 'assets/icon-192.png']) assert.ok(existsSync(new URL('../' + f, import.meta.url)), f);
  for (const f of ['privacy.html', 'voorwaarden.html']) assert.match(read(f), /<link rel="canonical" href="https:\/\/sbmusic\.be\/[a-z.]+"/);
});

/* Taken — service worker
   Bewaart de app zelf (HTML, iconen, logo) op het toestel, zodat Taken meteen
   opent, ook zonder internet. Je gegevens staan al versleuteld in de browser;
   config.json en GitHub worden nooit gecachet en gaan altijd naar het netwerk. */
const CACHE = 'taken-app-v1';
const ASSETS = ['./', 'manifest.webmanifest', 'adrem-logo.png', 'favicon-32.png', 'favicon-48.png',
  'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
const PAGE = new URL('./', self.registration.scope).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, {cache: 'no-cache'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('taken-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Haalt de nieuwste pagina op; als die verschilt van de bewaarde versie, krijgt de app een seintje.
async function refreshPage() {
  const cache = await caches.open(CACHE);
  const fresh = await fetch(PAGE, {cache: 'no-cache'});
  if (!fresh.ok) return;
  const old = await cache.match(PAGE);
  const [a, b] = await Promise.all([fresh.clone().text(), old ? old.text() : Promise.resolve(null)]);
  await cache.put(PAGE, fresh);
  if (b !== null && a !== b) {
    for (const c of await self.clients.matchAll({type: 'window'})) c.postMessage({type: 'update-ready'});
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (url.pathname.endsWith('/config.json') || url.pathname.endsWith('/sw.js')) return;

  // De app zelf: meteen uit het toestel laden, op de achtergrond bijwerken.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match(PAGE);
      if (cached) {
        // eerst volledig inlezen: het bijwerken hieronder overschrijft de bewaarde kopie
        const copy = new Response(await cached.blob(), {status:cached.status, statusText:cached.statusText, headers:cached.headers});
        e.waitUntil(refreshPage().catch(() => {}));
        return copy;
      }
      try { await refreshPage(); return (await caches.match(PAGE)) || fetch(req); }
      catch { return fetch(req); }
    })());
    return;
  }

  // Iconen, logo, manifest: uit het toestel, anders van het netwerk (en bewaren).
  e.respondWith((async () => {
    const cached = await caches.match(req, {ignoreSearch: true});
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});

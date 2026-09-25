// Gedeelde code voor de gastpagina en het beheer.
// Opslag: issues in een privé GitHub-repo (config.repo).
//  - Event    = issue met label "event"; instellingen als JSON in de tekst.
//  - Verzoekje = issue; open = in de wachtrij, gesloten "completed" = gespeeld, "not planned" = afgewezen.
import { config } from './config.js';

export const configured = !!(config.repo && config.token);
export const REPO = config.repo;
export const decodeToken = t => { try { return atob(t).split('').reverse().join(''); } catch { return ''; } };
export const encodeToken = t => btoa(t.split('').reverse().join('')); // enkel zodat GitHub het token niet als "gelekt" intrekt
let TOKEN = configured ? decodeToken(config.token) : '';
export const setToken = (t, repo) => { TOKEN = t; if (repo) config.repo = repo; };

// ---- GitHub API ----
const etags = new Map();
// cond: voorwaardelijke GET met ETag. Een 304 telt niet mee voor de limiet van GitHub (5000/uur).
export async function api(method, path, body, {cond = false, raw = false} = {}) {
  const url = path.startsWith('https://') ? path : 'https://api.github.com/repos/' + config.repo + path;
  const headers = {Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};
  const c = cond && etags.get(url);
  if (c) headers['If-None-Match'] = c.etag;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, {method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store'});
  if (r.status === 304 && c) return {data: c.data, changed: false, link: c.link};
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).message || msg; } catch {}
    const e = new Error(msg); e.status = r.status;
    if (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0') e.rateLimited = true;
    throw e;
  }
  const data = r.status === 204 ? null : await r.json();
  const link = r.headers.get('Link') || '';
  if (cond && r.headers.get('ETag')) etags.set(url, {etag: r.headers.get('ETag'), data, link});
  return cond || raw ? {data, changed: true, link} : data;
}
export const nextLink = link => (link.match(/<([^>]+)>;\s*rel="next"/) || [])[1];

// ---- events ----
export const EVENT_LABEL = 'event';
// Issues echt verwijderen vraagt beheerrechten op de repo; daarom krijgen ze dit label en worden ze gesloten.
export const DELETED_LABEL = 'verwijderd';
const hasLabel = (issue, name) => (issue.labels || []).some(l => (l.name || l) === name);
const JSON_RE = /```json\s*([\s\S]*?)```/;
export function parseEvent(issue) {
  if (!issue || issue.pull_request || !hasLabel(issue, EVENT_LABEL) || hasLabel(issue, DELETED_LABEL)) return null;
  try {
    const d = JSON.parse((issue.body || '').match(JSON_RE)[1]);
    if (!d.code) return null;
    return {name: '', welcome: '', closedMessage: '', allowMessages: true, open: false, archived: false, nowPlaying: null, ...d,
      id: d.code, number: issue.number, createdAt: issue.created_at};
  } catch { return null; }
}
export function eventIssue(ev) {
  const d = {code: ev.id, name: ev.name, welcome: ev.welcome || '', closedMessage: ev.closedMessage || '',
    allowMessages: ev.allowMessages !== false, open: !!ev.open, archived: !!ev.archived, nowPlaying: ev.nowPlaying || null,
    photo: ev.photo || null};
  const url = new URL('./?e=' + ev.id, location.href).href;
  return {
    title: '🎧 ' + ev.name,
    body: `Event voor verzoekjes: ${url}\n\n_Wordt beheerd via beheer.html, pas de gegevens hieronder niet met de hand aan._\n\n\`\`\`json\n${JSON.stringify(d, null, 2)}\n\`\`\`\n`
  };
}

// ---- verzoekjes ----
const REQ_RE = /<!--\s*vz\s+([\s\S]*?)\s*-->/;
export function parseRequest(issue) {
  if (!issue || issue.pull_request) return null;
  const m = (issue.body || '').match(REQ_RE);
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    if (!d.e || !d.t) return null;
    return {
      id: issue.number, number: issue.number, eventId: String(d.e), eventNumber: +d.en || null, title: String(d.t).slice(0, 200), artist: String(d.a || '').slice(0, 200),
      artwork: safeArt(d.art), songKey: d.k || songKey(d.t, d.a), name: String(d.n || '').slice(0, 60), message: String(d.m || '').slice(0, 300),
      status: hasLabel(issue, DELETED_LABEL) ? 'deleted' : issue.state === 'open' ? 'new' : issue.state_reason === 'not_planned' ? 'rejected' : 'played',
      createdAt: issue.created_at, doneAt: issue.closed_at
    };
  } catch { return null; }
}
export function requestIssue(r) {
  const d = {e: r.eventId, en: r.eventNumber, t: r.title, a: r.artist, art: r.artwork, k: r.songKey, n: r.name, m: r.message, s: r.source};
  const line = s => s.replace(/[\r\n]+/g, ' ').replace(/-->/g, '--');
  return {
    title: `[${r.eventId}] ${line(r.title)}${r.artist ? ' — ' + line(r.artist) : ''}`.slice(0, 250),
    body: `**${line(r.title)}**${r.artist ? ' — ' + line(r.artist) : ''}\n\n`
      + (r.name ? `Van: ${line(r.name)}\n\n` : '') + (r.message ? `> ${line(r.message)}\n\n` : '')
      + `<!-- vz ${JSON.stringify(d).replace(/-->/g, '--\\u003e')} -->\n`
  };
}

// ---- foto per event ----
// Met enkel een Issues-token kunnen we geen bestanden uploaden. De foto wordt daarom verkleind tot een JPEG
// en als base64 in (maximaal 3) reacties op het event-issue bewaard. In de event-gegevens staat {ids, v}.
const PHOTO_CHUNK = 60000, PHOTO_MAX = 3 * PHOTO_CHUNK;
const photoMem = new Map();
const photoKey = p => p && Array.isArray(p.ids) && p.ids.length ? p.ids.join('.') + '@' + (p.v || 0) : '';

export async function loadPhoto(photo) {
  const key = photoKey(photo);
  if (!key) return '';
  if (photoMem.has(key)) return photoMem.get(key);
  const cached = store.get('vz_photos', {});
  let url = cached[key];
  if (!url) {
    const parts = await Promise.all(photo.ids.slice(0, 3).map(id => api('GET', '/issues/comments/' + (+id))));
    url = parts.map(c => ((c.body || '').match(/<!--\s*vzfoto\s*([A-Za-z0-9+/=:;,\s]*?)-->/) || [, ''])[1].replace(/\s+/g, '')).join('');
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(url)) return '';
    // Enkel de laatste 3 foto's bijhouden in de browser.
    const next = {[key]: url};
    Object.keys(cached).slice(-2).forEach(k => { if (k !== key) next[k] = cached[k]; });
    store.set('vz_photos', next);
  }
  photoMem.set(key, url);
  return url;
}

// Verklein de gekozen foto tot een JPEG die in 3 reacties past.
export async function compressImage(file) {
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Dit bestand is geen foto die de browser kan openen.'));
    i.src = URL.createObjectURL(file);
  });
  let max = 1400;
  for (let tries = 0; tries < 8; tries++, max = Math.round(max * 0.8)) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= PHOTO_MAX) { URL.revokeObjectURL(img.src); return url; }
    }
  }
  URL.revokeObjectURL(img.src);
  throw new Error('De foto is te groot.');
}

export async function savePhoto(eventNumber, dataUrl) {
  const chunks = dataUrl.match(new RegExp(`.{1,${PHOTO_CHUNK}}`, 'g'));
  const ids = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = await api('POST', `/issues/${eventNumber}/comments`, {body: `📷 Foto voor dit event (deel ${i + 1}/${chunks.length}), beheerd via beheer.html\n<!-- vzfoto\n${chunks[i]}\n-->`});
    ids.push(c.id);
  }
  const photo = {ids, v: Date.now()};
  photoMem.set(photoKey(photo), dataUrl);
  return photo;
}
export async function deletePhoto(photo) {
  for (const id of photo?.ids || []) {
    try { await api('DELETE', '/issues/comments/' + (+id)); } catch (e) { if (e.status !== 404) console.warn(e); }
  }
}

// Hoort een verzoekje bij dit event? Een code kan na het verwijderen van een event opnieuw gebruikt worden;
// daarom telt ook het issue-nummer van het event (oudere verzoekjes zonder nummer: op aanmaakdatum).
export const belongsTo = (r, ev) => !!ev && r.eventId === ev.id
  && (r.eventNumber ? r.eventNumber === ev.number : Date.parse(r.createdAt) >= Date.parse(ev.createdAt) - 60_000);

// ---- wachtwoord (beheer) ----
const te = new TextEncoder();
export const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
export async function pwHash(pw, saltB64, iter = 310000) {
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256'}, key, 256));
}
export async function checkPassword(pw) {
  const h = config.adminHash;
  return !!h && await pwHash(pw, h.salt, h.iter) === h.hash;
}
export const adminHash = () => config.adminHash;

// ---- kleine hulpjes ----
export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Zelfde nummer = zelfde sleutel, ook bij "(Remastered)", "- Radio Edit", "feat." enz.
export function songKey(title, artist) {
  const norm = s => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  return (norm(title) + '|' + norm(artist).split(/ (?:and|x) /)[0]).slice(0, 300);
}

// Alleen hoesjes van Apple (mzstatic) worden getoond.
export const safeArt = u => /^https:\/\/[a-z0-9.-]+\.mzstatic\.com\/[^"'()\s]+$/i.test(u || '') ? u : '';

// Zoeken via de iTunes Search API (JSONP: geen sleutel nodig, werkt vanaf elke site).
let jsonpN = 0;
export function searchSongs(term, {limit = 15, country = 'BE'} = {}) {
  return new Promise((resolve, reject) => {
    const cb = '__vzcb' + (++jsonpN);
    const s = document.createElement('script');
    const done = () => { delete window[cb]; s.remove(); clearTimeout(t); };
    const t = setTimeout(() => { done(); reject(new Error('timeout')); }, 8000);
    window[cb] = data => {
      done();
      resolve((data.results || []).filter(r => r.kind === 'song').map(r => ({
        title: r.trackName, artist: r.artistName, album: r.collectionName || '',
        artwork: (r.artworkUrl100 || '').replace('100x100bb', '200x200bb'),
        year: (r.releaseDate || '').slice(0, 4)
      })));
    };
    s.onerror = () => { done(); reject(new Error('netwerk')); };
    s.src = 'https://itunes.apple.com/search?' + new URLSearchParams({
      term, entity: 'song', media: 'music', limit, country, callback: cb
    });
    document.head.appendChild(s);
  });
}

export function toast(msg, ms = 2600) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms);
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

// Herhaal fn elke ms milliseconden zolang de pagina zichtbaar is (spaart de API-limiet).
export function poll(fn, ms) {
  let t;
  const tick = async () => { clearTimeout(t); if (!document.hidden) { try { await fn(); } catch (e) { console.warn(e); } } t = setTimeout(tick, ms); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  t = setTimeout(tick, ms);
  return tick;
}

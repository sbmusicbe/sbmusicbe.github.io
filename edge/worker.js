// Cloudflare Worker: Markdown content negotiation + Markdown 404s voor sbmusic.be.
// GitHub Pages kan geen Accept-header lezen en geen Vary-header zetten; deze Worker
// draait ervoor (route sbmusic.be/*) en haalt de .md-versie op uit dezelfde site.

export const MARKDOWN_PAGES = {
  '/': '/index.md',
  '/index.html': '/index.md',
  '/about': '/about.md',
  '/about.html': '/about.md',
  '/contact': '/contact.md',
  '/contact.html': '/contact.md',
};
const NOT_FOUND_MD = '/404.md';

// Geeft true als de client Markdown boven (of gelijk aan) HTML verkiest.
export function prefersMarkdown(accept) {
  if (!accept) return false;
  const q = { md: 0, html: 0, any: 0 };
  for (const part of accept.split(',')) {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    const qp = params.map(p => p.trim()).find(p => p.startsWith('q='));
    const v = qp ? parseFloat(qp.slice(2)) : 1;
    const w = Number.isNaN(v) ? 1 : v;
    if (type === 'text/markdown') q.md = Math.max(q.md, w);
    else if (type === 'text/html' || type === 'application/xhtml+xml') q.html = Math.max(q.html, w);
    else if (type === '*/*' || type === 'text/*') q.any = Math.max(q.any, w);
  }
  return q.md > 0 && q.md >= q.html;
}

function withVary(res) {
  const h = new Headers(res.headers);
  const vary = (h.get('Vary') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!vary.some(v => v.toLowerCase() === 'accept' || v === '*')) vary.push('Accept');
  h.set('Vary', vary.join(', '));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

function markdownResponse(body, status) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Vary': 'Accept',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function fetchMarkdown(request, path) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = '';
  const res = await fetch(new Request(url, { method: 'GET', headers: { Accept: 'text/markdown' } }));
  return res.ok ? res.text() : null;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const wantsMd = (request.method === 'GET' || request.method === 'HEAD') && prefersMarkdown(request.headers.get('Accept'));
    if (!wantsMd) return withVary(await fetch(request));

    const mdPath = MARKDOWN_PAGES[url.pathname];
    if (mdPath) {
      const body = await fetchMarkdown(request, mdPath);
      if (body) return markdownResponse(request.method === 'HEAD' ? null : body, 200);
      return withVary(await fetch(request));
    }

    const origin = await fetch(request);
    if (origin.status === 404) {
      const body = await fetchMarkdown(request, NOT_FOUND_MD);
      if (body) return markdownResponse(request.method === 'HEAD' ? null : body, 404);
    }
    return withVary(origin);
  },
};

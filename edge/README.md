# Markdown-negotiatie (Cloudflare Worker)

GitHub Pages kan geen `Accept`-header lezen en geen `Vary: Accept` zetten. Deze Worker doet dat ervoor:

- `Accept: text/markdown` op `/`, `/about`, `/contact` geeft de `.md`-versie (`Content-Type: text/markdown`, `Vary: Accept`).
- Een onbestaand pad met `Accept: text/markdown` geeft HTTP 404 met `404.md` als body.
- Alle andere requests blijven HTML, met `Vary: Accept` erbij.

Activeren: zet sbmusic.be achter Cloudflare (DNS-proxy aan), dan `npx wrangler deploy` in deze map.
Tests: `npm test`.

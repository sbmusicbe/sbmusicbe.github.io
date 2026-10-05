# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, both evidenced by the current site's structure and copy:
1. **Event organizers/hosts** who need to book a DJ — club promoters, festival bookers, wedding couples/planners, private-party hosts. Evidenced by the booking form's "Type event" field (Club / Festival / Bruiloft / Privéfeest) and the dedicated contact/booking flow on every page.
2. **Fans and partygoers** who already saw SB play and want to follow or relive it — evidenced by the "Volg SB" social CTAs (Instagram, TikTok, Facebook) and the bio page's photo gallery ("Op de vloer").

## Product Purpose

A single-DJ promotional and booking site. It exists to (a) convert an event host's intent into a booking inquiry with minimal friction, and (b) establish credibility/identity so a stranger trusts SB enough to book or follow. Success = a submitted booking form or a social follow.

## Positioning

SB is an **allround** DJ: no fixed playlist, reads the room live and switches genres (house, hip-hop, R&B, meezingers) to keep the floor full all night. This "reads the room, not a set playlist" claim is the explicit differentiator already in the copy ("Ik voel de zaal aan en draai wat het feest nodig heeft") — a genre-specialist DJ's site could not truthfully copy this.

## Operating Context

- Deployed as a static GitHub Pages site at sbmusic.be (CNAME confirmed in repo root) under account `sbmusicbe/sbmusicbe.github.io`, which also hosts unrelated small apps in sibling folders (`taken/`, `requests/`) — not part of this product.
- No backend, no CMS, no build step. Each page is one self-contained HTML file with inline `<style>`/`<script>`.
- Booking submissions go through FormSubmit.co directly to the owner's inbox (hey@sbmusic.be) — no server of their own.
- The owner (the user in this conversation) edits the site directly through this assistant session by session; there is no other maintainer or design team.

## Capabilities and Constraints

- Must stay deployable as plain static HTML/CSS/JS on GitHub Pages — no framework, no build tooling, no server-side code.
- 6 pages today: `index.html` (home), `bio.html`, `contact.html` (booking form), `privacy.html`, `terms.html`, `404.html`. A redesign must keep this page set and each page's core job; it may restructure sections within a page.
- Booking form fields and submission mechanism (FormSubmit.co, consent checkbox linking privacy/terms) are functional requirements to preserve, not visual choices — the GDPR consent language in privacy.html explicitly names the mechanism.
- Must stay keyboard-accessible and WCAG AA compliant (contrast, heading order) — enforced this session via the impeccable detector; a redesign must not regress this.
- Mobile-first real-world usage expected (event hosts and fans browsing on phones); must hold up at 320px–1920px with no overflow.

## Brand Commitments

- Name: **SB** — full tagline "SB — Allround DJ".
- Existing wordmark/logo (angular "SB" monogram, currently a raster mask asset at `images/logo-mask.png`) — a confirmed, reusable asset, not to be redrawn from scratch without reason.
- Social handles: Instagram/TikTok/Facebook all `@sbmusicbe`.
- Contact: hey@sbmusic.be.
- Resident DJ at **Café De Zwarte Ruiter**, Turnhout, België — stated as an ongoing, current fact ("vaste resident bij"), distinct from past one-off gigs.
- Past/guest venues to credit by name: Sunrise Festival, Klimax, Futur, BarBoesj, Club Madelon, Café De Planeet, De Loods.
- Voice: direct, warm, confident without being salesy; Dutch (Belgian) copy throughout, informal "je/jij".

## Evidence on Hand

- Real photography already in `images/`: a hero portrait and 6 action/gallery shots (DJ booth, club interiors, festival stage), already licensed/owned by the user — reuse these; do not fabricate stock imagery or AI-generated people.
- Real venue list and bio copy already written and approved across prior rounds (see above).
- No logged metrics, press, or testimonials exist — do not invent any.

## Product Principles

1. **Booking friction is the enemy.** Every design decision is weighed against: does this make it faster/clearer for a host to book, or just decoration?
2. **Real photos of SB, not generic DJ imagery.** The identity is a specific person and specific residency, not a stock "nightlife" mood board.
3. **One maintainer, no build step.** Any design system must stay simple enough to hand-edit as plain HTML/CSS across 6 files without tooling.
4. **Static-first motion.** Any animation/interaction must degrade gracefully (prefers-reduced-motion respected) and never block the booking form from working.

## Accessibility & Inclusion

WCAG AA contrast and correct heading hierarchy are required (already fixed and verified this session); keep them as a hard floor through the redesign.

---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["bio.html","contact.html","privacy.html","terms.html","404.html"]
---

## Scope & mode

Sitewide visual world replacement (all 6 pages: index, bio, contact, privacy, terms, 404). Mode: Persuade (booking conversion is the product).

## Audience, job, action, proof, constraints

Event hosts deciding whether to book SB; fans following him. Job: believe "reads the room, no fixed playlist" and act (book or follow). Proof: real photos, real venue list, real residency. Constraint: static HTML/CSS/JS, no build step, must stay hand-editable, WCAG AA floor, booking form (FormSubmit.co) unchanged functionally.

## Direction contract

THESIS: SB's "no fixed playlist, reads the room" identity, presented as a record label's own catalog — not a nightclub flyer, not a SaaS landing page. Refuses the default "dark hero + neon accent + glass card" AI-generated-nightlife look.

OWN-WORLD: Near-black ground (#0A0A0A) and warm off-white (#F5F3EE), ONE committed spot color — vinyl-sticker orange-red (#FF4D1C) — carrying catalog numbers, rules, CTAs, hover states. Archivo Black for display (kept, already a fit for bold sleeve typography). Schibsted Grotesk for body/UI (replaces Hanken Grotesk). Martian Mono for catalog numbers, timestamps, runout-etching details. Square corners or near-0 radius (not the current r-lg:24px rounded-app look). Thin 1px rules, no shadows on static cards (continues this session's border-not-shadow decision, now a full principle). Every section gets a catalog-number prefix (SB-001, SB-002...). Lists render as tracklists (A1/A2/B1 index + accent-orange number). A recurring "spine" motif: tracking-heavy caps + thin rule, like a sleeve spine.

STORY: Visitor lands on what reads as a record sleeve for "SB — Allround DJ", understands within the first viewport this is a working DJ with a real residency and real catalog of genres/venues, and converts via a CTA styled like a sticker/stamp on the sleeve.

FIRST VIEWPOINT (index.html): Square-cropped hero portrait as the "sleeve", accent-orange corner sticker reading "SB-001", Archivo Black headline set tight like a sleeve title, genre/service list below set as a tracklist, CTA as a stamped sticker button.

FORM: Catalogue No. — record-label minimalism. Chosen directly by the user from 3 presented directions (Catalogue No. / De Zwarte Ruiter knight-heraldry / Sunrise Set gradient). No concept-seed script run — no image generation available in this harness; directions were authored and presented via AskUserQuestion instead, disclosed to the user.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions

None blocking; color/type/component system fully specified above. Code-led build (no image generation available).

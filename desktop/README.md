# Klose voor Windows

Een omhulsel (Electron) rond de website: opent `https://sbmusic.be/taken/` in een eigen venster, zonder adresbalk.
Updates van de app komen vanzelf mee, want het programma laadt de site. Een ander adres (bv. eigen server): zet `KLOSE_URL`.

## .exe bouwen
GitHub → Actions → **Klose voor Windows** → *Run workflow*. Na ±5 minuten staat onder *Artifacts* `Klose-Windows`
met een installer (`Klose-1.0.0-nsis.exe`) en een draagbare versie (`Klose-1.0.0-portable.exe`).
Een tag `desktop-v1.0.0` maakt er ook een Release van.

## Lokaal proberen
`cd desktop && npm install && npm start`

Let op: zonder code-ondertekening toont Windows SmartScreen een waarschuwing ("Meer info" → "Toch uitvoeren").

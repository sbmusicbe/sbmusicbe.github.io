# Verzoekjes (sbmusic.be/requests)

Een app waarmee gasten nummers aanvragen, zoals requestbox.app.

- **Gasten** scannen de QR-code van een event, zoeken een nummer en sturen het in. Ze hoeven niet in te loggen.
- **Jij** logt in op `sbmusic.be/requests/beheer.html` en ziet daar per event een eigen tabblad met de wachtrij.

| Pagina | Voor wie |
| --- | --- |
| `sbmusic.be/requests/?e=<event-code>` | Gasten (elk event heeft een eigen link en QR-code) |
| `sbmusic.be/requests/beheer.html` | Jij (inloggen vereist) |
| `sbmusic.be/requests/poster.html?e=<event-code>` | Afdrukbare A4-poster met QR-code |

De site draait op GitHub Pages. Pages kan zelf geen gegevens opslaan, dus de verzoekjes gaan naar
**Firebase** (Google). Het gratis Spark-plan is ruim genoeg. De stappen hieronder doe je maar één keer (± 10 minuten).

## 1. Firebase-project aanmaken

1. Ga naar <https://console.firebase.google.com> en klik **Project toevoegen**. Kies bv. de naam `sbmusic-requests`.
   Google Analytics mag je uitzetten.
2. Menu **Build → Firestore Database → Database maken**.
   - Locatie: `eur3 (europe-west)`.
   - Start in **productiemodus**.
3. Menu **Build → Authentication → Aan de slag**.
   - Tab *Sign-in method*: zet **E-mail/wachtwoord** aan.
   - Tab *Users*: **Gebruiker toevoegen** met je eigen e-mail en een sterk wachtwoord.
   - Tab *Settings → User actions*: vink **Enable create (sign-up)** uit, zodat niemand anders een account kan maken.
   - Tab *Settings → Authorized domains*: voeg `sbmusic.be` toe.

## 2. Web-app koppelen

1. Klik op het tandwiel → **Projectinstellingen**. Scrol naar *Je apps* en klik op het **`</>`-icoon (Web)**.
   Kies een naam, maar zet Hosting **niet** aan.
2. Je krijgt een blok `const firebaseConfig = { apiKey: ..., ... }`. Neem die waarden over in
   [`config.js`](config.js) en commit het bestand.
   (Deze sleutels zijn niet geheim en mogen publiek op GitHub staan. De beveiliging zit in de regels van stap 3.)

## 3. Beveiligingsregels

1. Open `sbmusic.be/requests/beheer.html` en log in. Je krijgt de melding "Bijna klaar" met je **UID**. Kopieer die.
2. Open [`firestore.rules`](firestore.rules), vervang `JOUW_UID_HIER` door je UID en commit het bestand.
3. Kopieer de volledige inhoud naar Firebase console → **Firestore Database → Regels** en klik **Publiceren**.
4. Klik op de beheerpagina op **Opnieuw proberen**. Klaar!

De regels bepalen:
- Gasten kunnen alleen een verzoekje *toevoegen*, en alleen aan een event dat **open** staat.
  Titels, namen en boodschappen hebben een maximale lengte.
- Gasten kunnen de lijst met verzoekjes of events niet opvragen. Ze zien alleen de status van hun eigen aanvragen.
- Alleen jouw account (je UID) kan events en verzoekjes lezen, aanpassen en verwijderen.

## Gebruik

- **Nieuw event**: maak een tabblad aan met een naam en een code (bv. `trouw-jan-lies`).
  De link wordt `sbmusic.be/requests/?e=trouw-jan-lies`. Die code verandert nooit, dus een afgedrukte QR-code blijft werken.
- **QR & link**: toont de QR-code, een link naar een QR in hoge resolutie en een afdrukbare poster.
- **Open/Gesloten**: schakel per event in of gasten iets kunnen aanvragen.
- **Wachtrij**: hetzelfde nummer wordt gegroepeerd, met een teller (×3) en de namen en boodschappen.
  Sorteer op *meest gevraagd*, *oudste* of *nieuwste*.
  - ▶ **Nu**: markeert het nummer als gespeeld en toont het bij gasten als "Nu te horen".
  - ✓ gespeeld, ✕ afwijzen. Onder *Gespeeld* en *Afgewezen* kan je een nummer terugzetten of verwijderen.
- Een **nieuw verzoekje** geeft een melding en een geluidje (uit te zetten met het luidsprekertje).
  Het aantal openstaande verzoekjes staat op elk tabblad.
- Onder **⋯** vind je: CSV exporteren, gespeelde en afgewezen verzoekjes wissen, archiveren en verwijderen.
  Gearchiveerde events vind je terug via het archief-icoon bovenaan.

Nummers worden gezocht via de gratis iTunes/Apple Music-zoekfunctie. Staat een nummer er niet tussen,
dan kunnen gasten zelf een titel en artiest intypen.

Tegen spam zit er een wachttijd van 20 seconden tussen aanvragen van dezelfde gast, en een maximum van 5 openstaande
verzoekjes per gast. Wil je meer bescherming, dan kan je in Firebase **App Check** (reCAPTCHA) inschakelen.

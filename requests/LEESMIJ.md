# Verzoekjes (sbmusic.be/requests)

Een app waarmee gasten nummers aanvragen, zoals requestbox.app. Ze draait volledig op GitHub.

- **Gasten** scannen de QR-code van een event, zoeken een nummer en sturen het in. Ze hoeven niet in te loggen.
- **Jij** logt met een wachtwoord in op `sbmusic.be/requests/beheer.html`. Daar heeft elk event een eigen tabblad met de wachtrij.

| Pagina | Voor wie |
| --- | --- |
| `sbmusic.be/requests/?e=<event-code>` | Gasten (elk event heeft een eigen link en QR-code) |
| `sbmusic.be/requests/beheer.html` | Jij (wachtwoord) |
| `sbmusic.be/requests/poster.html?e=<event-code>` | Afdrukbare A4-poster met QR-code |

## Hoe werkt het?

GitHub Pages toont enkel bestanden en kan zelf niets opslaan. Daarom komt elk verzoekje als **issue** in een aparte
**privé-repo**. Elk event is ook een issue, met het label `event`.

| In de app | In de repo |
| --- | --- |
| In de wachtrij | open issue |
| Gespeeld | gesloten als *completed* |
| Afgewezen | gesloten als *not planned* |

De pagina gebruikt een fine-grained token dat enkel **Issues** mag lezen en schrijven, en enkel in die ene privé-repo.

> ⚠️ **Goed om te weten.** Het token staat (enkel gecodeerd) in de pagina, want gasten hebben het nodig om een verzoekje in
> te sturen. Iemand die de code uitplozen kan het terugvinden. Daarmee kan die persoon enkel issues in de privé-repo
> lezen of aanpassen: spam, of de namen en boodschappen van gasten bekijken. Je andere repo's, je site en je account
> kan die persoon niet aanraken.
>
> Bij misbruik trek je het token in en maak je een nieuw aan. Het beheerwachtwoord beschermt het beheerscherm, maar
> niet de repo zelf.

## Eenmalig instellen (± 5 minuten)

1. **Privé-repo aanmaken**: <https://github.com/new>. Kies bv. de naam `requests-data`, zet ze op **Private** en
   vink *Add a README* aan.
2. **Token aanmaken**: <https://github.com/settings/personal-access-tokens/new>
   - *Token name*: `verzoekjes`. *Expiration*: kies een ruime datum, bv. 1 jaar. Zet een herinnering om het te vernieuwen.
   - *Repository access*: **Only select repositories** → `requests-data`
   - *Permissions → Repository permissions → Issues*: **Read and write**. Laat al de rest op *No access*.
   - Klik **Generate token** en kopieer het (`github_pat_…`).
3. Open **`sbmusic.be/requests/beheer.html`**. Omdat er nog niets is ingesteld, zie je het instelscherm.
   Vul in:
   - de repo, bv. `sbmusicbe/requests-data`
   - het token
   - een beheerwachtwoord naar keuze

   Klik op **Testen & config maken**.
4. Je krijgt de nieuwe inhoud voor `requests/config.js`. Klik **Open config.js op GitHub**, plak de tekst, en klik
   **Commit changes**. Na ± 1 minuut staat het online en kan je inloggen.

Later een nieuw token of wachtwoord? Open `beheer.html?setup` en herhaal stap 3 en 4.

## Gebruik

- **Nieuw event**: maak een tabblad aan met een naam en een code (bv. `trouw-jan-lies`).
  De link wordt `sbmusic.be/requests/?e=trouw-jan-lies`. Die code verandert nooit, dus een afgedrukte QR-code blijft werken.
- **Foto**: geef elk event een eigen foto (bv. van het koppel of de zaal) via *Nieuw event* of het tandwiel.
  Gasten zien ze bovenaan de pagina, en ze staat ook op de poster.
  De foto wordt in je browser automatisch verkleind (± 150 KB) en als reactie bij het event-issue bewaard.
  Een Issues-token kan namelijk geen bestanden uploaden.
- **QR & link**: toont de QR-code, een QR in hoge resolutie en een afdrukbare poster.
- **Poster**: A4 in de huisstijl van sbmusic.be, met het SB-logo, de foto van het event en de QR-code.
  De titel kan je bovenaan aanpassen. Kies een zwarte achtergrond (zoals de site) of een witte (spaart inkt).
  Via *Afdrukken / PDF* kan je ze ook als PDF bewaren. Zet in het afdrukvenster *Achtergrondafbeeldingen* aan
  (Chrome: *Meer instellingen → Achtergrondafbeeldingen*), anders valt het zwart en de foto weg.
- **Open/Gesloten**: schakel per event in of gasten iets kunnen aanvragen. Een groen bolletje op het tabblad betekent open.
- **Wachtrij**: hetzelfde nummer wordt gegroepeerd, met een teller (×3) en de namen en boodschappen.
  Sorteer op *meest gevraagd*, *oudste* of *nieuwste*.
  - ▶ **Nu**: markeert het nummer als gespeeld en toont het bij gasten als "Nu te horen".
  - ✓ gespeeld, ✕ afwijzen. Onder *Gespeeld* en *Afgewezen* kan je een nummer terugzetten.
- **Nieuwe verzoekjes** verschijnen vanzelf (binnen ± 12 seconden), met een melding en een geluidje.
  Het geluid zet je aan of uit met het luidsprekertje. Op elk tabblad staat het aantal openstaande verzoekjes.
- **Liedje verwijderen**: met het vuilbakje haal je een nummer (en alle aanvragen ervan) uit de lijst.
- **Event verwijderen**: archiveer het event eerst. Kies daarna *Event verwijderen* onder ⋯, of het vuilbakje in het archief.
  De link en de QR-code werken dan niet meer, en de code is vrij voor een nieuw event.
  Oude verzoekjes komen niet bij het nieuwe event terecht.
- Echt wissen kan het token niet, want daarvoor zijn beheerrechten op de repo nodig. Verwijderde items worden daarom
  gesloten en krijgen het label `verwijderd`. Wil je ze helemaal weg, verwijder de issues dan zelf op GitHub
  (issue openen → *Delete issue* onderaan).
- Onder **⋯** vind je: CSV exporteren, de issues op GitHub bekijken, en archiveren.
  Gearchiveerde events vind je terug via het archief-icoon bovenaan.

Nummers worden gezocht via de gratis iTunes/Apple Music-zoekfunctie. Staat een nummer er niet tussen,
dan kunnen gasten zelf een titel en artiest intypen.

## Limieten

- GitHub laat **5000 API-aanvragen per uur** toe per token. De pagina's vragen enkel wijzigingen op
  ("is er iets veranderd?"). Een antwoord "niets veranderd" telt niet mee. En er wordt niets opgevraagd
  zolang de pagina op de achtergrond staat. Voor een feest met honderden gasten is dat ruim voldoende.
- GitHub staat ± **500 nieuwe issues per uur** toe.
- Per gast geldt een wachttijd van 20 seconden tussen aanvragen, en een maximum van 5 openstaande verzoekjes.

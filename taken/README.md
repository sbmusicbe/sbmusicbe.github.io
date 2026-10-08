# HardSales CRM

**Open source CRM voor wie hard moet verkopen.** Taken, klanten, verkopen en agenda in één snelle app die volledig in je browser draait. Geen server, geen abonnement, geen account: je gegevens blijven versleuteld op je eigen toestel, met optionele synchronisatie tussen al je toestellen.

> In de app heet het scherm nog **Taken**. De code staat in deze map (`taken/`) en draait op elke statische hosting, bijvoorbeeld GitHub Pages.

## Wat kan het?

| Onderdeel | Wat je ermee doet |
|---|---|
| **Taken** | Projecten met een bord (kolommen) of een lijst. Deadline en uur, eigen velden, opmerkingen, archief. Een taak zonder deadline staat altijd bovenaan. |
| **Klanten** | Een klantenfiche per klant (firma, klantnummer, contact, telefoon, gsm, e-mail, gemeente, uitgaves, projectnummers). Import uit Excel (`.xlsx`), CSV of plakken uit Excel, ook met tienduizenden rijen. Taken koppel je aan een klant; maak je vanuit een taak een nieuwe klant, dan worden de gegevens uit de taak al ingevuld. |
| **Verkopen** | Een pagina per maand met een tabel van verkopen (kolommen zelf in te stellen), doelstelling, bedrag per dag dat nog nodig is, commissie en bonus. Een nieuwe regel krijgt standaard aantal 1. |
| **Prijsberekening** | Bovenaan een project: vul het bedrag in dat nog verkocht moet worden (*To go*) en het aantal 1/8-ruimtes (*PK*), en de app rekent de prijs per formaat uit: 1/1, 1/2, 1/4, 1/8, 1/12, 1/16 en 1/32 (naar boven afgerond). |
| **BTW-calculator** | Reken een bedrag om van of naar inclusief btw (6, 9, 12 of 21%). |
| **Agenda** | Datums zoals drukdata en deadlines per uitgave, met herhaling. |

Daarnaast:

- **Snel invoeren.** Typ bijvoorbeeld `Offerte sturen morgen 14u #Werk` en de app herkent de datum, het uur en het project. Herkend worden `vandaag`, `morgen`, weekdagen, `12/10`, `14u`, `#project` en `@` gevolgd door een waarde van een eigen veld.
- **Licht en donker.** De knop onderaan de zijbalk wisselt tussen beide; zonder keuze volgt de app je toestel.
- **Projecten rangschikken.** Sleep een project in de zijbalk (op aanraakschermen: even ingedrukt houden), gebruik Alt+↑/↓ of het menu van het project.
- **Werkt offline** en is te installeren als app (PWA).
- **Sneltoetsen.** `N` of `Q` nieuwe kaart, `/` zoeken, `Ctrl/⌘ ,` instellingen, `?` toont de volledige lijst.
- **Ontgrendelen met Face ID of Touch ID** op toestellen die dat ondersteunen (WebAuthn PRF, bijvoorbeeld iOS 18).

## Hoe werkt het?

### Alles in je browser

De hele app is één bestand (`index.html`) in gewone HTML, CSS en JavaScript, zonder framework en zonder build-stap. Hosting is dus niets meer dan het uploaden van de map. De gegevens zijn één document met taken, projecten, velden, klanten, verkopen en agenda.

### Versleuteld opgeslagen

- Je kiest bij de eerste keer een wachtwoord. Daaruit wordt met **PBKDF2** (310.000 rondes) een sleutel afgeleid. Alles wordt met **AES-GCM** versleuteld, zodat zonder wachtwoord niemand het kan lezen, ook jij niet.
- Lokaal staat een kleine kern (taken, projecten, verkopen) in `localStorage` en de grote klantenlijst apart in IndexedDB. Het versleutelen en ontsleutelen gebeurt in een achtergrondproces (Web Worker), zodat de pagina soepel blijft, ook met zeventigduizend klanten.
- Na een tijd zonder activiteit (standaard 30 minuten) vergrendelt de app zichzelf.

### Synchroniseren tussen toestellen (optioneel)

Zonder synchronisatie werk je op één toestel. Wil je op meerdere toestellen dezelfde gegevens, dan bewaart de app een **versleutelde kopie in een geheime GitHub Gist**:

1. Maak op [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=gist&description=Taken) een token met alleen het recht `gist`.
2. Open in de app **Instellingen → Synchroniseren** en plak het token. De app maakt de gist aan.
3. Volg stap 2 in dezelfde instellingen: je krijgt een klein sleutelbestand (`config.json`) om in je eigen hosting te zetten. Daarin staan token en gist versleuteld met je wachtwoord. Daarna volstaat het op elk ander toestel om de pagina te openen en in te loggen.

De gist bevat alleen versleutelde tekst. Bij het samenvoegen wint per item de nieuwste wijziging; verwijderde items worden bijgehouden, zodat ze niet terugkomen. Een back-up download je altijd via **Instellingen** (versleuteld of leesbaar).

## Zelf gebruiken (installeren)

1. Kopieer de map `taken/` naar je statische hosting (bijvoorbeeld de root van een GitHub Pages-repo).
2. Open de pagina, kies een wachtwoord en begin.
3. Wil je synchroniseren, volg dan de stappen hierboven.

Lokaal uitproberen kan met elke simpele webserver:

```sh
python3 -m http.server 8000
# open http://localhost:8000/taken/
```

Een service worker (`sw.js`) zorgt dat de app offline werkt. Verander je iets aan de code, verhoog dan het versienummer van de cache in `sw.js`, zodat bestaande gebruikers de nieuwe versie krijgen.

## Bestanden

| Bestand | Wat |
|---|---|
| `index.html` | De volledige app: opmaak, logica en gegevensmodel |
| `sw.js` | Offline-werking en updates |
| `manifest.webmanifest`, `icon*.png`, `favicon*.png` | Installeerbare app en pictogrammen |
| `config.json` | Versleuteld sleutelbestand voor de synchronisatie (jouw eigen token en gist, enkel leesbaar met je wachtwoord) |

## Beperkingen

- **Eén gebruiker per kluis.** Er zijn geen aparte accounts: één wachtwoord opent één gegevensset. Meerdere gebruikers met aparte accounts vraagt een centrale opslag en staat op de planning.
- Synchronisatie loopt via een GitHub-token; wie dat token heeft, kan de versleutelde gist overschrijven of verwijderen (lezen kan niet zonder wachtwoord).
- Een vergeten wachtwoord kan niet hersteld worden. Bewaar een versleutelde back-up.

## Bijdragen

Bijdragen zijn welkom: meld een probleem of stuur een pull request. De app is bewust klein en zonder afhankelijkheden gehouden; probeer dat zo te laten.

## Licentie

Nog niet vastgelegd. Voeg een `LICENSE`-bestand toe (bijvoorbeeld MIT) voordat je het project officieel als open source deelt.

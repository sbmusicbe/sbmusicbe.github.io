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

## Meerdere gebruikers (accounts)

Zet je de optionele accountdienst aan, dan logt iedereen in met een **eigen e-mailadres en wachtwoord** en ziet alleen zijn eigen gegevens. Je hoeft geen GitHub-token, gist of sleutelbestand meer te regelen: een nieuw toestel is gewoon inloggen. De dienst (Supabase, gratis plan) bewaart per account één **versleutelde** kluis; uit je wachtwoord worden een login-geheim (naar de dienst) en de sleutel van de kluis (blijft op je toestel) afgeleid, dus de dienst kan je gegevens niet lezen.

**Aanzetten (eenmalig, door de beheerder):**

1. Maak op [supabase.com](https://supabase.com) een gratis project (regio Frankfurt).
2. Voer in de **SQL Editor** het script [`supabase.sql`](supabase.sql) uit. Het maakt de tabel `vaults` met regels zodat iedereen alleen zijn eigen rij ziet, en is herhaalbaar: heb je een eerdere versie al uitgevoerd, voer het dan gerust opnieuw uit (het voegt de kolommen voor grote kluizen toe).
3. Zet onder **Authentication** de bevestigingsmail uit (of stel een eigen mailserver in) en bepaal of iedereen zich mag aanmelden of alleen via uitnodiging. Voor **Wachtwoord vergeten** verstuurt de dienst een mail: zet onder **Authentication → URL Configuration** de *Site URL* op het adres van je app (bv. `https://sbmusic.be/taken/`) en voeg dat adres toe aan de *Redirect URLs*. De ingebouwde mailserver van het gratis plan verstuurt maar weinig mails per uur; een eigen SMTP-server (Authentication → SMTP) is stabieler.
4. Zet de **Project URL** en de **publishable (anon) key** in `taken/cloud.json`:
   ```json
   { "url": "https://JOUWPROJECT.supabase.co", "key": "sb_publishable_…" }
   ```
   Die sleutel is bedoeld om publiek te zijn; de beveiliging zit in de regels uit stap 2. Gebruik nooit de *service role key*.
5. Publiceer de wijziging. Wie de pagina opent, krijgt nu een inlogscherm met **Inloggen** en **Account aanmaken**.

**Bestaande gegevens meenemen.** Maak je een account aan op een toestel waar al een kluis staat, dan gaan die gegevens mee naar het account (met hetzelfde wachtwoord; met een ander wachtwoord vraagt de app naar het oude). Een gist of back-up blijft ongemoeid.

**Herstelsleutel.** Bij het aanmaken van je account toont de app een **herstelsleutel** (32 tekens). Bewaar die op een veilige plek: zonder wachtwoord én zonder herstelsleutel zijn je gegevens echt weg, want niemand anders kan ze lezen. De kluis is versleuteld met een willekeurige datasleutel die twee keer is ingepakt: met je wachtwoord en met de herstelsleutel. Gevolgen:

- **Wachtwoord wijzigen** (Instellingen → Beveiliging) is snel, ook met tienduizenden klanten: enkel de datasleutel wordt opnieuw ingepakt.
- **Wachtwoord vergeten?** Kies op het inlogscherm *Wachtwoord vergeten?*, vul je e-mailadres in en open de link in de mail. Vul daarna je herstelsleutel in en kies een nieuw wachtwoord; al je gegevens blijven behouden. Heb je de sleutel niet meer, dan kun je alleen met een lege kluis opnieuw beginnen.
- **Nieuwe herstelsleutel** maken kan in de instellingen (de oude werkt dan niet meer).
- **Account verwijderen** (Instellingen → Account) wist je account en je online kluis definitief. Dit werkt na het (opnieuw) uitvoeren van `supabase.sql`, dat de functie `delete_my_account` toevoegt.
- Accounts van de eerste versie krijgen bij de eerstvolgende login automatisch een herstelsleutel.

**Zeer grote kluizen.** Staat het script `supabase.sql` in je project, dan bewaart de dienst de klanten apart van de rest. Een gewone wijziging (een taak afvinken) uploadt dan enkel de kleine kern; de klantenlijst gaat alleen mee als die veranderd is. Zonder dat script blijft alles gewoon in één stuk werken.

**Let op:** bewaar ook af en toe een versleutelde back-up (**Instellingen → Back-up**). Een gratis Supabase-project kan na een periode zonder gebruik gepauzeerd worden; de repository bevat een geplande wekelijkse ping die dat voorkomt.

Verwijder je `taken/cloud.json`, dan werkt de app weer volledig lokaal, optioneel met een gist.

## Installeren: stap voor stap

Je hebt alleen een gratis [GitHub-account](https://github.com/signup) nodig. Geen server, geen programmeerkennis. Reken op ongeveer tien minuten.

### 1. Een eigen kopie maken

1. Log in op GitHub en open deze repository.
2. Klik rechtsboven op **Fork** (of **Use this template** als dat er staat) en bevestig. Je hebt nu je eigen kopie onder je eigen account.
3. Heb je liever een nieuwe, lege repository? Maak er een met **New repository**, kies **Public** en upload de map `taken/` (zie stap 2).

> **Belangrijk:** verwijder de bestanden `taken/config.json` en `taken/cloud.json` uit je kopie.
> - `config.json` bevat het versleutelde sleutelbestand van de oorspronkelijke eigenaar; zolang het er staat, vraagt de app naar zijn wachtwoord en kun je zelf geen account aanmaken.
> - `cloud.json` wijst naar het accountproject van de oorspronkelijke eigenaar. Laat je het staan, dan maken jouw gebruikers een account in zijn project. Wil je zelf accounts, maak dan je eigen project en zet je eigen gegevens erin (zie [Meerdere gebruikers](#meerdere-gebruikers-accounts)).
>
> Open elk bestand op GitHub, klik op de prullenbak en bevestig met **Commit changes**.

### 2. (Alleen bij een nieuwe, lege repository) De bestanden uploaden

1. Klik in je repository op **Add file → Upload files**.
2. Sleep de hele map `taken/` erin (alles behalve `config.json`) en klik op **Commit changes**.

### 3. De site aanzetten met GitHub Pages

1. Ga in je repository naar **Settings → Pages**.
2. Kies bij **Source** de optie **Deploy from a branch**, kies de branch **main** en de map **/ (root)** en klik op **Save**.
3. Wacht één à twee minuten. Bovenaan de pagina verschijnt het adres van je site.

Je app staat nu op:

- `https://JOUWNAAM.github.io/taken/` als je repository `JOUWNAAM.github.io` heet, of
- `https://JOUWNAAM.github.io/REPOSITORY/taken/` bij een andere naam.

### 4. De eerste keer openen

1. Open het adres. Je ziet het welkomstscherm.
2. Kies een **sterk wachtwoord** (minstens 8 tekens) en bevestig het, en klik op **Aan de slag**. Dit wachtwoord versleutelt al je gegevens. **Het is niet te herstellen**; schrijf het ergens veilig op.
3. Klaar: je kunt meteen taken, klanten en verkopen toevoegen. Op dit moment staan je gegevens alleen op dit toestel.

### 5. Op meerdere toestellen werken (synchronisatie)

1. Maak op GitHub een token: [github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=gist&description=Taken). Vink **alleen `gist`** aan, kies een lange vervaldatum (of *No expiration*) en klik op **Generate token**. Kopieer het token (het staat maar één keer in beeld).
2. Open in de app het tandwiel (**Instellingen**) en ga naar **Synchroniseren tussen al je browsers**.
3. Plak het token en klik op **Koppelen**. De app maakt een geheime gist aan voor je versleutelde gegevens (**Stap 1 ✓**).
4. Klik bij **Stap 2** op **Publiceren op GitHub**. GitHub opent met het sleutelbestand al ingevuld; klik op de groene knop **Commit changes**. Na één à twee minuten staat het online; klik in de app op **Controleren**.
5. Op een tweede toestel open je hetzelfde adres en log je in met je wachtwoord. De gegevens worden automatisch opgehaald.

> Het sleutelbestand bevat je token en gist, versleuteld met je wachtwoord. Het is veilig om publiek te staan, maar wie je site opent kan daarna geen nieuw account meer aanmaken: de app vraagt dan om het wachtwoord.
>
> Op een eigen domein (bijvoorbeeld `crm.jouwbedrijf.be`) kan de app je repository niet zelf herkennen. Pas dan bovenaan het script in `index.html` de waarden `REPO` en `CONFIG_PATH` aan (de regels met `const REPO = …`).

### 6. Als app op je toestel zetten

- **iPhone of iPad (Safari):** tik op *Deel* → **Zet op beginscherm**.
- **Android (Chrome):** menu ⋮ → **App installeren** of **Toevoegen aan startscherm**.
- **Computer (Chrome of Edge):** klik in de adresbalk op het installeer-icoon.

Ontgrendelen met **Face ID of Touch ID** zet je aan in **Instellingen → Beveiliging**.

### 7. Gegevens importeren

- **Klanten:** open **Klanten → ⋯ → Importeren** en kies je Excel-bestand (`.xlsx`) of CSV, of plak de kolommen uit Excel. Herkende kolommen: klantnummer, firma, contact, plaats, telefoon, gsm, e-mail, uitgave en projectnummer.
- **Verkopen:** maak onder **Verkopen** een maandpagina en plak je notities of voeg regels toe.
- **Back-up terug zetten:** **Instellingen → Back-up → Importeren**.

### 8. Bijwerken naar een nieuwe versie

Haal in je fork de nieuwste wijzigingen binnen (**Sync fork → Update branch**). De app laat bij de volgende keer openen een melding zien dat er een nieuwe versie klaar staat. Je gegevens blijven ongemoeid. Maak je zelf wijzigingen in de code, verhoog dan het versienummer van de cache in `sw.js` (`taken-app-vNN`).

### Problemen oplossen

| Probleem | Oplossing |
|---|---|
| De app vraagt een wachtwoord dat ik niet ken, of een e-mailadres en wachtwoord | `taken/config.json` of `taken/cloud.json` van de oorspronkelijke eigenaar staat nog in je kopie. Verwijder die bestanden (stap 1). |
| De pagina geeft een 404 | Controleer bij **Settings → Pages** of de site aan staat en of je het juiste adres (met `/taken/`) gebruikt. Wacht een paar minuten na de eerste keer aanzetten. |
| "Publiceren op GitHub" opent de verkeerde repository | Je gebruikt een eigen domein. Pas `REPO` en `CONFIG_PATH` aan (zie hierboven). |
| Een tweede toestel toont niet dezelfde gegevens | Open **Instellingen** en bekijk of beide stappen een vinkje hebben. Klik op **Controleren** en wacht even op GitHub Pages. |
| Wachtwoord gewijzigd en nu synchroniseert het niet meer | Werk het sleutelbestand bij via **Instellingen → Stap 2**. |
| Wachtwoord vergeten | Met een account: *Wachtwoord vergeten?* op het inlogscherm en je herstelsleutel. Zonder account (lokaal of gist) is er geen herstel; een versleutelde back-up heeft nog altijd het oude wachtwoord nodig. |

### Lokaal uitproberen

Zonder GitHub kan het ook, met elke simpele webserver:

```sh
git clone https://github.com/JOUWNAAM/REPOSITORY.git
cd REPOSITORY
python3 -m http.server 8000
# open http://localhost:8000/taken/
```

## Bestanden

| Bestand | Wat |
|---|---|
| `index.html` | De volledige app: opmaak, logica en gegevensmodel |
| `sw.js` | Offline-werking en updates |
| `manifest.webmanifest`, `icon*.png`, `favicon*.png` | Installeerbare app en pictogrammen |
| `config.json` | Versleuteld sleutelbestand voor de synchronisatie (jouw eigen token en gist, enkel leesbaar met je wachtwoord) |

## Beperkingen

- **Zonder account is het één gebruiker per kluis:** één wachtwoord opent één gegevensset. Voor meerdere gebruikers met aparte accounts zet je de optionele accountdienst aan, zie [Meerdere gebruikers](#meerdere-gebruikers-accounts).
- Synchronisatie loopt via een GitHub-token; wie dat token heeft, kan de versleutelde gist overschrijven of verwijderen (lezen kan niet zonder wachtwoord).
- Een vergeten wachtwoord kan niet hersteld worden. Bewaar een versleutelde back-up.

## Bijdragen

Bijdragen zijn welkom: meld een probleem of stuur een pull request. De app is bewust klein en zonder afhankelijkheden gehouden; probeer dat zo te laten.

## Licentie

Nog niet vastgelegd. Voeg een `LICENSE`-bestand toe (bijvoorbeeld MIT) voordat je het project officieel als open source deelt.

# Multi-user voor HardSales CRM: uitwerking

Doel: **aparte accounts**. Iedereen logt in met een eigen e-mailadres en wachtwoord en ziet alleen zijn eigen gegevens. Zonder GitHub-token, zonder sleutelbestand, zonder zelf een gist aan te maken. Het wachtwoord blijft de sleutel van de versleuteling: de dienst bewaart alleen versleutelde gegevens (*zero-knowledge*).

## Waarom nu niet mogelijk

Nu opent **één wachtwoord één gegevensset**. De synchronisatie loopt via een GitHub-token en een `config.json` in de repository, die slechts één gist aanwijst. Een tweede gebruiker zou dezelfde gist delen, of zelf een token, gist en commit moeten regelen. Dat zijn precies de lastige stappen. Een centrale opslag met inloggen lost dat op.

## Aanbeveling: Supabase (gratis plan)

| Eis | Supabase |
|---|---|
| Accounts met e-mail en wachtwoord | Ingebouwd (Auth) |
| Elke gebruiker ziet alleen eigen rij | Row Level Security (één regel SQL) |
| Statische site blijft werken (geen eigen server) | Ja: de app praat rechtstreeks met de REST-API |
| Grote kluis (tienduizenden klanten) | Postgres-tekstkolom of Storage-bestand per gebruiker |
| Gratis | Ja, het gratis plan volstaat voor een klein team |
| Europese opslag | Kies bij het aanmaken de regio Frankfurt |

Waarom niet de alternatieven: **Firebase** kent een limiet van 1 MB per document (te klein voor je kluis) en opslag vraagt een betaald plan; een eigen **Cloudflare Worker** vraagt zelf geschreven inlog- en wachtwoordcode; **GitHub-gists** blijven afhankelijk van één token dat iedereen zou delen.

> Controleer de actuele limieten van het gratis plan voor je live gaat (databasegrootte, aantal gebruikers, e-mails per uur, en het feit dat een gratis project na een periode zonder gebruik kan worden gepauzeerd). Ik kan die niet vanuit hier controleren.

## Hoe het werkt

### Eén wachtwoord, twee afgeleide sleutels

Uit het wachtwoord worden met PBKDF2 twee onafhankelijke geheimen afgeleid (verschillende label en salt):

1. een **login-geheim** dat als wachtwoord naar de dienst gaat (de dienst hasht het nog eens);
2. een **kluissleutel** die de gegevens versleutelt en nooit je toestel verlaat.

De dienst ziet dus nooit je echte wachtwoord of de sleutel waarmee je gegevens versleuteld zijn.

### Herstelsleutel

Een vergeten wachtwoord betekent nu: gegevens kwijt. Dat verandert:

- De kluis wordt versleuteld met een **willekeurige datasleutel**.
- Die datasleutel wordt twee keer "ingepakt": met een sleutel uit je wachtwoord en met een eenmalige **herstelsleutel** (bijvoorbeeld 24 tekens) die je bij het aanmaken van het account te zien krijgt en moet bewaren.
- **Wachtwoord wijzigen** pakt alleen de datasleutel opnieuw in, in plaats van alle gegevens opnieuw te versleutelen. Dat is ook veel sneller bij 71.000 klanten.
- Wachtwoord vergeten: inloggen met de herstelsleutel en een nieuw wachtwoord kiezen.

### Gegevens in de dienst

Een tabel met één rij per gebruiker:

```sql
create table vaults (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  blob       text not null,            -- versleutelde kluis (zelfde formaat als nu)
  wrapped    jsonb not null,           -- ingepakte datasleutel (wachtwoord + herstelsleutel)
  rev        bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table vaults enable row level security;
create policy "eigen kluis lezen"      on vaults for select using (user_id = auth.uid());
create policy "eigen kluis maken"      on vaults for insert with check (user_id = auth.uid());
create policy "eigen kluis bijwerken"  on vaults for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "eigen kluis wissen"      on vaults for delete using (user_id = auth.uid());
```

De app slaat bij elke wijziging op met een controle op `rev` (alleen bijwerken als de versie nog klopt). Is die verouderd, dan haalt de app de nieuwste op, voegt samen met de bestaande samenvoegregels (nieuwste wijziging per item wint, verwijderingen blijven bewaard) en probeert opnieuw. Dat werkt nu al zo met de gist.

### Wat verandert in de app

| Nu | Straks |
|---|---|
| Eerste keer: kies een wachtwoord | Account aanmaken: e-mail, wachtwoord, herstelsleutel bewaren |
| Synchronisatie instellen: token, gist, sleutelbestand publiceren | Niets. Je bent al verbonden zodra je ingelogd bent |
| Nieuw toestel: pagina openen en wachtwoord | Pagina openen, e-mail en wachtwoord |
| Eén persoon | Zoveel personen als je wilt, elk met eigen gegevens |

De gist-synchronisatie blijft voor wie geen account wil: **zonder `cloud.json` werkt Taken zoals nu**, volledig lokaal en optioneel met een gist.

## Instellen door de beheerder (eenmalig, ongeveer 10 minuten)

1. Maak een gratis project op supabase.com (regio Frankfurt).
2. Voer het SQL-script hierboven uit (SQL Editor).
3. Zet onder **Authentication** de bevestigingsmail uit (of stel een eigen mailserver in) en bepaal of iedereen zich mag aanmelden of alleen via uitnodiging.
4. Kopieer de **Project URL** en de **anon public key** naar een bestand `taken/cloud.json`:
   ```json
   { "url": "https://JOUWPROJECT.supabase.co", "anonKey": "eyJ…" }
   ```
   De anon key is bedoeld om publiek te zijn; de beveiliging zit in de Row Level Security. Gebruik nooit de *service role key* in de app.
5. Optioneel: een geplande GitHub Action die de dienst wekelijks aanroept, zodat een gratis project niet in slaap valt.

## Bestaande gebruikers

Wie nu lokaal of met een gist werkt, logt in of maakt een account aan en kiest **"Mijn huidige gegevens meenemen"**: de lokale kluis wordt versleuteld geüpload. De gist blijft ongemoeid als back-up tot je hem zelf verwijdert.

## Risico's en keuzes

- **Afhankelijkheid van een dienst.** Gegevens zijn versleuteld en te exporteren (bestaande back-upfunctie), dus overstappen blijft mogelijk.
- **Gratis plan.** Pauzeren bij weinig gebruik en een beperkt aantal e-mails per uur: gebruik een geplande ping en schakel bevestigingsmails uit of koppel een eigen mailserver.
- **Grote kluizen.** Bij zeer veel klanten kan de kluis tientallen MB groot worden. Daarom splitsen we (zoals lokaal al gebeurt) de klantenlijst in een apart bestand in Storage.
- **Wachtwoordkwaliteit.** Omdat het wachtwoord de enige sleutel is, eisen we minstens 10 tekens en tonen we een sterktemeter.
- **Delen binnen een team** (gezamenlijke klanten) is bewust *niet* inbegrepen: dat vraagt gedeelde sleutels per team. Mogelijk als vervolgstap.

## Stappenplan

| Stap | Wat | Omvang |
|---|---|---|
| 1 | Sleutelstructuur: datasleutel, inpakken met wachtwoord en herstelsleutel (ook voor de bestaande lokale kluis, zodat wachtwoord wijzigen snel wordt) | klein |
| 2 | Cloudlaag: aanmelden, inloggen, kluis ophalen en opslaan met versiecontrole, aangesloten op de bestaande samenvoeglogica | middel |
| 3 | Inlogscherm: e-mail en wachtwoord, account aanmaken, herstelsleutel tonen, wachtwoord vergeten | middel |
| 4 | Gegevens meenemen van lokaal of gist naar het account | klein |
| 5 | Documentatie en SQL-script in de repository, plus de geplande ping | klein |
| 6 | Tests (twee gebruikers die elkaar niet zien, conflict, herstelsleutel, offline) met een nagebootste dienst | middel |

## Wat ik van jou nodig heb

1. **Akkoord** op deze aanpak (Supabase, herstelsleutel, geen gedeelde klanten).
2. Een gratis **Supabase-project**. Je stuurt me de *Project URL* en de *anon public key* (niet de service role key). Zolang dat er niet is, bouw ik tegen een nagebootste dienst en test ik alles lokaal.

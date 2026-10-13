# SB Backstage / DJ CRM

Zelfstandige statische app op https://sbmusic.be/crm/ voor klanten, boekingen, offertes en facturen. Mobiel en desktop; SB-huisstijl en bestaande lokale fonts/logo's. Geen dependencies of build nodig.

## Start
1. Maak een kluiswachtwoord van minstens 12 tekens. Dit is geen Supabase-accountwachtwoord. Zonder kluiswachtwoord zijn gegevens niet te herstellen.
2. Vul bedrijfsgegevens, adres, btw-/ondernemingsnummer, IBAN en toepasselijke btw-regeling in bij Instellingen. Er zijn geen fictieve bedrijfsgegevens ingevuld.
3. Maak een klant, boeking en offerte. Boekingen hebben een expliciete einddatum voor sets over middernacht. Overlap wordt gemeld.
4. Bewaar het document als concept, controleer alles en finaliseer. Pas dan krijgt het een nummer O-JAAR-0001 of F-JAAR-0001 en een vaste momentopname van klant/bedrijf/regels. Definitieve documenten zijn niet bewerkbaar of verwijderbaar. Een offerte kan één keer naar een conceptfactuur worden omgezet.
5. Afdrukken / PDF opent de browserafdrukdialoog in dezelfde huisstijl. Kies Bewaar als PDF. Deel de PDF zelf. Geen automatische e-mails, Peppol, creditnota's of boekhoudkoppeling.
6. Registreer ontvangen betalingen als cumulatief bedrag met datum laatste betaling. Jaarindicator op dashboard groepeert dit cumulatieve bedrag op die datum; geen kasboek of transactiegrootboek.

## Opslag en beveiliging
- Klantgegevens uitsluitend versleuteld in localStorage (`sb-dj-crm-v1`). PBKDF2-SHA256, 310.000 iteraties, willekeurige salt van 16 bytes, AES-GCM-256 met een nieuwe IV van 12 bytes per opslag.
- Geen wachtwoord of ontsleutelde kluis op schijf. WebCrypto-sleutel in geheugen tijdens een ontgrendelde sessie. Handmatige lock en 15 minuten inactiviteit wissen de zichtbare gegevens en sessiesleutel.
- Publieke appbron, geen publieke klantdata. CSP beperkt scripts tot dezelfde site en netwerk tot het bestaande Supabase-project. Geen inline handlers; uitvoer escaped.
- Lokaal is per browser/toestel. Wis browsergegevens niet zonder back-up. Een versleutelde JSON-back-up kan via Instellingen worden gedownload en hersteld.
- De browser-origin deelt storage en scripts met de rest van sbmusic.be; alleen vertrouwde scripts op dit domein gebruiken. Geen beveiligingsgrens tegen schadelijke code op dezelfde origin.

## Cloud activeren (eenmalig)
Voer `crm/supabase.sql` uit in de Supabase SQL Editor van het project in `/taken/cloud.json`. Het maakt uitsluitend `public.crm_vaults` met row level security voor de eigen gebruiker. Geen service-role-sleutel nodig of toegestaan in de browser. Gebruik een bestaand Supabase-account (bijvoorbeeld van Klose); account aanmaken/herstellen blijft in de bestaande accountflow.

In Instellingen: inloggen, vervolgens expliciet kiezen lokale kluis uploaden of cloudkluis ophalen. Inloggen alleen overschrijft niets. Nieuwe wijzigingen worden na die keuze gesynchroniseerd. Op een nieuw toestel: cloud ophalen op het lockscreen, dan dezelfde kluiswachtwoord gebruiken. Sessietokens worden alleen in geheugen gehouden en niet gedeeld met Klose. Na tokenverval opnieuw inloggen.

Conflicten worden gedetecteerd via een conditionele update op `rev`. Er wordt geen remote wijziging stil overschreven: de eigen wijziging blijft lokaal, er verschijnt een melding, en gebruiker kiest na back-up de gewenste versie. Geen automatische conflictmerge. Geen realtime autosync wanneer een toestel niets wijzigt; gebruik Cloudkluis ophalen.

## Controle
`node --check crm/app.js` en `node --test crm/core.test.cjs crm/security.test.cjs`. De tests controleren centafronding, btw per regel, nachtelijke boekingen, documentnummers en back-upvalidatie. Live Supabase/RLS moet na SQL-installatie met twee accounts worden gecontroleerd. Factuurinhoud/btw-regeling door gebruiker controleren; deze app is geen fiscale validatieservice.

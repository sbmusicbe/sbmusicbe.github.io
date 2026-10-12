# Klose: veiligheid en privacy

Eerlijk vooraf: geen enkel systeem is "lek-vrij". Dit document zegt wat Klose doet, wat het niet kan beschermen, en wat jij in Supabase zelf moet instellen.

## Hoe je gegevens beschermd zijn

- **Versleuteld in de browser.** Deals, klanten, verkopen en notities worden op je toestel versleuteld (AES-GCM met een willekeurige 256-bit sleutel, elke keer een nieuwe willekeurige IV). De sleutel wordt beschermd door je wachtwoord (PBKDF2-SHA256, 310.000 rondes) en door de noodcode. Wat naar de server gaat, is alleen die versleutelde kluis.
- **De server kan niets lezen.** Supabase (of je eigen Klose-server) heeft nooit je wachtwoord of sleutel. Ook de beheerder kan je gegevens niet inzien. Zonder wachtwoord én noodcode kan niemand ze herstellen.
- **Aparte inlogcode.** Het inlogwachtwoord voor de server is een afgeleide waarde (andere sleutel dan die van de gegevens), zodat een lek bij de server de kluis niet opent.
- **Eigen rij, afgedwongen door de database.** Row Level Security: een gebruiker leest en wijzigt alleen de eigen kluis; anonieme bezoekers hebben geen toegang tot de tabel. Zie `supabase.sql`.
- **Strikte pagina-beveiliging (CSP).** Alleen scripts van de eigen site draaien (geen inline-script, geen eval); verbindingen mogen alleen naar de eigen site en je Supabase-project; geen derde partijen. Fouten in invoerverwerking kunnen dus geen code uitvoeren of gegevens versturen. Verkende en getest: alle velden bevatten bij een test aanvalscode zonder dat die ooit uitgevoerd werd, ook zonder CSP.
- **Geen derde partijen.** Lettertypen staan op de site zelf, er zijn geen volgsystemen, geen advertenties, geen externe scripts. De referrer wordt niet meegestuurd. Zoekmachines worden gevraagd de pagina niet te indexeren.
- **Geen gegevens in de tabnaam.** De titel van het tabblad is altijd "Klose", zodat projectnamen niet in browsergeschiedenis, synchronisatie of schermdelen belanden. Spellingscontrole en automatisch aanvullen staan uit voor deal- en klantvelden, zodat de browser de tekst niet bewaart of naar een dienst stuurt.
- **Automatisch vergrendelen** na 15 minuten zonder activiteit (instelbaar). Vergrendelen laadt de pagina opnieuw, waardoor alle gegevens uit het geheugen verdwijnen.
- **Geen klantendatabase.** Klose bewaart geen klantenlijst meer; oude klantgegevens worden bij het openen gewist en bij de volgende keer opslaan ook online.
- **Niet in een frame.** De app weigert ingebed te worden in een andere site.

## Wat Klose niet kan beschermen

- **Een toestel dat al gehackt is** (malware, keylogger) of iemand die meekijkt als je ontgrendeld bent.
- **Een zwak wachtwoord.** Gebruik een lange zin. Een snel te raden wachtwoord kan door iemand met een kopie van de versleutelde kluis offline worden uitgeprobeerd.
- **"Wachtwoord onthouden"** vult het wachtwoord in op dat toestel. Doe dit alleen op een eigen, vergrendeld toestel.
- **Wat jij exporteert.** CSV-bestanden, de noodcode en rugnummers zijn leesbaar voor wie het bestand heeft. Bewaar ze veilig of wis ze.
- **Metadata:** het e-mailadres van het account, het tijdstip van wijzigen en de grootte van de kluis zijn zichtbaar voor de server.
- **Verloren wachtwoord én noodcode:** onherstelbaar (dat is de keerzijde van echte privacy).

## Wat jij nog in Supabase zet (kan ik niet voor je doen)

Authentication → Settings in je Supabase-project:

1. **Sign-ups sluiten** zodra al je collega's een account hebben (*Allow new users to sign up* uit). Anders kan iedereen met de link een account maken.
2. **Bevestiging per e-mail** aan (*Confirm email*) en een **minimale wachtwoordlengte van 12**.
3. **Leaked password protection** aan (Pro-abonnement).
4. **CAPTCHA** (Turnstile of hCaptcha) aan tegen geautomatiseerde aanmeldingen.
5. **Redirect URLs** beperken tot `https://sbmusic.be/taken/`.
6. Voer `supabase.sql` opnieuw uit (het is herhaalbaar): het scherpt de rechten aan, zet een maximale kluisgrootte en maakt de verwijderfunctie veiliger.
7. Zet de **service_role / secret key** nooit in de app of in deze repository. Alleen de publishable key staat in `cloud.json` (die is bedoeld om openbaar te zijn).
8. Controleer onder Database → Backups dat back-ups aanstaan, en bewaar zelf ook een versleutelde back-up (Instellingen → Back-up).

## Een probleem melden

Mail naar claudeai@sbmusic.be. Beschrijf wat je zag en op welk toestel; stuur geen wachtwoorden of noodcodes mee.

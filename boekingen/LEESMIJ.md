# Live muziekplanning met klanten (Supabase)

Zonder dit werkt alles al, maar via codes in e-mails. Met dit zien jij en je klant (en hun vrienden en familie) elkaars wijzigingen live.

1. Maak een gratis project op https://supabase.com (kies regio **EU / Frankfurt** voor GDPR).
2. Open **SQL Editor**, plak de inhoud van `supabase.sql` en klik **Run**.
3. Ga naar **Project Settings → API** en kopieer de **Project URL** en de **anon public key**. Plak ze in `sync-config.js`:
   `window.SB_SYNC={url:"https://xxxx.supabase.co",key:"eyJ..."};`

Hoe het werkt: elke boeking krijgt een geheim, onraadbaar token. De klantlink bevat dat token; wie de link heeft kan de muzieklijst van die ene boeking lezen en aanpassen. De tabel zelf is niet rechtstreeks bereikbaar. Je boekingen, prijzen en facturen blijven versleuteld in je eigen browser: alleen de muzieklijst gaat naar Supabase.
Vermeld dit in de privacyverklaring (verwerker: Supabase, EU-regio).

## Boekingen tussen toestellen delen en aanvragen ontvangen

Met dezelfde Supabase-setup (voer het hele `supabase.sql` uit, ook deel 2):

- **Instellingen → Synchronisatie inschakelen** (wachtwoord bevestigen). Je boekingen, prijzen en facturen staan dan versleuteld op de server: de server kan ze niet lezen, alleen toestellen die je wachtwoord kennen.
- **Nieuw toestel:** vink bij het opstarten “Ik heb al een kluis op een ander toestel (ophalen)” aan en voer hetzelfde wachtwoord in.
- Wijzig je het wachtwoord, schakel de synchronisatie dan op elk toestel opnieuw in.
- Bij gelijktijdige wijzigingen wint per boeking de laatst bewerkte versie; de instellingen worden als geheel samengevoegd (laatste wint).
- **Aanvraagformulier:** `…/boekingen/aanvraag.html`. Aanvragen komen na de volgende synchronisatie als “Aanvraag” in je pijplijn (en nog steeds per mail). Na import worden ze van de server gewist.
  Let op: tot dat moment staan aanvragen (naam, e-mail…) leesbaar op de server. Vermeld Supabase (EU) in je privacyverklaring.

# Live muziekplanning met klanten (Supabase)

Zonder dit werkt alles al, maar via codes in e-mails. Met dit zien jij en je klant (en hun vrienden en familie) elkaars wijzigingen live.

1. Maak een gratis project op https://supabase.com (kies regio **EU / Frankfurt** voor GDPR).
2. Open **SQL Editor**, plak de inhoud van `supabase.sql` en klik **Run**.
3. Ga naar **Project Settings → API** en kopieer de **Project URL** en de **anon public key**. Plak ze in `sync-config.js`:
   `window.SB_SYNC={url:"https://xxxx.supabase.co",key:"eyJ..."};`

Hoe het werkt: elke boeking krijgt een geheim, onraadbaar token. De klantlink bevat dat token; wie de link heeft kan de muzieklijst van die ene boeking lezen en aanpassen. De tabel zelf is niet rechtstreeks bereikbaar. Je boekingen, prijzen en facturen blijven versleuteld in je eigen browser: alleen de muzieklijst gaat naar Supabase.
Vermeld dit in de privacyverklaring (verwerker: Supabase, EU-regio).

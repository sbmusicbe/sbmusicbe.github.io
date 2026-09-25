// Instellingen voor Verzoekjes. Maak dit bestand aan via beheer.html (eerste keer), zie LEESMIJ.md.
// repo:      privé GitHub-repo waarin de verzoekjes als issues komen
// token:     fine-grained token met enkel "Issues: read & write" op die repo (gecodeerd, niet geheim)
// adminHash: controle voor je beheerwachtwoord (PBKDF2), het wachtwoord zelf staat hier niet
export const config = {
  repo: "",
  token: "",
  adminHash: null
};

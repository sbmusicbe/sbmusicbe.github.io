// Run this ONCE from your own computer (not from Vercel):
//   GARMIN_EMAIL=you@example.com GARMIN_PASSWORD=yourpassword node scripts/garmin-login.js
//
// Garmin often blocks logins from cloud/datacenter IPs (like Vercel's) with a
// CAPTCHA or MFA challenge this library can't solve. Logging in from a normal
// home connection avoids that. On success this prints a token you paste into
// Vercel as GARMIN_TOKENS, so the backend can reuse that session instead of
// logging in again on every request.
import { GarminConnect } from 'garmin-connect';

const email = process.env.GARMIN_EMAIL;
const password = process.env.GARMIN_PASSWORD;

if (!email || !password) {
  console.error('Set GARMIN_EMAIL and GARMIN_PASSWORD env vars before running this script.');
  process.exit(1);
}

const gc = new GarminConnect({ username: email, password });

try {
  await gc.login();
  const tokens = gc.exportToken();
  console.log('\nLogin succeeded! Add this as a Vercel environment variable named GARMIN_TOKENS:\n');
  console.log(JSON.stringify(tokens));
  console.log('\nThen redeploy the project so it picks up the new variable.');
} catch (err) {
  console.error('\nLogin failed:', err?.message || err);
  console.error(
    '\nIf this still mentions MFA/CAPTCHA even when run locally, your Garmin account ' +
      'likely has two-factor authentication enabled. This library cannot complete a 2FA ' +
      'challenge, so you would need to temporarily disable 2FA in Garmin Connect account ' +
      'security settings, run this script, then you can turn 2FA back on afterwards.'
  );
  process.exit(1);
}

# sbmusicbe.github.io

Static site (`index.html`) served by GitHub Pages at sbmusic.be.

## Garmin training & food coach chatbot

A floating chat widget (bottom-right of the site) answers questions about
your training and nutrition using your real Garmin Connect data, via Claude.

Because GitHub Pages only serves static files, the part that logs into
Garmin and calls the Claude API lives in `api/` and needs to be deployed
separately as serverless functions (Vercel). The frontend widget in
`index.html` just calls that API over `fetch`.

### 1. Deploy the backend to Vercel

1. Install the [Vercel CLI](https://vercel.com/docs/cli) or connect this repo
   in the Vercel dashboard.
2. From the repo root: `vercel` (or import the repo in the dashboard). Vercel
   auto-detects the Node functions under `api/` — no build step needed.
3. In the Vercel project's **Settings → Environment Variables**, set the
   values from `.env.example`:
   - `GARMIN_EMAIL` / `GARMIN_PASSWORD` — your Garmin Connect login. Used
     server-side only, via the unofficial [`garmin-connect`](https://www.npmjs.com/package/garmin-connect)
     library, never exposed to the browser.
   - `GARMIN_TOKENS` — usually required (see **Garmin blocks the login from
     Vercel** below before you deploy).
   - `ANTHROPIC_API_KEY` — your Anthropic API key.
   - `ANTHROPIC_MODEL` — defaults to `claude-sonnet-5` if unset.
   - `ALLOWED_ORIGIN` — set to `https://sbmusic.be` so only your site can
     call the API (CORS).
   - `CHAT_PASSPHRASE` — a shared passphrase so random visitors can't rack
     up your Anthropic bill or spam Garmin's login. The widget prompts for
     it once and remembers it in the browser. Leave blank to disable (not
     recommended).
4. Deploy. You'll get a URL like `https://your-project.vercel.app`.

### 2. Point the widget at your deployment

In `index.html`, find:

```js
const GARMIN_CHAT_API_URL = "https://YOUR-VERCEL-APP.vercel.app/api/chat";
```

and replace it with your real Vercel URL + `/api/chat`. Commit and push —
GitHub Pages will pick it up automatically.

### Garmin blocks the login from Vercel (CAPTCHA/MFA error)

If the chatbot says it can't reach your Garmin data, and the Vercel function
logs for `api/chat` show something like:

```
Error: login failed (Ticket not found or MFA), please check username and password
```

this isn't a credentials problem — Garmin is challenging the login because
it's coming from a cloud/datacenter IP, and this library can't solve a
CAPTCHA or MFA prompt. Fix it by logging in once from your own computer and
handing the backend a reusable session instead of a password:

1. Clone this repo locally and run `npm install`.
2. Run (with your real Garmin credentials):
   ```
   GARMIN_EMAIL=you@example.com GARMIN_PASSWORD=yourpassword npm run garmin:login
   ```
3. On success it prints a JSON blob. Copy it into a new Vercel environment
   variable named `GARMIN_TOKENS`, then redeploy.
4. The backend now reuses that session (its access token auto-refreshes)
   instead of logging in on every request, so it never hits the blocked path.

If the script still fails with an MFA/CAPTCHA error even run locally, your
Garmin account has two-factor authentication enabled — this library can't
complete a 2FA challenge. Temporarily disable 2FA in your Garmin Connect
account security settings, run the script once, then turn 2FA back on.

A Garmin OAuth1 token like this is long-lived (roughly a year), so you
shouldn't need to repeat this often — only if the chatbot starts erroring
again after a long time, or if you ever revoke Garmin Connect app sessions.

### Notes & limitations

- **Garmin auth**: Garmin has no public personal-use API, so this uses the
  widely-used unofficial `garmin-connect` npm package. This is against the
  letter of Garmin's ToS but very commonly used for personal projects; use
  at your own risk, and expect it may occasionally need small fixes if
  Garmin changes their internal API.
- **Food/nutrition data**: Garmin Connect doesn't have its own food diary
  for most accounts — calorie/macro intake only shows up if you log meals
  through a connected app like MyFitnessPal. The chatbot is told about this
  limitation and will say so rather than making numbers up; it can still
  reason about your weight trend, calories burned, and general
  sports-nutrition advice.
- **Security**: this is a lightweight personal-site integration, not a
  production auth system. The passphrase is visible to anyone who inspects
  network requests once entered — it deters casual abuse, it doesn't
  replace real authentication.

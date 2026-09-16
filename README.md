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

### Notes & limitations

- **Garmin auth**: Garmin has no public personal-use API, so this uses the
  widely-used unofficial `garmin-connect` npm package (email/password
  login). This is against the letter of Garmin's ToS but very commonly
  used for personal projects; use at your own risk, and expect it may
  occasionally need small fixes if Garmin changes their internal API.
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

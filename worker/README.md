# Lake Hills OA — sync backend

A tiny Cloudflare Worker + D1 database that mirrors the app's `localStorage` keys, so
data survives a browser cache clear and stays in sync across computers. Access is
gated by Google Sign-In against an email allowlist you control — no shared password.

**Note on emails:** Google Sign-In only works for actual Google Accounts. A Gmail
address works immediately. A non-Gmail address (e.g. a company Outlook/Hotmail
address) needs to have been turned into a Google Account first — via "Create a
Google Account" on Google's signup page, choosing "Use my current email address
instead" — before it can sign in here.

## One-time setup

### 1. Google Cloud OAuth Client ID

1. Go to [console.cloud.google.com](https://console.cloud.google.com/), create a project (or reuse one)
2. **APIs & Services → OAuth consent screen** — set it up as "External", add your own email as a test user if it stays in testing mode
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, type "Web application"
4. Under **Authorized JavaScript origins**, add:
   - `https://boxsbraindump.github.io` (the live site)
   - `http://127.0.0.1:5185` (local dev)
   - `http://localhost:5185` (local dev)
5. Copy the generated **Client ID** (looks like `xxxxx.apps.googleusercontent.com`) — you'll need it twice below.

### 2. Cloudflare Worker + D1

Run these from this `worker/` directory.

```bash
npm install

# Log in to Cloudflare (opens a browser window)
npx wrangler login

# Create the D1 database
npx wrangler d1 create lakehills-oa
# Copy the "database_id" it prints into wrangler.toml (replacing REPLACE_WITH_D1_DATABASE_ID)

# Apply the schema
npx wrangler d1 execute lakehills-oa --remote --file=schema.sql

# Paste the Google Client ID from step 1 into wrangler.toml
# (replacing REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID under [vars])

# Set who's allowed in — comma-separated emails, no spaces needed
npx wrangler secret put ALLOWED_EMAILS
# e.g. paste: lakehillsaom@hotmail.com,boxcec1ly@gmail.com

# Deploy
npm run deploy
```

Deploy prints a URL like `https://lakehills-oa-api.<your-subdomain>.workers.dev`.

### 3. Frontend env

Put these in the root project's `.env.local` (see `.env.example`):

```
VITE_API_BASE=https://lakehills-oa-api.<your-subdomain>.workers.dev
VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

And the same two values as GitHub Actions repo secrets (`VITE_API_BASE`,
`VITE_GOOGLE_CLIENT_ID`) so the live GitHub Pages build picks them up too.

## Adding/removing someone's access later

```bash
npx wrangler secret put ALLOWED_EMAILS
# paste the full updated comma-separated list — it replaces the old one
```

No code change or redeploy of the app needed — takes effect on the next login attempt.

## Workspace boundary and public signup safety

By default, Lake Hills stays private:

- Emails in `ALLOWED_EMAILS` enter the primary `lake-hills` workspace.
- The primary workspace continues to use the existing `kv_store` table, so current Lake Hills data is preserved.
- Unknown emails are still blocked unless public signups are intentionally enabled.

If you later want to test public signups, set a Worker variable:

```toml
[vars]
PUBLIC_SIGNUPS = "true"
```

Then deploy the Worker again. Unknown Google accounts will sign in to their own separate workspace and see the template selector instead of Lake Hills data.

## Local dev

```bash
npm run dev
```

Runs the Worker against a local D1 instance on `http://localhost:8787`. You'll also
need `.dev.vars` (gitignored) with `ALLOWED_EMAILS=...` for local testing — the
Google Client ID's authorized origins must include `http://localhost:5185` for
sign-in to work against local dev.

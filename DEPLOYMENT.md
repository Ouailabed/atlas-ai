# Atlas — Deployment Guide

Everything needed to take Atlas from an empty machine to a live Vercel deployment.

**Stack:** Next.js 15 (App Router) · React 19 · Supabase (Postgres + Auth) · Groq (Llama 3.3 70B) · Stripe · Google OAuth (Gmail + Calendar)

---

## 1. Environment variables

All of these live in `.env.local` for local development, and in **Vercel → Project → Settings → Environment Variables** for production. `.env.local` is gitignored — never commit real keys.

### Required — the app will not function without these

| Variable | Where to get it | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | Public. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` `public` | Public by design — shipped to the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` | **Secret.** Bypasses RLS. Never prefix with `NEXT_PUBLIC_`, never use in a client component. |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys | Starts with `gsk_`. |
| `NEXT_PUBLIC_APP_URL` | Your own URL | `http://localhost:3000` locally; `https://your-domain.com` in production. Used for OAuth redirects and Stripe return URLs — **wrong value breaks both**. |

### Optional — each unlocks a feature, and Atlas degrades honestly without them

| Variable | Unlocks | Without it |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail + Calendar agents | Both report as "not connected"; Atlas won't claim it can send mail or book events. |
| `GOOGLE_REFRESH_TOKEN` | Single-account dev fallback | Users connect their own account via Settings instead. Leave blank in production. |
| `STRIPE_SECRET_KEY` | Checkout | Upgrade buttons return a clear 503. |
| `STRIPE_WEBHOOK_SECRET` | Recording paid upgrades | **Payments succeed but nobody gets upgraded.** Do not launch paid plans without this. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side Stripe | Not required by the current checkout flow. |
| `BRIEFING_CRON_SECRET` | Scheduled morning briefings | The cron route refuses to run rather than defaulting open. |
| `OPENWEATHER_API_KEY` | Weather in briefings | Briefing omits weather entirely rather than letting the model invent a forecast. |

Generate a cron secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 2. Database

### 2a. Create the schema

Supabase → **SQL Editor** → New query → paste all of [`scripts/schema.sql`](scripts/schema.sql) → **Run**.

Creates 12 tables: `users`, `memories`, `conversations`, `tasks`, `agent_logs`, `contacts`, `waitlist`, `transactions`, `invoices`, `job_applications`, `oauth_tokens`, `briefings`.

> ⚠️ The script **drops existing tables first**. Re-running it deletes all data.

The final `SELECT` should return 12 rows.

### 2b. Enable Row Level Security — before real users

Run [`scripts/rls-policies.sql`](scripts/rls-policies.sql) the same way.

**This is not optional.** `NEXT_PUBLIC_SUPABASE_ANON_KEY` is visible to anyone who opens dev tools. Until RLS is on, that key can read and write every row in every table — every user's memories, conversations, invoices and contacts. The policies restrict the anon key to the signed-in user's own rows, while `service_role` (server-side only) keeps working unchanged.

`oauth_tokens` deliberately gets **no** anon policy — Google refresh tokens should only ever be read by the server. `waitlist` is insert-only for the public, so the landing page form works but nobody can download your signup list.

### 2c. Auth settings

Supabase → **Authentication → Providers → Email** → enable.

- Development: turn **"Confirm email"** off so you can sign in immediately.
- Production: turn it **on**, and add your domain under **Authentication → URL Configuration → Site URL**.

---

## 3. Google OAuth (Gmail + Calendar)

One setup covers both agents.

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project.
2. **APIs & Services → Library** → enable **Gmail API** and **Google Calendar API**.
3. **OAuth consent screen** → External → add your email under *Test users*. Add scopes:
   - `gmail.readonly`, `gmail.compose`, `gmail.send`
   - `calendar`, `userinfo.email`
4. **Credentials → Create Credentials → OAuth client ID → Web application.** Under *Authorised redirect URIs* add both:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://your-domain.com/api/auth/google/callback`
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
6. Restart the dev server, go to **/settings**, click **Connect**.

Each user connects their own Google account; the refresh token is stored per-user in `oauth_tokens`. The `GOOGLE_REFRESH_TOKEN` env var is a single-account fallback for local development only.

**Staying in "Testing" mode** limits you to your listed test users. Publishing the app requires Google verification, because the Gmail scopes are classed as sensitive. Budget several weeks for that if you plan to onboard external customers.

---

## 4. Stripe

1. [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → API keys** → copy the secret key.
2. Local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`.

3. Production: **Developers → Webhooks → Add endpoint**
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

The webhook is excluded from middleware — Stripe sends no session cookie, and the request signature is what authenticates it.

---

## 5. Deploy to Vercel

```bash
cd "C:\Users\Ouail Abed\Desktop\aria"
git init
git add .
git commit -m "Atlas"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/atlas-ai.git
git push -u origin main
```

Then:

1. [vercel.com](https://vercel.com) → **New Project** → import the repo.
2. Framework preset: **Next.js** (auto-detected). No build settings to change.
3. **Environment Variables** → add every variable from section 1. Set `NEXT_PUBLIC_APP_URL` to your real Vercel URL.
4. **Deploy.**

After the first deploy, go back and update:
- `NEXT_PUBLIC_APP_URL` → your actual domain
- Google Console → add the production callback URI
- Supabase → Authentication → Site URL

Then **redeploy** so the new env values take effect. Vercel does not apply env changes to an existing deployment.

---

## 6. Morning briefing cron

[`vercel.json`](vercel.json) already declares the schedule:

```json
{ "crons": [{ "path": "/api/cron/briefing", "schedule": "0 7 * * 1-5" }] }
```

07:00 UTC, Monday–Friday.

1. Add `BRIEFING_CRON_SECRET` to Vercel's environment variables.
2. Deploy. Vercel registers the cron automatically — check **Project → Settings → Cron Jobs**.
3. Vercel sends `Authorization: Bearer $CRON_SECRET`. If you named the variable `BRIEFING_CRON_SECRET`, the route accepts that value too.

Test it manually:

```bash
curl -H "x-cron-secret: YOUR_SECRET" https://your-domain.com/api/cron/briefing
```

Expect `{"ok":true,"total":N,"generated":N,...}`.

**Cron limits:** the Vercel Hobby plan allows a small number of cron jobs and runs them at most once per day, with no guaranteed minute-level precision. Pro is needed for reliable weekday scheduling.

---

## 7. Post-deploy checklist

- [ ] `scripts/schema.sql` run — 12 tables
- [ ] `scripts/rls-policies.sql` run — every table shows `rowsecurity = true`
- [ ] Sign up works, redirects into onboarding
- [ ] Onboarding saves and lands on the dashboard
- [ ] `/atlas` responds and cites which agents are connected
- [ ] Tasks and memories persist and appear on the dashboard
- [ ] Waitlist form on `/wow.html` returns a success message
- [ ] `/settings` → Connect Google succeeds and returns `?google=connected`
- [ ] Stripe test-mode checkout upgrades the plan (watch the webhook log)
- [ ] Cron endpoint returns `ok: true`

---

## 8. Known limitations

Worth knowing before you take money for this.

**Rate limiting is per-instance.** `lib/rateLimit.js` uses an in-memory `Map`. Each Vercel serverless instance keeps its own copy and cold starts reset it, so the real limit is roughly *instances × 30/min*. It stops runaway loops, not a determined attacker. Move to Upstash Redis or Vercel KV before launch.

**Briefing scheduling is global, not per-user.** Settings stores a preferred hour, but the cron fires once at 07:00 UTC for everyone. Honouring per-user times needs either hourly cron runs that filter by `briefing_hour`, or a queue.

**Google verification gates real customers.** Until Google approves the app, only listed test users can connect Gmail or Calendar.

**Account deletion leaves the auth user.** `/settings` → Delete account data removes all app rows and signs the user out, but does not delete the Supabase Auth record — that needs the admin API and was left out deliberately so a mis-click cannot destroy the login.

**10 agents are not built.** Calendar, Contacts, Invoice, Email and the rest listed as live are real. WhatsApp, Travel, Trading, Health, Shopping, Legal, Social and Code are not — Atlas says so rather than pretending. `lib/agents.js` is the single source of truth; the dashboard's Agent Status panel reads from it, so it cannot drift out of date.

**Weather and news are thin.** News uses DuckDuckGo Instant Answers, which is not a news feed and returns nothing for most queries. For a real briefing, connect NewsAPI, GDELT or an RSS feed.

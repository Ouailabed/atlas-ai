# Atlas — Quick Start

Getting Atlas running on your machine. About **20 minutes**, most of it waiting for Supabase.

You need four things: a Supabase account, a Groq account, this folder, and Node.js installed. Everything else is optional.

---

## Step 1 — Get your Supabase keys

1. Go to **[supabase.com](https://supabase.com)** and sign in.
2. Click **New Project**. Name it `atlas-ai`. Pick a strong database password and save it somewhere.
3. Choose region **West EU (Ireland)** — closest to London.
4. Click **Create new project**, then wait about 2 minutes while it sets up.
5. When it's ready, go to **Settings → API** (left sidebar, gear icon).
6. Keep this tab open. You need three values from it:
   - **Project URL**
   - **anon** / **public** key
   - **service_role** key — click *Reveal* to see it

> The `anon` and `service_role` keys look almost identical and both start with `eyJ`. They are **not** interchangeable. Copy them carefully.

---

## Step 2 — Get your Groq key

1. Go to **[console.groq.com](https://console.groq.com)** and sign up.
2. Click **API Keys** → **Create API Key**. Name it `atlas`.
3. Copy the key — it starts with `gsk_`.

> Copy it now. Groq shows the key **once** and never again.

---

## Step 3 — Create your settings file

Open a terminal in this folder and run:

```bash
cp .env.local.template .env.local
```

Now open `.env.local` in a text editor and paste in the four values you just collected:

```
NEXT_PUBLIC_SUPABASE_URL=        ← Project URL from Step 1
NEXT_PUBLIC_SUPABASE_ANON_KEY=   ← anon key from Step 1
SUPABASE_SERVICE_ROLE_KEY=       ← service_role key from Step 1
GROQ_API_KEY=                    ← gsk_... key from Step 2
```

Leave everything else blank for now. Save the file.

Every variable has a comment above it explaining what breaks if it's missing, so you can come back and fill in the optional ones later.

---

## Step 4 — Set up the database

Two SQL files, run **in this order**. Both live in the `scripts/` folder.

**First — create the tables:**

1. In Supabase, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `scripts/schema.sql`, copy **all** of it, paste it in.
4. Click **Run**.
5. You should see a list of 12 table names at the bottom. That's success.

**Second — lock down security:**

1. Click **New query** again.
2. Open `scripts/rls-policies.sql`, copy all of it, paste it in.
3. Click **Run**.
4. Every row should show `rowsecurity = true`.

> **Don't skip the second file.** Without it, anyone who visits your site can read every user's private data straight out of the database. It takes 10 seconds.

---

## Step 5 — Turn off email confirmation (for now)

So you can sign in immediately while testing:

1. Supabase → **Authentication** → **Providers** → **Email**.
2. Turn **Confirm email** *off*.
3. Save.

Turn it back on before real users sign up.

---

## Step 6 — Install and run

Back in your terminal, in this folder:

```bash
npm install
```

Then:

```bash
npm run dev
```

Wait for it to say **Ready**, then open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Step 7 — Create your account

1. Go to **[http://localhost:3000/login](http://localhost:3000/login)**.
2. Click **Don't have an account? Sign up**.
3. Enter your email and a password of at least 8 characters.
4. You'll land straight in onboarding.

---

## Step 8 — Complete onboarding

Five quick questions: your name, what you do, what you want Atlas to handle, where you're based, and your biggest current challenge.

Answer them honestly — Atlas saves each answer as a memory and uses them in every future conversation. The city is what powers weather in your morning briefing.

You'll land on the dashboard when you're done. You only see onboarding once.

---

## Step 9 — Talk to Atlas

Click **Chat** in the top navigation, or go to `/atlas`.

Try these:

```
I spent £45 on lunch today
```

```
Remind me to prepare for my interview on Thursday
```

```
What do you know about me?
```

Then go back to the **Dashboard** — the expense and the task will already be there. Atlas saved them as you talked, without being asked.

---

## That's it

Atlas is running. Everything below is optional.

| Want to… | Do this |
|---|---|
| Connect Gmail and Calendar | `DEPLOYMENT.md` section 3, then click **Connect** on `/settings` |
| Add weather to briefings | Free key from openweathermap.org → `OPENWEATHER_API_KEY` |
| Turn on automatic 7am briefings | Set `BRIEFING_CRON_SECRET`, then deploy |
| Accept payments | `DEPLOYMENT.md` section 4 |
| Put it online | `DEPLOYMENT.md` section 5 |

---

## If something goes wrong

**"Supabase is not configured"** — a key is missing or misspelled in `.env.local`. Restart the server after any change to that file; it is only read at startup.

**Login says "Invalid email or password" on a brand new account** — email confirmation is still on. See Step 5.

**Nothing saves, but login works** — `SUPABASE_SERVICE_ROLE_KEY` is missing, or you pasted the `anon` key into it by mistake. They look similar. Check Step 1.

**"Atlas could not reach its language model"** — `GROQ_API_KEY` is wrong, or you've hit Groq's free rate limit. Wait a minute and try again.

**Atlas says it can't add something to your calendar** — that's correct, not a bug. Calendar needs Google connected (`DEPLOYMENT.md` section 3). Atlas tells you plainly rather than pretending it worked.

**Port 3000 already in use** — something else is running. Either close it, or run `npm run dev -- -p 3001` and use that port instead.

-- ============================================================================
-- ATLAS AI — CORRECTED DATABASE SCHEMA
-- ============================================================================
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- WHAT THIS FIXES vs the original build guide:
--   1. user_id is TEXT, not UUID. The app uses 'default-user' before login,
--      which is not a valid UUID and made every INSERT fail with error 22P02.
--      Supabase auth user ids are UUIDs, but they cast to TEXT cleanly, so
--      TEXT works for both the pre-auth placeholder and real logged-in users.
--   2. No REFERENCES constraints. The original pointed user_id at users(id),
--      which was never populated, so every insert also hit a FK violation.
--   3. No RLS. The original enabled RLS and never wrote a single policy, which
--      silently blocks all reads and writes. RLS gets added properly in a later
--      step once auth is wired up. Until then the service_role key is used
--      server-side only and is never exposed to the browser.
--   4. All 9 tables are here upfront. transactions/invoices/waitlist used to
--      appear several steps later, so the finance agent broke on arrival.
--
-- SAFE TO RE-RUN: drops and recreates everything. THIS DELETES EXISTING DATA.
-- ============================================================================

DROP TABLE IF EXISTS agent_logs   CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS memories     CASCADE;
DROP TABLE IF EXISTS tasks        CASCADE;
DROP TABLE IF EXISTS contacts     CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS invoices     CASCADE;
DROP TABLE IF EXISTS waitlist     CASCADE;
DROP TABLE IF EXISTS job_applications CASCADE;
DROP TABLE IF EXISTS oauth_tokens CASCADE;
DROP TABLE IF EXISTS briefings    CASCADE;
DROP TABLE IF EXISTS users        CASCADE;

-- ---------------------------------------------------------------------------
-- users — app-level profile + subscription plan.
-- id is TEXT and holds the Supabase auth user id (a UUID) as text.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                 TEXT PRIMARY KEY,
  email              TEXT UNIQUE NOT NULL,
  name               TEXT,
  plan               TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'pro' | 'elite'
  onboarded          BOOLEAN NOT NULL DEFAULT FALSE,
  briefing_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  briefing_hour      INTEGER NOT NULL DEFAULT 7,      -- 0-23, UTC
  stripe_customer_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE memories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'fact',  -- fact | preference | person | goal | event
  content    TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 5,
  tags       TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL,                 -- 'user' | 'assistant'
  content    TEXT NOT NULL,
  agent      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | done | cancelled
  priority    INTEGER NOT NULL DEFAULT 5,
  due_date    TIMESTAMPTZ,
  agent       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agent_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  agent      TEXT NOT NULL,
  action     TEXT NOT NULL,
  result     TEXT,
  success    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  company      TEXT,
  notes        TEXT,
  relationship TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  role       TEXT,
  source     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  type        TEXT NOT NULL,                 -- 'income' | 'expense'
  category    TEXT,
  description TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invoices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  client_name TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  status      TEXT NOT NULL DEFAULT 'unpaid',  -- paid | unpaid | overdue
  due_date    DATE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- job_applications — the Jobs page tracker.
-- ---------------------------------------------------------------------------
CREATE TABLE job_applications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  company      TEXT NOT NULL,
  role         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'applied',  -- applied | interview | offer | rejected
  date_applied DATE NOT NULL DEFAULT CURRENT_DATE,
  notes        TEXT,
  fit_score    INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- oauth_tokens — per-user Google refresh tokens from the Connect flow.
--
-- Without this, Gmail/Calendar could only ever use the single refresh token in
-- .env.local, i.e. one hardcoded mailbox for every user of the product.
-- Routes prefer a row here and fall back to the env token for local dev.
-- ---------------------------------------------------------------------------
CREATE TABLE oauth_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  provider      TEXT NOT NULL,                   -- 'google'
  refresh_token TEXT NOT NULL,
  scopes        TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

-- ---------------------------------------------------------------------------
-- briefings — one cached morning briefing per user per day.
-- ---------------------------------------------------------------------------
CREATE TABLE briefings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

-- Indexes for the queries the app actually runs.
CREATE INDEX idx_memories_user       ON memories(user_id, importance DESC);
CREATE INDEX idx_conversations_user  ON conversations(user_id, created_at DESC);
CREATE INDEX idx_tasks_user_status   ON tasks(user_id, status, priority DESC);
CREATE INDEX idx_agent_logs_user     ON agent_logs(user_id, created_at DESC);
CREATE INDEX idx_contacts_user       ON contacts(user_id);
CREATE INDEX idx_transactions_user   ON transactions(user_id, date DESC);
CREATE INDEX idx_invoices_user       ON invoices(user_id, status);
CREATE INDEX idx_job_apps_user       ON job_applications(user_id, date_applied DESC);
CREATE INDEX idx_oauth_user          ON oauth_tokens(user_id, provider);
CREATE INDEX idx_briefings_user      ON briefings(user_id, date DESC);

-- Sanity check: should return 12 rows.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

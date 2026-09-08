-- ============================================================================
-- ATLAS AI — ROW LEVEL SECURITY
-- ============================================================================
-- RUN THIS BEFORE YOU LET ANYONE ELSE USE ATLAS. Not optional for production.
--
-- WHY THIS MATTERS
-- ----------------------------------------------------------------------------
-- scripts/schema.sql deliberately leaves RLS off so the app works during
-- development. But NEXT_PUBLIC_SUPABASE_ANON_KEY is shipped to every browser —
-- that is what "NEXT_PUBLIC" means. With RLS disabled, anyone who opens dev
-- tools, copies that key, and calls the Supabase REST API directly can read and
-- write EVERY row in EVERY table: all users' memories, conversations, invoices
-- and contacts.
--
-- These policies close that. After running this:
--   - The anon key can only touch rows belonging to the signed-in user.
--   - The service_role key (server-side only) still bypasses RLS, so every API
--     route in this app keeps working unchanged.
--   - waitlist stays insert-only for the public, so the landing page form works
--     while nobody can read the email list back.
--
-- SAFE TO RE-RUN.
-- ============================================================================

-- user_id is TEXT and Supabase auth.uid() returns UUID, so compare as text.
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist         ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- users: you may only see and edit your own row.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users
  FOR ALL
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Per-user data tables: identical owner-only policy on each.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS memories_owner ON memories;
CREATE POLICY memories_owner ON memories
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS conversations_owner ON conversations;
CREATE POLICY conversations_owner ON conversations
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS tasks_owner ON tasks;
CREATE POLICY tasks_owner ON tasks
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS agent_logs_owner ON agent_logs;
CREATE POLICY agent_logs_owner ON agent_logs
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS contacts_owner ON contacts;
CREATE POLICY contacts_owner ON contacts
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS transactions_owner ON transactions;
CREATE POLICY transactions_owner ON transactions
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS invoices_owner ON invoices;
CREATE POLICY invoices_owner ON invoices
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS job_applications_owner ON job_applications;
CREATE POLICY job_applications_owner ON job_applications
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS briefings_owner ON briefings;
CREATE POLICY briefings_owner ON briefings
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- oauth_tokens: NO anon policy at all.
--
-- These are Google refresh tokens. Even the owning user's browser has no reason
-- to read them — only the server (service_role) ever touches this table. With
-- RLS enabled and no policy, the anon key is denied outright.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS oauth_tokens_owner ON oauth_tokens;

-- ---------------------------------------------------------------------------
-- waitlist: anyone may join, nobody may read.
--
-- Without the insert policy the public landing-page form breaks. Without
-- withholding SELECT, anyone could download your entire signup list.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS waitlist_public_insert ON waitlist;
CREATE POLICY waitlist_public_insert ON waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Verify. Every table should show rowsecurity = true.
-- ---------------------------------------------------------------------------
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

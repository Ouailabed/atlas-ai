import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 *
 * The original code used NEXT_PUBLIC_SUPABASE_ANON_KEY for server-side writes.
 * Anything prefixed NEXT_PUBLIC_ is bundled into the browser, so that key is
 * public by definition — it must never be the credential that authorises writes.
 *
 * This module is server-only. Never import it from a 'use client' component.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(url && serviceKey);

export const supabaseAdmin = isSupabaseConfigured
  ? createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/**
 * Throws a descriptive error instead of the cryptic "Cannot read properties of
 * null" you'd otherwise get when the env vars are missing.
 */
export function requireSupabase() {
  if (!supabaseAdmin) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY in .env.local, then restart the dev server.'
    );
  }
  return supabaseAdmin;
}

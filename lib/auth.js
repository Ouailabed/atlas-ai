import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from './supabase';

/**
 * Auth uses TWO different Supabase clients on purpose:
 *
 *   - This file's SSR client uses the ANON key plus the user's session cookie.
 *     That is correct: the anon key is the public client credential, and the
 *     session JWT is what identifies the user.
 *   - lib/supabase.js uses the SERVICE ROLE key for privileged writes. It
 *     bypasses RLS and must never reach the browser.
 *
 * Note: in Next.js 15 cookies() is async and must be awaited.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    }
  );
}

/**
 * The authenticated user, or null.
 *
 * Uses getUser() rather than getSession(): getSession() trusts the cookie as-is,
 * while getUser() revalidates the JWT against Supabase.
 */
export async function getSessionUser() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch (error) {
    console.error('[auth] getSessionUser failed:', error?.message || error);
    return null;
  }
}

/**
 * The user id every API route should scope its data to.
 *
 * Replaces the hardcoded 'default-user' that made all users share one dataset.
 * Returns null when unauthenticated so callers can return 401.
 */
export async function getUserId() {
  const user = await getSessionUser();
  return user?.id ?? null;
}

/** Standard 401 body. */
export function unauthorized() {
  return Response.json(
    { error: 'Not signed in', code: 'UNAUTHENTICATED' },
    { status: 401 }
  );
}

/**
 * Ensure a row exists in public.users for this auth user, and return it.
 * Supabase Auth stores users in auth.users; the app needs its own row for
 * plan/subscription data.
 */
export async function ensureUserRow(user) {
  if (!supabaseAdmin || !user) return null;

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name ?? null,
      plan: 'free',
    })
    .select()
    .single();

  if (error) {
    console.error('[auth] ensureUserRow failed:', error.message);
    return null;
  }
  return data;
}

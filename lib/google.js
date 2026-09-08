import { google } from 'googleapis';
import { supabaseAdmin } from './supabase';

/**
 * Shared Google OAuth for Gmail and Calendar.
 *
 * ONE OAuth client covers both — the scopes below are requested together, so
 * connecting once in Settings enables both agents.
 *
 * TOKEN RESOLUTION ORDER
 *   1. A per-user refresh token from the oauth_tokens table (the Connect flow
 *      in Settings). This is what makes the product multi-user.
 *   2. GOOGLE_REFRESH_TOKEN / GMAIL_REFRESH_TOKEN from .env.local — a single
 *      hardcoded account, useful for local development only. If this were the
 *      only path, every customer would be reading the same inbox.
 */

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
];

function clientId() {
  return process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
}
function clientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
}
function envRefreshToken() {
  return process.env.GOOGLE_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN;
}

export function googleAppConfigured() {
  return Boolean(clientId() && clientSecret());
}

export function redirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/auth/google/callback`;
}

export function oauthClient(redirect = redirectUri()) {
  return new google.auth.OAuth2(clientId(), clientSecret(), redirect);
}

/** The consent URL the Connect button sends the user to. */
export function consentUrl(state) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token even on repeat authorisation
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

/** Look up this user's stored Google refresh token. */
export async function getUserRefreshToken(userId) {
  if (!supabaseAdmin || !userId) return null;
  try {
    const { data } = await supabaseAdmin
      .from('oauth_tokens')
      .select('refresh_token, email')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle();
    return data || null;
  } catch (error) {
    console.error('[google] token lookup failed:', error?.message || error);
    return null;
  }
}

export async function saveUserRefreshToken(userId, refreshToken, email, scopes) {
  if (!supabaseAdmin) return { ok: false, error: 'Supabase not configured' };
  const { error } = await supabaseAdmin.from('oauth_tokens').upsert(
    {
      user_id: userId,
      provider: 'google',
      refresh_token: refreshToken,
      email: email || null,
      scopes: scopes || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  );
  if (error) {
    console.error('[google] token save failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function disconnectGoogle(userId) {
  if (!supabaseAdmin) return { ok: false };
  const { error } = await supabaseAdmin
    .from('oauth_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'google');
  return { ok: !error, error: error?.message };
}

/**
 * An authorised OAuth2 client for this user.
 * @returns {{ ok: boolean, auth?: object, reason?: string, source?: string }}
 */
export async function authorisedClient(userId) {
  if (!googleAppConfigured()) {
    return {
      ok: false,
      reason: 'GOOGLE_NOT_CONFIGURED',
      detail: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set in .env.local.',
    };
  }

  const stored = await getUserRefreshToken(userId);
  const token = stored?.refresh_token || envRefreshToken();

  if (!token) {
    return {
      ok: false,
      reason: 'NOT_CONNECTED',
      detail: 'This account has not connected Google yet. Connect it in Settings.',
    };
  }

  const auth = oauthClient();
  auth.setCredentials({ refresh_token: token });
  return { ok: true, auth, source: stored?.refresh_token ? 'user' : 'env', email: stored?.email };
}

/** Is Google usable for this user right now? Used by Settings and the registry. */
export async function googleStatus(userId) {
  if (!googleAppConfigured()) {
    return { configured: false, connected: false, reason: 'App OAuth credentials missing' };
  }
  const stored = await getUserRefreshToken(userId);
  if (stored?.refresh_token) {
    return { configured: true, connected: true, via: 'user', email: stored.email };
  }
  if (envRefreshToken()) {
    return { configured: true, connected: true, via: 'env', email: null };
  }
  return { configured: true, connected: false };
}

export function gmailFor(auth) {
  return google.gmail({ version: 'v1', auth });
}
export function calendarFor(auth) {
  return google.calendar({ version: 'v3', auth });
}

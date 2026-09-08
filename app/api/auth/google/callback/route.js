import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { oauthClient, saveUserRefreshToken, GOOGLE_SCOPES } from '@/lib/google';
import { getUserId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Google OAuth callback.
 *
 * Exchanges the authorisation code for a refresh token and stores it against
 * the signed-in user. The `state` parameter carries the user id from the start
 * of the flow and is compared against the current session — without that check,
 * a crafted callback URL could attach an attacker's mailbox to another account.
 */
function back(url, params) {
  const target = new URL('/settings', url.origin);
  Object.entries(params).forEach(([k, v]) => target.searchParams.set(k, v));
  return NextResponse.redirect(target);
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) return back(url, { google: 'error', reason: error });
  if (!code) return back(url, { google: 'error', reason: 'missing_code' });

  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.redirect(new URL('/login?redirect=/settings', url.origin));
    }

    // The flow must finish in the same session that started it.
    if (state !== userId) {
      console.error('[google/callback] state mismatch');
      return back(url, { google: 'error', reason: 'state_mismatch' });
    }

    const client = oauthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Google only returns a refresh token on first consent unless prompt=consent.
      return back(url, { google: 'error', reason: 'no_refresh_token' });
    }

    // Best-effort: record which Google account was connected.
    let email = null;
    try {
      client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const { data } = await oauth2.userinfo.get();
      email = data.email || null;
    } catch {
      /* non-fatal */
    }

    const saved = await saveUserRefreshToken(
      userId,
      tokens.refresh_token,
      email,
      GOOGLE_SCOPES.join(' ')
    );

    if (!saved.ok) return back(url, { google: 'error', reason: 'save_failed' });
    return back(url, { google: 'connected' });
  } catch (err) {
    console.error('[google/callback] exchange failed:', err?.message || err);
    return back(url, { google: 'error', reason: 'exchange_failed' });
  }
}

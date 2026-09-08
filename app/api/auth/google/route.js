import { NextResponse } from 'next/server';
import { consentUrl, googleAppConfigured, googleStatus, disconnectGoogle } from '@/lib/google';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Starts the Google Connect flow.
 *
 * GET  /api/auth/google          -> 302 to Google's consent screen
 * GET  /api/auth/google?status=1 -> JSON connection status (used by Settings)
 * DELETE                         -> disconnect
 *
 * The user id is passed through as `state` and verified in the callback, so a
 * token can only ever be written for the signed-in user.
 */
export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    if (new URL(request.url).searchParams.get('status')) {
      return Response.json(await googleStatus(userId));
    }

    if (!googleAppConfigured()) {
      return Response.json(
        {
          error: 'Google OAuth is not configured on this deployment.',
          detail: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.',
        },
        { status: 503 }
      );
    }

    return NextResponse.redirect(consentUrl(userId));
  } catch (error) {
    console.error('[auth/google] GET:', error);
    return Response.json({ error: 'Could not start Google connection' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const result = await disconnectGoogle(userId);
    return Response.json({ disconnected: result.ok, error: result.error });
  } catch (error) {
    console.error('[auth/google] DELETE:', error);
    return Response.json({ error: 'Could not disconnect' }, { status: 500 });
  }
}

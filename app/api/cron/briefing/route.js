import { supabaseAdmin } from '@/lib/supabase';
import { getOrCreateBriefing } from '@/lib/briefing';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Vercel Cron entry point — generates briefings ahead of the working day.
 *
 * Scheduled in vercel.json for 07:00 UTC, Mon-Fri.
 *
 * AUTH: this route is NOT session-authenticated (cron sends no cookie), so it
 * is guarded by a shared secret. Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET`; this also accepts BRIEFING_CRON_SECRET via the same header or
 * an `x-cron-secret` header for manual triggering.
 *
 * Without a configured secret the route refuses to run rather than defaulting
 * open — an unauthenticated endpoint that fans out model calls for every user
 * is a billing incident waiting to happen.
 */
function authorised(request) {
  const secret = process.env.BRIEFING_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return { ok: false, reason: 'NO_SECRET_CONFIGURED' };

  const header = request.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const alt = request.headers.get('x-cron-secret');

  if (bearer === secret || alt === secret) return { ok: true };
  return { ok: false, reason: 'INVALID_SECRET' };
}

export async function GET(request) {
  const auth = authorised(request);
  if (!auth.ok) {
    const status = auth.reason === 'NO_SECRET_CONFIGURED' ? 503 : 401;
    return Response.json(
      {
        error:
          status === 503
            ? 'BRIEFING_CRON_SECRET is not set. Refusing to run unauthenticated.'
            : 'Unauthorised',
      },
      { status }
    );
  }

  if (!supabaseAdmin) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    // Only users who finished onboarding and have briefings switched on.
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('onboarded', true)
      .eq('briefing_enabled', true);

    if (error) {
      console.error('[cron/briefing] user query failed:', error.message);
      return Response.json({ error: 'Could not load users' }, { status: 500 });
    }

    const targets = users || [];
    const results = { total: targets.length, generated: 0, skipped: 0, failed: 0 };

    // Sequential on purpose: parallel fan-out across every user would spike the
    // Groq rate limit and can exceed the function timeout.
    for (const user of targets) {
      try {
        const briefing = await getOrCreateBriefing(user.id);
        if (!briefing) results.failed += 1;
        else if (briefing.cached) results.skipped += 1;
        else results.generated += 1;
      } catch (err) {
        console.error(`[cron/briefing] failed for ${user.id}:`, err?.message || err);
        results.failed += 1;
      }
    }

    console.log('[cron/briefing]', JSON.stringify(results));
    return Response.json({ ok: true, ...results });
  } catch (error) {
    console.error('[cron/briefing] unhandled:', error);
    return Response.json({ error: 'Cron run failed' }, { status: 500 });
  }
}

import { getOrCreateBriefing } from '@/lib/briefing';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * GET  -> today's briefing (cached if already generated, otherwise generated now)
 * POST -> force regeneration, optionally with custom topics
 *
 * Cached per user per day, so loading the dashboard repeatedly does not burn
 * model calls.
 */
export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const briefing = await getOrCreateBriefing(userId);
    if (!briefing) {
      return Response.json(
        { error: 'Could not generate a briefing right now.' },
        { status: 503 }
      );
    }

    return Response.json(briefing);
  } catch (error) {
    console.error('[briefing] GET:', error);
    return Response.json({ error: 'Briefing request failed' }, { status: 500 });
  }
}

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const topics = Array.isArray(body.topics)
      ? body.topics.slice(0, 3).map((t) => String(t).slice(0, 100))
      : undefined;

    const briefing = await getOrCreateBriefing(userId, { force: true, topics });
    if (!briefing) {
      return Response.json(
        { error: 'Could not generate a briefing right now.' },
        { status: 503 }
      );
    }

    return Response.json(briefing);
  } catch (error) {
    console.error('[briefing] POST:', error);
    return Response.json({ error: 'Briefing request failed' }, { status: 500 });
  }
}

import { requireSupabase } from '@/lib/supabase';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Persists onboarding answers as memories and flips users.onboarded.
 *
 * The memory phrasing here is deliberate: lib/briefing.js reads the city back
 * with a "based in" prefix match, so these strings are a small contract between
 * the two files. Keep them in sync if you change either.
 */
export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const body = await request.json().catch(() => ({}));

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    const role = typeof body.role === 'string' ? body.role.trim().slice(0, 100) : '';
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 120) : '';
    const challenge = typeof body.challenge === 'string' ? body.challenge.trim().slice(0, 1000) : '';
    const priorities = Array.isArray(body.priorities)
      ? body.priorities.slice(0, 10).map((p) => String(p).slice(0, 40))
      : [];

    if (!name) return Response.json({ error: 'name is required' }, { status: 400 });

    const memories = [];
    const push = (content, type, importance, tags) =>
      memories.push({ user_id: userId, content, type, importance, tags });

    push(`The user's name is ${name}`, 'fact', 10, ['onboarding', 'identity']);
    if (role) push(`describes themselves as a ${role}`, 'fact', 9, ['onboarding', 'role']);
    if (city) push(`based in ${city}`, 'fact', 9, ['onboarding', 'location']);
    if (priorities.length) {
      push(
        `wants Atlas to prioritise: ${priorities.join(', ')}`,
        'preference',
        8,
        ['onboarding', 'priorities']
      );
    }
    if (challenge) {
      push(`Their biggest current challenge: ${challenge}`, 'goal', 9, ['onboarding', 'challenge']);
    }

    const { error: memError } = await supabase.from('memories').insert(memories);
    if (memError) {
      console.error('[onboarding] memory insert:', memError.message);
      return Response.json({ error: 'Could not save your answers' }, { status: 500 });
    }

    const { error: userError } = await supabase
      .from('users')
      .update({ name, onboarded: true, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (userError) {
      console.error('[onboarding] user update:', userError.message);
      return Response.json({ error: 'Could not complete onboarding' }, { status: 500 });
    }

    return Response.json({ success: true, memoriesSaved: memories.length });
  } catch (error) {
    console.error('[onboarding] POST:', error);
    return Response.json({ error: 'Onboarding failed' }, { status: 500 });
  }
}

export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const { data } = await supabase
      .from('users')
      .select('onboarded, name')
      .eq('id', userId)
      .maybeSingle();

    return Response.json({ onboarded: Boolean(data?.onboarded), name: data?.name || null });
  } catch (error) {
    console.error('[onboarding] GET:', error);
    return Response.json({ onboarded: false });
  }
}

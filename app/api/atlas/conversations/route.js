import { requireSupabase } from '@/lib/supabase';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/** Recent chat history, newest first, for the dashboard panel. */
export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const limit = Math.min(
      parseInt(new URL(request.url).searchParams.get('limit') || '10', 10) || 10,
      50
    );

    const { data, error } = await supabase
      .from('conversations')
      .select('id, role, content, agent, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ conversations: data || [] });
  } catch (error) {
    console.error('[conversations] GET:', error);
    return Response.json({ error: 'Could not load conversations' }, { status: 500 });
  }
}

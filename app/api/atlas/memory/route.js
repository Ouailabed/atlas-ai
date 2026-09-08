import { requireSupabase } from '@/lib/supabase';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/** Keyword relevance scoring — restored from the build guide, dropped in the handoff. */
function scoreByRelevance(rows, query, limit) {
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (!keywords.length) return rows.slice(0, limit);

  return rows
    .map((m) => {
      const content = String(m.content || '').toLowerCase();
      const score = keywords.reduce((acc, kw) => acc + (content.includes(kw) ? 1 : 0), 0);
      return { ...m, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || b.importance - a.importance)
    .slice(0, limit);
}

export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const type = searchParams.get('type');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100);

    let dbQuery = supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .order('importance', { ascending: false })
      .limit(query ? 50 : limit);

    if (type) dbQuery = dbQuery.eq('type', type);

    const { data, error } = await dbQuery;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const memories = query ? scoreByRelevance(data || [], query, limit) : data || [];
    return Response.json({ memories });
  } catch (error) {
    console.error('[memory] GET:', error);
    return Response.json({ error: 'Could not load memories' }, { status: 500 });
  }
}

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const body = await request.json().catch(() => ({}));
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return Response.json({ error: 'content is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('memories')
      .insert({
        user_id: userId,
        content: content.slice(0, 2000),
        type: body.type || 'fact',
        importance: Math.min(10, Math.max(1, Number(body.importance) || 5)),
        tags: Array.isArray(body.tags) ? body.tags.slice(0, 10) : [],
      })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ memory: data });
  } catch (error) {
    console.error('[memory] POST:', error);
    return Response.json({ error: 'Could not save memory' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    // Scope the delete to the owner so one user cannot delete another's rows.
    const { error } = await supabase
      .from('memories')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (error) {
    console.error('[memory] DELETE:', error);
    return Response.json({ error: 'Could not delete memory' }, { status: 500 });
  }
}

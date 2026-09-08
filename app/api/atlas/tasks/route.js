import { requireSupabase } from '@/lib/supabase';
import { chat } from '@/lib/groq';
import { parseJSONArray } from '@/lib/parseJSON';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const VALID_STATUS = ['pending', 'in_progress', 'done', 'cancelled'];

async function extractTasks(message) {
  const { ok, content } = await chat({
    messages: [
      {
        role: 'user',
        content:
          `Extract any tasks or action items from this message: "${message}"\n\n` +
          'Return a JSON array of objects with keys: title (string), ' +
          'description (string or null), priority (1-10), due_date (ISO 8601 string or null).\n' +
          'Return [] if there are no tasks. Return ONLY the JSON array.',
      },
    ],
    maxTokens: 300,
    temperature: 0.1,
    fast: true, // extraction only — smaller model, see lib/groq.js
  });

  if (!ok) return [];

  // Whitelist columns — never spread model output straight into an insert.
  return parseJSONArray(content)
    .filter((t) => t && typeof t.title === 'string' && t.title.trim())
    .slice(0, 10)
    .map((t) => {
      let dueDate = null;
      if (t.due_date) {
        const parsed = new Date(t.due_date);
        if (!Number.isNaN(parsed.getTime())) dueDate = parsed.toISOString();
      }
      return {
        title: String(t.title).slice(0, 500),
        description: t.description ? String(t.description).slice(0, 2000) : null,
        priority: Number.isFinite(Number(t.priority))
          ? Math.min(10, Math.max(1, Math.round(Number(t.priority))))
          : 5,
        due_date: dueDate,
      };
    });
}

export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const status = new URL(request.url).searchParams.get('status') || 'pending';

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', status)
      .order('priority', { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ tasks: data || [] });
  } catch (error) {
    console.error('[tasks] GET:', error);
    return Response.json({ error: 'Could not load tasks' }, { status: 500 });
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

    // Natural-language path: "remind me to call the bank on Friday"
    if (body.message) {
      const extracted = await extractTasks(body.message);
      if (!extracted.length) {
        return Response.json({ tasks: [], message: 'No tasks found in that message' });
      }
      const { data, error } = await supabase
        .from('tasks')
        .insert(extracted.map((t) => ({ ...t, user_id: userId, agent: 'tasks' })))
        .select();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ tasks: data });
    }

    // Structured path
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return Response.json({ error: 'title is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title: title.slice(0, 500),
        description: body.description ? String(body.description).slice(0, 2000) : null,
        priority: Math.min(10, Math.max(1, Number(body.priority) || 5)),
        due_date: body.due_date || null,
        agent: 'tasks',
      })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ task: data });
  } catch (error) {
    console.error('[tasks] POST:', error);
    return Response.json({ error: 'Could not create task' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const body = await request.json().catch(() => ({}));
    if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });

    const updates = { updated_at: new Date().toISOString() };
    if (body.status) {
      if (!VALID_STATUS.includes(body.status)) {
        return Response.json(
          { error: `status must be one of: ${VALID_STATUS.join(', ')}` },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }
    if (body.priority !== undefined) {
      updates.priority = Math.min(10, Math.max(1, Number(body.priority) || 5));
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', body.id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'Task not found' }, { status: 404 });
    return Response.json({ task: data });
  } catch (error) {
    console.error('[tasks] PATCH:', error);
    return Response.json({ error: 'Could not update task' }, { status: 500 });
  }
}

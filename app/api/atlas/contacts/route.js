import { requireSupabase } from '@/lib/supabase';
import { chat } from '@/lib/groq';
import { parseJSON } from '@/lib/parseJSON';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const RELATIONSHIPS = ['client', 'colleague', 'friend', 'family', 'professional', 'personal', 'other'];

function clean(value, max = 200) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Turn "remember that John Smith is my client at Acme" into contact fields. */
async function extractContact(text) {
  const { ok, content } = await chat({
    messages: [
      {
        role: 'user',
        content:
          `Extract contact details from: "${text}"\n\n` +
          'Return JSON with keys: name (string, required), email (string or null), ' +
          'phone (string or null), company (string or null), ' +
          `relationship (one of ${RELATIONSHIPS.join('|')} or null), notes (string or null).\n` +
          'Only use information actually present in the text — do not invent an email or ' +
          'phone number. Return ONLY the JSON object.',
      },
    ],
    maxTokens: 250,
    temperature: 0.1,
    fast: true, // extraction only — smaller model, see lib/groq.js
  });

  if (!ok) return null;
  const parsed = parseJSON(content);
  if (!parsed || !parsed.name) return null;
  return parsed;
}

/** The confirmation line Atlas reads back after saving. */
function confirmationFor(contact) {
  const bits = [`I've saved ${contact.name} as a contact.`];
  const detail = [];
  if (contact.relationship) detail.push(`your ${contact.relationship}`);
  if (contact.company) detail.push(`at ${contact.company}`);
  if (detail.length) bits.push(`${contact.name.split(' ')[0]} is ${detail.join(' ')}.`);
  if (contact.email) bits.push(`Email on file: ${contact.email}.`);
  bits.push('Anything else to note about them?');
  return bits.join(' ');
}

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    // ---- add ---------------------------------------------------------------
    if (action === 'add') {
      let fields = body;

      // Natural-language path from conversation.
      if (body.message && !body.name) {
        const extracted = await extractContact(body.message);
        if (!extracted) {
          return Response.json(
            { error: "Couldn't work out who to save. Try \"save John Smith, my client at Acme\"." },
            { status: 400 }
          );
        }
        fields = extracted;
      }

      const name = clean(fields.name);
      if (!name) return Response.json({ error: 'name is required' }, { status: 400 });

      const relationship = RELATIONSHIPS.includes(fields.relationship)
        ? fields.relationship
        : clean(fields.relationship, 50);

      const { data, error } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          name,
          email: clean(fields.email, 320),
          phone: clean(fields.phone, 50),
          company: clean(fields.company),
          relationship,
          notes: clean(fields.notes, 2000),
        })
        .select()
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ contact: data, confirmation: confirmationFor(data) });
    }

    // ---- search ------------------------------------------------------------
    if (action === 'search') {
      const query = clean(body.query);
      if (!query) return Response.json({ error: 'query is required' }, { status: 400 });

      // ilike on both name and company. Escape % and _ so they are literal.
      const safe = query.replace(/[%_]/g, (m) => `\\${m}`);
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .or(`name.ilike.%${safe}%,company.ilike.%${safe}%`)
        .limit(20);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ contacts: data || [], query });
    }

    // ---- update ------------------------------------------------------------
    if (action === 'update') {
      if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });

      const patch = {};
      for (const field of ['name', 'email', 'phone', 'company', 'relationship', 'notes']) {
        if (body[field] !== undefined) patch[field] = clean(body[field], field === 'notes' ? 2000 : 320);
      }
      if (!Object.keys(patch).length) {
        return Response.json({ error: 'No fields to update' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('contacts')
        .update(patch)
        .eq('id', body.id)
        .eq('user_id', userId)
        .select()
        .maybeSingle();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!data) return Response.json({ error: 'Contact not found' }, { status: 404 });
      return Response.json({ contact: data });
    }

    // ---- note (append) -----------------------------------------------------
    if (action === 'note') {
      const note = clean(body.note, 2000);
      if (!note) return Response.json({ error: 'note is required' }, { status: 400 });

      // Accept either an id or a name to look up.
      let target = null;
      if (body.id) {
        const { data } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', body.id)
          .eq('user_id', userId)
          .maybeSingle();
        target = data;
      } else if (body.name) {
        const safe = String(body.name).replace(/[%_]/g, (m) => `\\${m}`);
        const { data } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', userId)
          .ilike('name', `%${safe}%`)
          .limit(1);
        target = data?.[0] || null;
      }

      if (!target) return Response.json({ error: 'Contact not found' }, { status: 404 });

      const stamp = new Date().toISOString().split('T')[0];
      const appended = target.notes ? `${target.notes}\n[${stamp}] ${note}` : `[${stamp}] ${note}`;

      const { data, error } = await supabase
        .from('contacts')
        .update({ notes: appended.slice(0, 8000) })
        .eq('id', target.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({
        contact: data,
        confirmation: `Noted against ${data.name}.`,
      });
    }

    return Response.json(
      { error: "Invalid action. Use 'add', 'search', 'update' or 'note'." },
      { status: 400 }
    );
  } catch (error) {
    console.error('[contacts] POST:', error);
    return Response.json({ error: 'Contacts request failed' }, { status: 500 });
  }
}

export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const limit = Math.min(parseInt(new URL(request.url).searchParams.get('limit') || '100', 10) || 100, 200);

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ contacts: data || [], count: (data || []).length });
  } catch (error) {
    console.error('[contacts] GET:', error);
    return Response.json({ error: 'Could not load contacts' }, { status: 500 });
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

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (error) {
    console.error('[contacts] DELETE:', error);
    return Response.json({ error: 'Could not delete contact' }, { status: 500 });
  }
}

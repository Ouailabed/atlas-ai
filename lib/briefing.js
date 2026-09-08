import { supabaseAdmin } from './supabase';
import { chat } from './groq';
import { fetchTopicItems, fetchWeather } from './sources';

/**
 * Morning briefing generation.
 *
 * Lives in lib/ rather than the route so the cron job can call it directly for
 * many users without doing authenticated HTTP round-trips to its own API.
 */

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** Pull the user's city and role out of stored memories (saved during onboarding). */
async function getProfile(userId) {
  if (!supabaseAdmin) return { city: null, role: null, memories: [] };

  const { data } = await supabaseAdmin
    .from('memories')
    .select('content, type, importance')
    .eq('user_id', userId)
    .order('importance', { ascending: false })
    .limit(15);

  const memories = data || [];
  const find = (prefix) =>
    memories
      .find((m) => m.content?.toLowerCase().startsWith(prefix))
      ?.content?.slice(prefix.length)
      .replace(/^[:\s]+/, '')
      .trim() || null;

  return {
    city: find('based in'),
    role: find('works as') || find('describes themselves as'),
    memories,
  };
}

async function getTodaysTasks(userId) {
  if (!supabaseAdmin) return [];
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const { data } = await supabaseAdmin
    .from('tasks')
    .select('title, due_date, priority')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .or(`due_date.lte.${endOfDay.toISOString()},due_date.is.null`)
    .order('priority', { ascending: false })
    .limit(10);

  return data || [];
}

async function getUnpaidInvoices(userId) {
  if (!supabaseAdmin) return [];
  const { data } = await supabaseAdmin
    .from('invoices')
    .select('client_name, amount, due_date, status')
    .eq('user_id', userId)
    .eq('status', 'unpaid');
  return data || [];
}

/**
 * Build today's briefing. Returns { content, sources }.
 */
export async function generateBriefing(userId, { topics } = {}) {
  const [profile, tasks, invoices] = await Promise.all([
    getProfile(userId),
    getTodaysTasks(userId),
    getUnpaidInvoices(userId),
  ]);

  const newsTopics = topics?.length ? topics.slice(0, 3) : ['AI technology', 'UK economy'];
  const [newsItems, weather] = await Promise.all([
    Promise.all(newsTopics.map((t) => fetchTopicItems(t, 2))).then((r) => r.flat()),
    fetchWeather(profile.city),
  ]);

  const today = new Date();
  const overdue = invoices.filter(
    (i) => i.due_date && new Date(i.due_date) < new Date(today.toDateString())
  );
  const unpaidValue = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);

  const parts = [
    `Date: ${today.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })}`,
    profile.role ? `The user's role: ${profile.role}` : null,
    tasks.length
      ? `Pending tasks (${tasks.length}):\n${tasks
          .map((t) => `- ${t.title}${t.due_date ? ` (due ${t.due_date.split('T')[0]})` : ''}${t.priority >= 8 ? ' [urgent]' : ''}`)
          .join('\n')}`
      : 'Pending tasks: none.',
    invoices.length
      ? `Unpaid invoices: ${invoices.length} totalling £${unpaidValue.toFixed(2)}${
          overdue.length ? `, of which ${overdue.length} are OVERDUE` : ''
        }.`
      : 'Unpaid invoices: none.',
    weather
      ? `Weather in ${weather.city}: ${weather.description}, ${weather.temp}°C (feels like ${weather.feelsLike}°C), high ${weather.high}° low ${weather.low}°.`
      : 'Weather: not available — do not mention weather at all.',
    newsItems.length
      ? `News items:\n${newsItems.map((n) => `- [${n.topic}] ${n.text}`).join('\n')}`
      : 'News: nothing retrievable today — do not invent headlines.',
    profile.memories.length
      ? `What you know about them:\n${profile.memories
          .slice(0, 6)
          .map((m) => `- ${m.content}`)
          .join('\n')}`
      : null,
  ].filter(Boolean);

  const { ok, content } = await chat({
    messages: [
      {
        role: 'system',
        content:
          'You are Atlas writing a personal morning briefing. Warm, concise, useful — like a ' +
          'sharp assistant who has already read everything. Under 200 words.\n\n' +
          'Rules:\n' +
          '- Use ONLY the facts provided. Never invent weather, headlines, numbers or deadlines.\n' +
          '- If a section says data is unavailable, silently omit that section.\n' +
          '- Lead with what actually needs their attention today.\n' +
          '- End with one short, specific encouragement tied to their role or workload — ' +
          'not a generic motivational quote.\n' +
          '- No greeting boilerplate like "I hope this finds you well".',
      },
      { role: 'user', content: parts.join('\n\n') },
    ],
    maxTokens: 400,
    temperature: 0.6,
  });

  if (!ok) return null;

  return {
    content,
    sources: {
      tasks: tasks.length,
      invoices: invoices.length,
      overdueInvoices: overdue.length,
      newsItems: newsItems.length,
      weather: Boolean(weather),
      city: profile.city,
    },
  };
}

/** Today's cached briefing, or null. */
export async function getCachedBriefing(userId) {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('briefings')
    .select('*')
    .eq('user_id', userId)
    .eq('date', todayISO())
    .maybeSingle();
  return data || null;
}

export async function cacheBriefing(userId, content) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('briefings')
    .upsert({ user_id: userId, date: todayISO(), content }, { onConflict: 'user_id,date' })
    .select()
    .single();
  if (error) {
    console.error('[briefing] cache failed:', error.message);
    return null;
  }
  return data;
}

/** Cached-or-generate. `force` regenerates even if today's exists. */
export async function getOrCreateBriefing(userId, { force = false, topics } = {}) {
  if (!force) {
    const cached = await getCachedBriefing(userId);
    if (cached) return { content: cached.content, cached: true, date: cached.date };
  }

  const generated = await generateBriefing(userId, { topics });
  if (!generated) return null;

  await cacheBriefing(userId, generated.content);
  return { content: generated.content, cached: false, sources: generated.sources, date: todayISO() };
}

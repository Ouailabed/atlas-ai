import { requireSupabase } from '@/lib/supabase';
import { chat } from '@/lib/groq';
import { parseJSONArray } from '@/lib/parseJSON';
import { AGENTS, routeToAgents, liveAgents, plannedAgents, isAgentLive } from '@/lib/agents';
import { getUserId, unauthorized } from '@/lib/auth';
import { checkMessageQuota, planConfig } from '@/lib/plan';
import { guard } from '@/lib/rateLimit';
import { classifyAndExtract, formattingRules } from '@/lib/intent';

export const runtime = 'nodejs';

/* ------------------------------------------------------------------ context */

async function gatherContext(supabase, userId) {
  const [memories, history, recentTasks, invoices] = await Promise.all([
    supabase
      .from('memories')
      .select('content, type, importance')
      .eq('user_id', userId)
      .order('importance', { ascending: false })
      .limit(5),
    supabase
      .from('conversations')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('tasks')
      .select('title, due_date, priority')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('invoices')
      .select('client_name, amount, due_date')
      .eq('user_id', userId)
      .eq('status', 'unpaid'),
  ]);

  const today = new Date(new Date().toDateString());
  const overdue = (invoices.data || []).filter(
    (i) => i.due_date && new Date(i.due_date) < today
  );

  return {
    memories: memories.data || [],
    history: (history.data || []).reverse(),
    recentTasks: recentTasks.data || [],
    overdueInvoices: overdue,
  };
}

function renderContext({ memories, recentTasks, overdueInvoices }) {
  const blocks = [];

  if (memories.length) {
    blocks.push(`What you remember about them:\n${memories.map((m) => `- ${m.content}`).join('\n')}`);
  }
  if (recentTasks.length) {
    blocks.push(
      `Their most recent open tasks:\n${recentTasks
        .map((t) => `- ${t.title}${t.due_date ? ` (due ${t.due_date.split('T')[0]})` : ''}`)
        .join('\n')}`
    );
  }
  if (overdueInvoices.length) {
    const total = overdueInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
    blocks.push(
      `OVERDUE invoices (${overdueInvoices.length}, £${total.toFixed(2)} total):\n${overdueInvoices
        .map((i) => `- ${i.client_name}: £${Number(i.amount).toFixed(2)}, due ${i.due_date}`)
        .join('\n')}\nMention these only if relevant to what they asked.`
    );
  }

  return blocks.length ? `\n${blocks.join('\n\n')}\n` : '';
}

/* ------------------------------------------------------------ auto-persist */

/**
 * Save entities the user mentioned in passing — no explicit "save this" needed.
 * Everything is whitelisted before it reaches the database; model output never
 * gets spread into an insert.
 */
async function autoSave(supabase, userId, extraction) {
  const saved = { tasks: 0, contacts: 0, expenses: 0 };

  if (extraction.tasks.length) {
    const rows = extraction.tasks
      .filter((t) => t && typeof t.title === 'string' && t.title.trim())
      .map((t) => {
        let dueDate = null;
        if (t.due_date) {
          const d = new Date(t.due_date);
          if (!Number.isNaN(d.getTime())) dueDate = d.toISOString();
        }
        return {
          user_id: userId,
          title: String(t.title).slice(0, 500),
          priority: Number.isFinite(Number(t.priority))
            ? Math.min(10, Math.max(1, Math.round(Number(t.priority))))
            : 5,
          due_date: dueDate,
          agent: 'orchestrator',
        };
      });

    if (rows.length) {
      const { error } = await supabase.from('tasks').insert(rows);
      if (error) console.error('[orchestrator] auto-save tasks:', error.message);
      else saved.tasks = rows.length;
    }
  }

  if (extraction.contacts.length) {
    const rows = extraction.contacts
      .filter((c) => c && typeof c.name === 'string' && c.name.trim())
      .map((c) => ({
        user_id: userId,
        name: String(c.name).slice(0, 200),
        email: c.email ? String(c.email).slice(0, 320) : null,
        phone: c.phone ? String(c.phone).slice(0, 50) : null,
        company: c.company ? String(c.company).slice(0, 200) : null,
        relationship: c.relationship ? String(c.relationship).slice(0, 50) : null,
        notes: c.notes ? String(c.notes).slice(0, 2000) : null,
      }));

    if (rows.length) {
      const { error } = await supabase.from('contacts').insert(rows);
      if (error) console.error('[orchestrator] auto-save contacts:', error.message);
      else saved.contacts = rows.length;
    }
  }

  if (extraction.expenses.length) {
    const rows = extraction.expenses
      .filter((e) => e && Number.isFinite(Number(e.amount)))
      .map((e) => ({
        user_id: userId,
        amount: Math.abs(Number(e.amount)),
        type: e.type === 'income' ? 'income' : 'expense',
        category: e.category ? String(e.category).slice(0, 100) : null,
        description: e.description ? String(e.description).slice(0, 500) : null,
        date: new Date().toISOString().split('T')[0],
      }));

    if (rows.length) {
      const { error } = await supabase.from('transactions').insert(rows);
      if (error) console.error('[orchestrator] auto-save expenses:', error.message);
      else saved.expenses = rows.length;
    }
  }

  return saved;
}

/* --------------------------------------------------------------- memories */

async function extractMemories(supabase, userId, userMessage, atlasResponse) {
  const { ok, content } = await chat({
    messages: [
      {
        role: 'user',
        content:
          'Extract durable, long-term facts about the user from this exchange.\n' +
          `User said: "${userMessage}"\n` +
          `Atlas replied: "${atlasResponse}"\n\n` +
          'Return a JSON array of objects with keys: content (string), ' +
          'type (one of fact|preference|person|goal|event), importance (1-10).\n' +
          'Only genuinely reusable information. Return [] if there is nothing worth keeping.\n' +
          'Return ONLY the JSON array.',
      },
    ],
    maxTokens: 300,
    temperature: 0.1,
    fast: true, // extraction only — smaller model, see lib/groq.js
  });

  if (!ok) return 0;

  const rows = parseJSONArray(content)
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(0, 5)
    .map((m) => ({
      user_id: userId,
      content: String(m.content).slice(0, 2000),
      type: ['fact', 'preference', 'person', 'goal', 'event'].includes(m.type) ? m.type : 'fact',
      importance: Number.isFinite(Number(m.importance))
        ? Math.min(10, Math.max(1, Math.round(Number(m.importance))))
        : 5,
    }));

  if (!rows.length) return 0;

  const { error } = await supabase.from('memories').insert(rows);
  if (error) {
    console.error('[orchestrator] memory insert:', error.message);
    return 0;
  }
  return rows.length;
}

/* ------------------------------------------------------------- claim guard */

/**
 * Downgrade ✓ marks on actions the orchestrator cannot actually perform.
 *
 * WHY THIS EXISTS AS CODE AND NOT JUST A PROMPT RULE:
 * The system prompt already forbids ticking an invoice, calendar event or email.
 * In testing the model obeyed it about half the time — one run produced
 * "✓ Created a draft invoice for Sarah for £2,500" when zero invoice rows
 * existed. A claim that Atlas performed a financial action it did not perform is
 * the single worst output this product can produce, so it gets a deterministic
 * backstop rather than relying on instruction-following.
 *
 * The orchestrator only ever auto-persists tasks, contacts and transactions.
 * Everything else needs an explicit confirmed action elsewhere in the app.
 *
 * Deliberately biased toward under-claiming: a line like "✓ Added task: invoice
 * Sarah" gets downgraded too, even though the task really was saved. Losing a
 * tick on a real save is a cosmetic cost; leaving a tick on a fabricated
 * financial action is not.
 */
const CONFIRMATION_REQUIRED = /\b(invoice|invoiced|calendar|event|meeting|appointment|email|e-mail|sent|send|booked|booking|scheduled)\b/i;

export function sanitiseClaims(text) {
  if (typeof text !== 'string' || !text.includes('✓')) return text;

  return text
    .split('\n')
    .map((line) => {
      if (!line.includes('✓')) return line;
      if (!CONFIRMATION_REQUIRED.test(line)) return line;
      return line.replace(/✓\s*/g, '– ');
    })
    .join('\n');
}

/* ----------------------------------------------------------- system prompt */

function buildSystemPrompt(activeAgents, context, intent, autoSaved) {
  const live = liveAgents();
  const planned = plannedAgents();

  const liveList = live.map((k) => `- ${AGENTS[k].name}: ${AGENTS[k].description}`).join('\n');
  const plannedList = planned
    .map((k) => `- ${AGENTS[k].name} (needs ${AGENTS[k].needs || 'configuration'})`)
    .join('\n');

  const activePlanned = activeAgents.filter((a) => !isAgentLive(a));

  // Tell the model exactly what was already written, so it reports facts.
  const savedNotes = [];
  if (autoSaved.tasks) savedNotes.push(`${autoSaved.tasks} task(s)`);
  if (autoSaved.contacts) savedNotes.push(`${autoSaved.contacts} contact(s)`);
  if (autoSaved.expenses) savedNotes.push(`${autoSaved.expenses} transaction(s)`);

  return `You are Atlas, a personal AI assistant. Warm, direct, genuinely useful.

Working capabilities (${live.length}):
${liveList}

NOT built yet — you cannot perform these:
${plannedList}
${renderContext(context)}
## What YOU can write during this conversation

This is the single most important boundary in this prompt. In a chat reply you
can automatically persist exactly three things, and nothing else:

  - tasks
  - contacts
  - expenses / income transactions

Everything else a capability above can do — raising an invoice, creating a
calendar event, saving or sending an email — happens through a SEPARATE
confirmation step the user takes in the interface. You cannot trigger it, and it
has NOT happened just because you described it.

So for those: describe what you have prepared and offer it. Never mark it ✓ and
never say "created", "raised", "booked", "drafted into their account" or "sent".

  WRONG: "✓ Created a draft invoice for Sarah for £2,500."
  RIGHT: "I've noted the invoice for Sarah at Creative Agency, £2,500 for the
          logo project — say the word and I'll raise it for you to approve."

## Honesty rules — these override everything else

1. Only claim an action you actually took. Never invent confirmations, booking
   references, sent messages or reference numbers.
2. For a capability that is not built, say: "I can help you plan and draft this —
   to actually do it I'll need to connect to [the specific tool]. Want me to walk
   you through setting that up?"
3. If you are unsure whether something is connected, say you are unsure.
4. Reasoning, advice and drafting are genuinely valuable. Present them as what
   they are rather than dressing them up as completed work.
${
  savedNotes.length
    ? `\nSaved to their account before this reply — these are genuinely stored and ` +
      `are the ONLY things you may mark ✓ in this reply: ${savedNotes.join(', ')}.\n`
    : '\nNothing was auto-saved this turn. Do not mark anything ✓.\n'
}${
    activePlanned.length
      ? `\nThis message touches ${activePlanned
          .map((a) => AGENTS[a]?.name || a)
          .join(', ')}, which ${activePlanned.length === 1 ? 'is' : 'are'} NOT connected. ` +
        'Offer to plan or draft, and be explicit that you cannot execute it yet.\n'
      : ''
  }${formattingRules(intent, savedNotes)}`;
}

/* -------------------------------------------------------------------- route */

export async function POST(request) {
  const blocked = guard(request, 'orchestrator');
  if (blocked) return blocked;

  const requestStarted = Date.now();

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) return Response.json({ error: 'Message is required' }, { status: 400 });
    if (message.length > 8000) {
      return Response.json({ error: 'Message too long (max 8000 characters)' }, { status: 400 });
    }

    const quota = await checkMessageQuota(userId);
    if (!quota.allowed) {
      return Response.json(
        {
          error: quota.reason,
          code: 'QUOTA_EXCEEDED',
          plan: quota.plan,
          used: quota.used,
          limit: quota.limit,
        },
        { status: 402 }
      );
    }

    const supabase = requireSupabase();
    const activeAgents = routeToAgents(message);
    const today = new Date().toISOString().split('T')[0];

    // Classification and context gathering are independent — run them together.
    const [extraction, context] = await Promise.all([
      classifyAndExtract(message, today),
      gatherContext(supabase, userId),
    ]);

    // Persist entities BEFORE generating the reply, so Atlas can truthfully
    // confirm them rather than promising to do it.
    const autoSaved = await autoSave(supabase, userId, extraction);

    const plan = planConfig(quota.plan);
    const groqStarted = Date.now();
    const { ok, content, error } = await chat({
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(activeAgents, context, extraction.intent, autoSaved),
        },
        ...context.history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ],
      maxTokens: plan.priority ? 1500 : 1000,
      temperature: extraction.intent === 'smalltalk' ? 0.85 : 0.7,
    });
    const groqMs = Date.now() - groqStarted;

    if (!ok) {
      return Response.json(
        { error: 'Atlas could not reach its language model. Please try again.', detail: error },
        { status: 503 }
      );
    }

    // Deterministic backstop against fabricated action claims — see sanitiseClaims.
    const atlasResponse = sanitiseClaims(content);

    const { error: saveError } = await supabase.from('conversations').insert([
      { user_id: userId, role: 'user', content: message },
      { user_id: userId, role: 'assistant', content: atlasResponse, agent: activeAgents[0] },
    ]);
    if (saveError) console.error('[orchestrator] save conversation:', saveError.message);

    const memoriesSaved = await extractMemories(supabase, userId, message, atlasResponse);

    /*
     * Thinking log — what was decided and how long it took. This is the record
     * you read when a reply looks wrong: which intent was detected, which agents
     * fired, what context was in scope, and where the latency went.
     */
    const thinking = {
      intent: extraction.intent,
      agents: activeAgents,
      liveAgents: activeAgents.filter(isAgentLive),
      context: {
        memories: context.memories.length,
        recentTasks: context.recentTasks.length,
        overdueInvoices: context.overdueInvoices.length,
        historyTurns: context.history.length,
      },
      autoSaved,
      memoriesSaved,
      timings: {
        classificationMs: extraction.ms,
        groqMs,
        totalMs: Date.now() - requestStarted,
      },
      classificationFailed: extraction.failed || undefined,
    };

    const { error: logError } = await supabase.from('agent_logs').insert({
      user_id: userId,
      agent: activeAgents.join(', '),
      action: `[${extraction.intent}] ${message.slice(0, 160)}`,
      result: JSON.stringify(thinking).slice(0, 2000),
      success: true,
    });
    if (logError) console.error('[orchestrator] agent log:', logError.message);

    return Response.json({
      response: atlasResponse,
      agents: activeAgents,
      agentNames: activeAgents.map((a) => AGENTS[a]?.name || a),
      agentStatus: Object.fromEntries(
        activeAgents.map((a) => [a, isAgentLive(a) ? 'live' : 'planned'])
      ),
      intent: extraction.intent,
      autoSaved,
      memoriesSaved,
      timings: thinking.timings,
      quota: { plan: quota.plan, used: quota.used + 1, limit: quota.limit },
    });
  } catch (error) {
    console.error('[orchestrator] unhandled:', error);
    return Response.json(
      { error: 'Atlas encountered an error. Please try again.' },
      { status: 500 }
    );
  }
}

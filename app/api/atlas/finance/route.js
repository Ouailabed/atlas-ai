import { requireSupabase } from '@/lib/supabase';
import { chat } from '@/lib/groq';
import { parseJSON } from '@/lib/parseJSON';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [txResult, invResult] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .gte('date', since.toISOString().split('T')[0]),
      supabase.from('invoices').select('*').eq('user_id', userId).eq('status', 'unpaid'),
    ]);

    if (txResult.error) console.error('[finance] transactions:', txResult.error.message);
    if (invResult.error) console.error('[finance] invoices:', invResult.error.message);

    const tx = txResult.data || [];
    const inv = invResult.data || [];

    const sum = (rows) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const income = sum(tx.filter((t) => t.type === 'income'));
    const expenses = sum(tx.filter((t) => t.type === 'expense'));
    const unpaidInvoices = sum(inv);

    const summary = {
      income,
      expenses,
      net: income - expenses,
      unpaidInvoices,
      invoiceCount: inv.length,
      transactionCount: tx.length,
    };

    // No data yet: skip the model call rather than asking it to comment on zeroes.
    if (tx.length === 0 && inv.length === 0) {
      return Response.json({
        summary,
        insight: 'No transactions recorded in the last 30 days. Tell Atlas about a purchase — for example "I spent £45 on lunch" — and it will start tracking.',
      });
    }

    const { ok, content } = await chat({
      messages: [
        {
          role: 'system',
          content:
            'You are the Atlas Finance Agent. Give a concise, factual 2-3 sentence read on this ' +
            'data. Do not invent numbers beyond what is given. Do not give regulated investment advice.',
        },
        {
          role: 'user',
          content:
            `Last 30 days — income: £${income.toFixed(2)}, expenses: £${expenses.toFixed(2)}, ` +
            `net: £${(income - expenses).toFixed(2)}, unpaid invoices: £${unpaidInvoices.toFixed(2)} ` +
            `across ${inv.length} invoice(s).`,
        },
      ],
      maxTokens: 200,
      temperature: 0.4,
    });

    return Response.json({
      summary,
      insight: ok ? content : 'Financial summary is available; the written insight could not be generated right now.',
    });
  } catch (error) {
    console.error('[finance] GET:', error);
    return Response.json({ error: 'Could not load finances' }, { status: 500 });
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
    const { action } = body;

    if (action === 'add-transaction') {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount)) {
        return Response.json({ error: 'amount must be a number' }, { status: 400 });
      }
      if (!['income', 'expense'].includes(body.type)) {
        return Response.json({ error: "type must be 'income' or 'expense'" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          amount,
          type: body.type,
          category: body.category || null,
          description: body.description || null,
          date: body.date || new Date().toISOString().split('T')[0],
        })
        .select()
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ transaction: data });
    }

    if (action === 'parse-expense') {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return Response.json({ error: 'text is required' }, { status: 400 });

      const { ok, content } = await chat({
        messages: [
          {
            role: 'user',
            content:
              `Parse this into a transaction: "${text}"\n\n` +
              'Return JSON with keys: amount (number), type ("income" or "expense"), ' +
              'category (string), description (string), date ("YYYY-MM-DD" or null).\n' +
              'Return ONLY the JSON object.',
          },
        ],
        maxTokens: 150,
        temperature: 0.1,
        fast: true, // extraction only — smaller model, see lib/groq.js
      });

      if (!ok) return Response.json({ error: 'Could not parse that expense' }, { status: 503 });

      const parsed = parseJSON(content);
      const amount = Number(parsed?.amount);
      if (!parsed || !Number.isFinite(amount)) {
        return Response.json(
          { error: 'Could not work out an amount from that. Try "I spent £45 on lunch".' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          amount: Math.abs(amount),
          type: parsed.type === 'income' ? 'income' : 'expense',
          category: parsed.category ? String(parsed.category).slice(0, 100) : null,
          description: parsed.description ? String(parsed.description).slice(0, 500) : text.slice(0, 500),
          date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || '')
            ? parsed.date
            : new Date().toISOString().split('T')[0],
        })
        .select()
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ transaction: data });
    }

    if (action === 'create-invoice') {
      const amount = Number(body.amount);
      const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : '';
      if (!clientName) return Response.json({ error: 'clientName is required' }, { status: 400 });
      if (!Number.isFinite(amount)) {
        return Response.json({ error: 'amount must be a number' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          user_id: userId,
          client_name: clientName.slice(0, 200),
          amount,
          due_date: body.dueDate || null,
          description: body.description || null,
        })
        .select()
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Draft covering text. Restored from the build guide; the handoff dropped it.
      // This is a DRAFT only — Atlas does not send it anywhere.
      const { ok, content } = await chat({
        messages: [
          {
            role: 'user',
            content:
              `Write a short, professional invoice email to ${clientName} for £${amount}. ` +
              `Due: ${body.dueDate || 'on receipt'}. Work: ${body.description || 'services rendered'}. ` +
              'Friendly and direct. No preamble.',
          },
        ],
        maxTokens: 300,
        temperature: 0.5,
      });

      return Response.json({
        invoice: data,
        draftMessage: ok ? content : null,
        note: 'This is a draft for you to review. Atlas has not sent it.',
      });
    }

    return Response.json(
      { error: "Invalid action. Use 'add-transaction', 'parse-expense' or 'create-invoice'." },
      { status: 400 }
    );
  } catch (error) {
    console.error('[finance] POST:', error);
    return Response.json({ error: 'Finance request failed' }, { status: 500 });
  }
}

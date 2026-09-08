import { requireSupabase } from '@/lib/supabase';
import { chat } from '@/lib/groq';
import { parseJSON } from '@/lib/parseJSON';
import { getUserId, unauthorized } from '@/lib/auth';
import { authorisedClient } from '@/lib/google';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const STATUSES = ['unpaid', 'paid', 'overdue'];

function isOverdue(invoice) {
  return (
    invoice.status === 'unpaid' &&
    invoice.due_date &&
    new Date(invoice.due_date) < new Date(new Date().toDateString())
  );
}

function decorate(invoice) {
  return { ...invoice, overdue: isOverdue(invoice) };
}

/** Parse "invoice Sarah £2000 for the website project due next Friday". */
async function parseInvoice(text) {
  const today = new Date().toISOString().split('T')[0];
  const { ok, content } = await chat({
    messages: [
      {
        role: 'user',
        content:
          `Today is ${today}. Parse this invoice instruction: "${text}"\n\n` +
          'Return JSON with keys: client_name (string), amount (number), ' +
          'due_date ("YYYY-MM-DD" or null), description (string or null).\n' +
          'Resolve relative dates like "next Friday" against today. ' +
          'Do not invent an amount or client. Return ONLY the JSON object.',
      },
    ],
    maxTokens: 200,
    temperature: 0.1,
    fast: true, // extraction only — smaller model, see lib/groq.js
  });

  if (!ok) return null;
  const parsed = parseJSON(content);
  if (!parsed || !parsed.client_name || !Number.isFinite(Number(parsed.amount))) return null;
  return parsed;
}

async function draftText(prompt, maxTokens = 400) {
  const { ok, content } = await chat({
    messages: [
      {
        role: 'system',
        content:
          'You write short, professional business correspondence. No preamble, no ' +
          'meta-commentary. Do not invent facts — use [ADD: ...] where detail is missing.',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens,
    temperature: 0.5,
  });
  return ok ? content : null;
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

    // ---- create (confirmation required) ------------------------------------
    if (action === 'create') {
      let fields = body;

      if (body.message && !body.clientName) {
        const parsed = await parseInvoice(body.message);
        if (!parsed) {
          return Response.json(
            {
              error:
                "Couldn't parse that. Try \"invoice Sarah £2000 for the website project due next Friday\".",
            },
            { status: 400 }
          );
        }
        fields = {
          clientName: parsed.client_name,
          amount: parsed.amount,
          dueDate: parsed.due_date,
          description: parsed.description,
        };
      }

      const clientName =
        typeof fields.clientName === 'string' ? fields.clientName.trim().slice(0, 200) : '';
      const amount = Number(fields.amount);

      if (!clientName) return Response.json({ error: 'clientName is required' }, { status: 400 });
      if (!Number.isFinite(amount) || amount <= 0) {
        return Response.json({ error: 'amount must be a positive number' }, { status: 400 });
      }

      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(fields.dueDate || '') ? fields.dueDate : null;
      const preview = {
        client_name: clientName,
        amount,
        due_date: dueDate,
        description: fields.description ? String(fields.description).slice(0, 1000) : null,
      };

      // Show the parsed summary before writing anything.
      if (body.confirm !== true) {
        return Response.json(
          {
            requiresConfirmation: true,
            code: 'CONFIRMATION_REQUIRED',
            preview,
            summary:
              `Invoice to ${clientName} for £${amount.toFixed(2)}` +
              `${dueDate ? `, due ${dueDate}` : ''}` +
              `${preview.description ? ` — ${preview.description}` : ''}.`,
            note: 'Nothing saved yet. Resend with confirm: true to create it.',
          },
          { status: 428 }
        );
      }

      const { data, error } = await supabase
        .from('invoices')
        .insert({ user_id: userId, ...preview })
        .select()
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });

      const invoiceText = await draftText(
        `Write a professional invoice email to ${clientName} for £${amount.toFixed(2)}. ` +
          `Due: ${dueDate || 'on receipt'}. Work: ${preview.description || 'services rendered'}.`
      );

      // Only offer to email it if Google is actually connected for this user.
      const google = await authorisedClient(userId);

      return Response.json({
        invoice: decorate(data),
        draftEmail: invoiceText,
        canEmail: google.ok,
        followUp: google.ok
          ? `Want me to send ${clientName} the invoice by email?`
          : 'Connect Gmail in Settings if you want Atlas to email invoices for you.',
      });
    }

    // ---- list --------------------------------------------------------------
    if (action === 'list') {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) return Response.json({ error: error.message }, { status: 500 });

      const invoices = (data || []).map(decorate);
      return Response.json({
        invoices,
        summary: {
          total: invoices.length,
          unpaid: invoices.filter((i) => i.status === 'unpaid').length,
          overdue: invoices.filter((i) => i.overdue).length,
          unpaidValue: invoices
            .filter((i) => i.status === 'unpaid')
            .reduce((s, i) => s + Number(i.amount || 0), 0),
        },
      });
    }

    // ---- mark paid ---------------------------------------------------------
    if (action === 'mark-paid') {
      if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });

      const { data, error } = await supabase
        .from('invoices')
        .update({ status: 'paid' })
        .eq('id', body.id)
        .eq('user_id', userId)
        .select()
        .maybeSingle();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!data) return Response.json({ error: 'Invoice not found' }, { status: 404 });
      return Response.json({ invoice: decorate(data) });
    }

    // ---- reminder draft ----------------------------------------------------
    if (action === 'send-reminder') {
      if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });

      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', body.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

      const overdue = isOverdue(invoice);
      const draft = await draftText(
        `Write a polite payment reminder to ${invoice.client_name} for an invoice of ` +
          `£${Number(invoice.amount).toFixed(2)}${invoice.due_date ? `, due ${invoice.due_date}` : ''}. ` +
          `${overdue ? 'It is now overdue — firm but courteous, not aggressive.' : 'It is not yet overdue — a gentle nudge.'} ` +
          `Work: ${invoice.description || 'services rendered'}.`
      );

      const google = await authorisedClient(userId);

      // Draft only. Sending goes through the email route, which needs confirm:true.
      return Response.json({
        invoice: decorate(invoice),
        draft,
        canEmail: google.ok,
        note: google.ok
          ? 'This is a draft. Send it via the email agent with confirm: true once you have reviewed it.'
          : 'This is a draft. Connect Gmail in Settings to send it from Atlas.',
      });
    }

    // ---- overdue sweep -----------------------------------------------------
    if (action === 'overdue') {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'unpaid')
        .order('due_date', { ascending: true });

      if (error) return Response.json({ error: error.message }, { status: 500 });

      const overdue = (data || []).filter(isOverdue);
      if (!overdue.length) {
        return Response.json({ overdue: [], count: 0, message: 'Nothing overdue.' });
      }

      // Cap the model calls — a big backlog should not fan out unbounded.
      const withDrafts = await Promise.all(
        overdue.slice(0, 10).map(async (invoice) => ({
          invoice: decorate(invoice),
          draft: await draftText(
            `Write a polite but firm overdue payment chaser to ${invoice.client_name} for ` +
              `£${Number(invoice.amount).toFixed(2)}, which was due ${invoice.due_date}. ` +
              `Work: ${invoice.description || 'services rendered'}.`,
            300
          ),
        }))
      );

      return Response.json({
        overdue: withDrafts,
        count: overdue.length,
        totalValue: overdue.reduce((s, i) => s + Number(i.amount || 0), 0),
        note: 'Drafts only — nothing has been sent.',
      });
    }

    return Response.json(
      {
        error:
          "Invalid action. Use 'create', 'list', 'send-reminder', 'mark-paid' or 'overdue'.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('[invoice] POST:', error);
    return Response.json({ error: 'Invoice request failed' }, { status: 500 });
  }
}

export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const invoices = (data || []).map(decorate);
    return Response.json({
      invoices,
      summary: {
        total: invoices.length,
        unpaid: invoices.filter((i) => i.status === 'unpaid').length,
        overdue: invoices.filter((i) => i.overdue).length,
        unpaidValue: invoices
          .filter((i) => i.status === 'unpaid')
          .reduce((s, i) => s + Number(i.amount || 0), 0),
      },
    });
  } catch (error) {
    console.error('[invoice] GET:', error);
    return Response.json({ error: 'Could not load invoices' }, { status: 500 });
  }
}

export { STATUSES };

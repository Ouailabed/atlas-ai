import { chat } from './groq';
import { parseJSON } from './parseJSON';

/**
 * Single-pass intent classification + entity extraction.
 *
 * Deliberately ONE model call rather than four. Classifying intent, then
 * extracting tasks, then contacts, then expenses would quadruple both latency
 * and cost on every message.
 */

export const INTENTS = ['question', 'command', 'information', 'smalltalk'];

const EXTRACTION_PROMPT = `Analyse the user's message and return JSON only.

{
  "intent": "question" | "command" | "information" | "smalltalk",
  "tasks": [{ "title": string, "priority": 1-10, "due_date": "YYYY-MM-DD" | null }],
  "contacts": [{ "name": string, "email": string|null, "phone": string|null, "company": string|null, "relationship": string|null, "notes": string|null }],
  "expenses": [{ "amount": number, "type": "income"|"expense", "category": string|null, "description": string|null }]
}

Intent definitions:
- "question": asking for information or an answer
- "command": instructing Atlas to do or record something
- "information": stating a fact about themselves or their world, with no request
- "smalltalk": greeting, thanks, chit-chat

Extraction rules — be conservative:
- Only extract a task if the user genuinely wants something tracked. Hypotheticals and questions about tasks are NOT tasks.
- Only extract a contact if a specific PERSON is being described to remember. Never extract the user themselves.
- Never invent emails, phone numbers, amounts or dates that are not in the message.
- Empty arrays are correct and expected for most messages.

Money — read carefully, this is the easiest thing to get wrong:
- Extract a transaction ONLY for money that has ALREADY MOVED. "I spent £85 at
  Waitrose" is an expense. "I got paid £500" is income.
- An amount the user intends to INVOICE, is OWED, expects, quoted, or plans to
  charge has NOT moved. It is NOT income. Do not extract it.
    "invoice Sarah £2,500 for the logo"  -> expenses: []  (no transaction at all)
    "Marcus owes me £1,800"              -> expenses: []
    "I spent £30 at Pret and need to invoice Priya £3,200"
                                         -> ONLY the £30 expense
- Recording unearned money as income corrupts the user's real financial position.
  When in doubt, extract nothing.
- "How much did I spend?" is a question, not a transaction.

Return ONLY the JSON object.`;

export async function classifyAndExtract(message, today) {
  const started = Date.now();

  const { ok, content } = await chat({
    messages: [
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: `Today is ${today}.\n\nMessage: "${message}"` },
    ],
    maxTokens: 500,
    temperature: 0.1,
    fast: true, // extraction only — smaller model, see lib/groq.js
  });

  const elapsed = Date.now() - started;

  if (!ok) {
    return { intent: 'question', tasks: [], contacts: [], expenses: [], ms: elapsed, failed: true };
  }

  const parsed = parseJSON(content);
  if (!parsed || typeof parsed !== 'object') {
    return { intent: 'question', tasks: [], contacts: [], expenses: [], ms: elapsed, failed: true };
  }

  const arr = (v) => (Array.isArray(v) ? v : []);

  return {
    intent: INTENTS.includes(parsed.intent) ? parsed.intent : 'question',
    // Caps stop one odd message from writing dozens of rows.
    tasks: arr(parsed.tasks).slice(0, 5),
    contacts: arr(parsed.contacts).slice(0, 3),
    expenses: arr(parsed.expenses).slice(0, 5),
    ms: elapsed,
    failed: false,
  };
}

/**
 * Per-intent response shaping, appended to the system prompt.
 *
 * `savedNotes` is the list of things actually written to the database this turn.
 * The ✓ rule is derived from it rather than stated in general terms: an
 * unconditional "prefix completed actions with ✓" instruction competes with the
 * honesty rules and loses — in testing the model ✓'d an invoice it had not
 * created. Enumerating exactly what may carry a ✓ removes the ambiguity.
 */
export function formattingRules(intent, savedNotes = []) {
  const shared =
    '\n## Response formatting\n' +
    '- Any list of three or more items goes in bullet points.\n' +
    '- Never open with filler such as "Certainly" or "Great question".\n';

  const tickRule = savedNotes.length
    ? `- Use the ✓ symbol ONLY for these exact items, which are genuinely saved: ${savedNotes.join(
        ', '
      )}.\n` +
      '- Every other line MUST begin with "–" (en dash), never ✓, and must use offering\n' +
      '  language: "I\'ve noted…", "ready to…", "say the word and I\'ll…".\n' +
      '- Do not use ✓ for an invoice, calendar event or email under any circumstances.\n'
    : '- Nothing was saved this turn. Do NOT use the ✓ symbol anywhere in this reply.\n';

  const perIntent = {
    question:
      '- This is a QUESTION. Answer it directly in the first sentence, then add detail only if it helps.\n' +
      '- If you are not confident, say so rather than guessing.\n',
    command:
      '- This is a COMMAND. State plainly what happened, in past tense.\n' +
      tickRule +
      '- If you could NOT do something because it needs confirmation or is not connected,\n' +
      '  say so plainly rather than implying it is done.\n',
    information:
      '- The user is TELLING you something. Acknowledge briefly, confirm what you have stored, and do not lecture.\n' +
      '- Two sentences is usually plenty.\n',
    smalltalk:
      '- This is SMALLTALK. Match their energy and keep it short — one or two lines.\n' +
      '- Do not force a productivity suggestion into a casual exchange.\n',
  };

  return shared + (perIntent[intent] || perIntent.question);
}

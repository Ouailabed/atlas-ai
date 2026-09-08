import Groq from 'groq-sdk';

const apiKey = process.env.GROQ_API_KEY;

export const isGroqConfigured = Boolean(apiKey);

/**
 * MODEL CHOICE — read this before changing it.
 *
 * Both original build documents specified `llama-3.3-70b-versatile`. That model
 * is NOT available on this Groq account (404 model_not_found) — the Llama line
 * has been retired here. Verified-working chat models on this key:
 *
 *   openai/gpt-oss-120b   most capable        ~500ms
 *   openai/gpt-oss-20b    faster, cheaper     ~330ms
 *   qwen/qwen3.6-27b      leaks <think> tags into content — do NOT use
 *   groq/compound         agentic, built-in web search  ~2.3s
 *
 * Override without touching code via GROQ_MODEL / GROQ_FAST_MODEL in .env.local.
 *
 * REASONING_EFFORT IS LOAD-BEARING — do not remove it.
 * The gpt-oss models emit reasoning tokens that count against max_tokens. At
 * max_tokens: 300 with default effort, 298 tokens went to reasoning and
 * `content` came back EMPTY with finish_reason "length" — which would have made
 * every JSON extraction (tasks, contacts, expenses, memories) silently fall back
 * and save nothing. With 'low', the same call uses ~61 reasoning tokens and
 * returns clean output.
 */
export const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
export const FAST_MODEL = process.env.GROQ_FAST_MODEL || 'openai/gpt-oss-20b';

export const groq = isGroqConfigured ? new Groq({ apiKey }) : null;

export function requireGroq() {
  if (!groq) {
    throw new Error(
      'Groq is not configured. Set GROQ_API_KEY in .env.local, then restart the dev server.'
    );
  }
  return groq;
}

/**
 * Chat completion with a guaranteed-string return and no unhandled rejection.
 * Returns { ok, content, error } so route handlers can degrade gracefully.
 *
 * @param {object}  opts
 * @param {Array}   opts.messages
 * @param {number}  opts.maxTokens
 * @param {number}  opts.temperature
 * @param {boolean} opts.fast    use the smaller model (extraction/classification)
 * @param {string}  opts.effort  reasoning effort: 'low' | 'medium' | 'high'
 */
export async function chat({
  messages,
  maxTokens = 1000,
  temperature = 0.7,
  fast = false,
  effort = 'low',
}) {
  const model = fast ? FAST_MODEL : MODEL;

  try {
    const client = requireGroq();
    const completion = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      reasoning_effort: effort,
    });

    const choice = completion.choices?.[0];
    const content = choice?.message?.content ?? '';

    /*
     * Surface the empty-content case loudly rather than returning '' and letting
     * the caller treat it as a valid answer. This is precisely the failure that
     * reasoning_effort prevents; if it ever reappears we want to see it.
     */
    if (!content.trim()) {
      const reasoningTokens =
        completion.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      console.error(
        `[groq] empty content from ${model} ` +
          `(finish_reason=${choice?.finish_reason}, reasoning_tokens=${reasoningTokens}, ` +
          `max_tokens=${maxTokens}). Raise max_tokens or lower reasoning effort.`
      );
      return {
        ok: false,
        content: '',
        error: 'Model returned no content (token budget exhausted by reasoning)',
      };
    }

    return { ok: true, content };
  } catch (error) {
    console.error(`[groq] completion failed on ${model}:`, error?.message || error);
    return { ok: false, content: '', error: error?.message || 'Groq request failed' };
  }
}

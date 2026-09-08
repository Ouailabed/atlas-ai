/**
 * Parse JSON out of an LLM response.
 *
 * Llama routinely wraps JSON in ```json fences, adds a preamble, or emits
 * trailing prose. The original code called JSON.parse() on the raw string, so
 * every extraction silently fell into a catch block and returned [].
 *
 * Returns `fallback` instead of throwing, so callers never crash on bad output.
 */
export function parseJSON(text, fallback = null) {
  if (typeof text !== 'string') return fallback;

  let clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // If the model added prose around the JSON, grab the outermost {...} or [...].
  if (clean && clean[0] !== '{' && clean[0] !== '[') {
    const match = clean.match(/[[{][\s\S]*[\]}]/);
    if (match) clean = match[0];
  }

  try {
    return JSON.parse(clean);
  } catch {
    return fallback;
  }
}

/** parseJSON that guarantees an array back. */
export function parseJSONArray(text) {
  const parsed = parseJSON(text, []);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Minimal in-memory rate limiter.
 *
 * LIMITATION — read this before relying on it in production:
 * State lives in the memory of one process. On Vercel (and any multi-instance
 * host) each serverless instance keeps its own Map, so the effective limit is
 * roughly N_instances x limit, and a cold start resets the window. This stops
 * casual abuse and runaway loops; it is NOT a defence against a determined
 * attacker. Move to Upstash Redis or Vercel KV before launch.
 */

const buckets = new Map();

// Stop the Map growing without bound on a long-lived server.
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = Date.now();

function sweep(now) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    if (!hits.length || now - hits[hits.length - 1] > 300_000) buckets.delete(key);
  }
}

/**
 * @returns {{ allowed: boolean, remaining: number, retryAfter: number }}
 */
export function rateLimit(key, { limit = 100, windowMs = 60_000 } = {}) {
  const now = Date.now();
  sweep(now);

  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000);
    buckets.set(key, hits);
    return { allowed: false, remaining: 0, retryAfter: Math.max(retryAfter, 1) };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, remaining: limit - hits.length, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers. */
export function clientIp(request) {
  const h = request.headers;
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return h.get('x-real-ip') || h.get('cf-connecting-ip') || 'unknown';
}

export const LIMITS = {
  orchestrator: { limit: 30, windowMs: 60_000 },
  standard: { limit: 100, windowMs: 60_000 },
};

/**
 * Guard a route. Returns a 429 Response when the caller is over budget,
 * or null when the request should proceed.
 */
export function enforceRateLimit(request, scope = 'standard') {
  const config = LIMITS[scope] || LIMITS.standard;
  const { allowed, remaining, retryAfter } = rateLimit(
    `${scope}:${clientIp(request)}`,
    config
  );

  if (!allowed) {
    return Response.json(
      { error: 'Too many requests', retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  return null;
}

/**
 * CORS. In production only the configured app origin may call the API from a
 * browser; in development anything goes so localhost ports don't fight you.
 *
 * Note: this blocks browser cross-origin calls, not curl or a server-side
 * client. Auth and rate limiting are what actually protect the endpoints.
 */
export function corsCheck(request) {
  if (process.env.NODE_ENV !== 'production') return null;

  const origin = request.headers.get('origin');
  if (!origin) return null; // same-origin or non-browser client

  const allowed = [process.env.NEXT_PUBLIC_APP_URL].filter(Boolean);
  if (!allowed.some((a) => origin.startsWith(a))) {
    return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  }
  return null;
}

/** Run CORS + rate limiting together. Returns a Response to short-circuit, or null. */
export function guard(request, scope = 'standard') {
  return corsCheck(request) || enforceRateLimit(request, scope);
}

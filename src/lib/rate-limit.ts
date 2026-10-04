/**
 * Fixed-window rate limiter, in process memory.
 *
 * Slows credential stuffing against the sign-in and sign-up endpoints. On
 * serverless hosting each instance keeps its own counters, so this is a
 * brake, not a hard ceiling; a shared store (Upstash, Vercel KV) would make
 * it one.
 */

interface Window { count: number; resetAt: number }

const buckets = new Map<string, Window>();
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets; meaningful when ok is false. */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  let w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) sweep(now);
    w = { count: 0, resetAt: now + windowMs };
    buckets.set(key, w);
  }
  w.count++;
  return { ok: w.count <= limit, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
}

function sweep(now: number) {
  for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
  // Still full of live windows: drop the oldest half rather than grow unbounded.
  if (buckets.size >= MAX_KEYS) {
    let i = 0;
    for (const k of buckets.keys()) { if (i++ >= MAX_KEYS / 2) break; buckets.delete(k); }
  }
}

/** Client address as seen by the platform. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') ?? 'unknown').trim();
}

/** Test hook. */
export function resetRateLimits() {
  buckets.clear();
}

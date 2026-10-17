import { NextResponse } from 'next/server';
import { getDb, type Db } from '@/lib/db';

/**
 * Fixed-window rate limiter backed by the database, so limits hold across
 * serverless instances. Keys are "<scope>:<subject>" — the subject is a user
 * id or, for anonymous routes, the client IP.
 */

export interface RateLimit {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const LIMITS = {
  /** Sign-in and sign-up attempts per IP. */
  auth: { limit: 10, windowSeconds: 15 * 60 },
  /** New booking requests per user (each fans out emails and texts). */
  bookingCreate: { limit: 5, windowSeconds: 60 * 60 },
  /** Trip-sheet emails relayed per operator user. */
  shareEmail: { limit: 10, windowSeconds: 60 * 60 },
  /** Staff test alerts per operator user. */
  staffTest: { limit: 10, windowSeconds: 60 * 60 },
  /** Manual discovery runs per admin user. */
  discoveryRun: { limit: 3, windowSeconds: 60 * 60 },
  /** Messages per user. */
  message: { limit: 60, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimit>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export async function checkRateLimit(db: Db, key: string, rule: RateLimit): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(now - (now % (rule.windowSeconds * 1000)));
  const row = (await db.one<{ count: number }>(`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (?, ?, 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start = EXCLUDED.window_start THEN rate_limits.count + 1 ELSE 1 END,
      window_start = EXCLUDED.window_start
    RETURNING count
  `, [key, windowStart.toISOString()]))!;
  const count = Number(row.count);
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfter: Math.ceil((windowStart.getTime() + rule.windowSeconds * 1000 - now) / 1000),
  };
}

/** Client IP for anonymous keys. Vercel sets x-forwarded-for; the first entry is the client. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Enforce a limit in a route handler. Returns a 429 response to send, or
 * null when the request may proceed.
 */
export async function rateLimited(scope: keyof typeof LIMITS, subject: string | number, db: Db = getDb()): Promise<NextResponse | null> {
  const rule = LIMITS[scope];
  const result = await checkRateLimit(db, `${scope}:${subject}`, rule);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: 'Too many requests. Try again later.' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
  );
}

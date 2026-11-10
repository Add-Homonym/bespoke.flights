/**
 * Vercel Cron: daily lifecycle (10:00 UTC, see vercel.json).
 *
 *   - pending quotes past their valid-until date → expired
 *   - booked trips whose last leg has flown → completed
 *
 * Security: CRON_SECRET bearer token, or an admin session for a manual run.
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { adminOk, bearerOk } from '@/lib/cron-auth';
import { runDailyLifecycle } from '@/lib/lifecycle';
import { appBaseUrl } from '@/lib/payments/config';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run(req: Request) {
  try {
    const result = await runDailyLifecycle(getDb(), { baseUrl: appBaseUrl(req) });
    console.log('[Cron] Daily lifecycle:', JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Cron] Daily lifecycle error:', message);
    return NextResponse.json({ ok: false, error: message, timestamp: new Date().toISOString() }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!bearerOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run(req);
}

export async function POST(req: Request) {
  if (!bearerOk(req) && !(await adminOk())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run(req);
}

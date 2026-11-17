/**
 * Vercel Cron: ads loop (daily 16:00 UTC, see vercel.json). Measures the ad
 * campaign against the monthly net goal and adjusts ads and budgets
 * (src/lib/ads/loop.ts).
 *
 * Security: CRON_SECRET bearer token, or an admin session for a manual run.
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { adminOk, bearerOk } from '@/lib/cron-auth';
import { runAdsLoop } from '@/lib/ads/loop';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function run() {
  try {
    const result = await runAdsLoop(getDb());
    console.log('[Cron] Ads loop:', JSON.stringify({ runId: result.runId, applied: result.applied, pending: result.pending, failed: result.failed, notes: result.notes }));
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Cron] Ads loop error:', message);
    return NextResponse.json({ ok: false, error: message, timestamp: new Date().toISOString() }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!bearerOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run();
}

export async function POST(req: Request) {
  if (!bearerOk(req) && !(await adminOk())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run();
}

/**
 * Vercel Cron: Weekly Operator Discovery
 *
 * Schedule: Every Monday at 6:00 PM UTC (8:00 AM HST)
 * Configured in vercel.json
 *
 * Pipeline:
 *   1. Scrape FAA Part 135 registry (batch of states, rotates weekly)
 *   2. Store new discoveries in discovered_operators table
 *   3. Send invite emails via Resend to operators with email addresses
 *
 * Security: CRON_SECRET is required. Vercel sends it in the Authorization
 * header for scheduled runs. Manual trigger: POST with Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { runDiscoveryPipeline } from '@/lib/discovery/pipeline';

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`.
 * Without a configured secret every call is refused: this endpoint scrapes
 * a third-party site and sends cold email, so it is never open.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const US_STATE = /^[A-Z]{2}$/;

export const maxDuration = 60; // Vercel Pro: 60s timeout
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Vercel sends CRON_SECRET automatically for scheduled runs.
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  try {
    const result = await runDiscoveryPipeline(db, {
      statesPerRun: 10,  // ~10 states per weekly run, cycles through all in ~5 weeks
      emailsPerRun: 20,  // Resend free tier: 100/day, keep headroom for RFQs
    });

    console.log('[Cron] Weekly discovery complete:', JSON.stringify(result));

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Cron] Discovery pipeline error:', message);

    return NextResponse.json({
      ok: false,
      error: message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

/**
 * POST handler for manual trigger (admin use).
 * Accepts optional body: { states?: string[], emailsPerRun?: number }
 */
export async function POST(req: Request) {
  // Either the cron secret or a signed-in admin (the admin console's "run now" button).
  if (!authorized(req) && (await getSession())?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const options: { forceStates?: string[]; emailsPerRun?: number } = {};

  const body = await req.json().catch(() => ({})) as { states?: unknown; emailsPerRun?: unknown };
  if (Array.isArray(body.states)) {
    const states = body.states
      .filter((s): s is string => typeof s === 'string')
      .map(s => s.toUpperCase())
      .filter(s => US_STATE.test(s));
    if (states.length > 0) options.forceStates = states.slice(0, 60);
  }
  if (typeof body.emailsPerRun === 'number' && Number.isInteger(body.emailsPerRun)) {
    options.emailsPerRun = Math.min(100, Math.max(0, body.emailsPerRun));
  }

  try {
    const result = await runDiscoveryPipeline(db, options);

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      error: message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

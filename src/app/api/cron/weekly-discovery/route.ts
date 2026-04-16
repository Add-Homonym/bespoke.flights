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
 * Security: Vercel automatically sends CRON_SECRET in the Authorization header.
 * Manual trigger: POST with Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runDiscoveryPipeline } from '@/lib/discovery/pipeline';

export const maxDuration = 60; // Vercel Pro: 60s timeout
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  let options: { forceStates?: string[]; emailsPerRun?: number } = {};

  try {
    const body = await req.json().catch(() => ({}));
    if (body.states && Array.isArray(body.states)) {
      options.forceStates = body.states;
    }
    if (body.emailsPerRun && typeof body.emailsPerRun === 'number') {
      options.emailsPerRun = body.emailsPerRun;
    }
  } catch {
    // Use defaults
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

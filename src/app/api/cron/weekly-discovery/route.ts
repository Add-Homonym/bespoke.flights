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
 * Security: Vercel sends `Authorization: Bearer <CRON_SECRET>` for scheduled
 * runs. The route refuses every call when CRON_SECRET is unset. Admins may
 * also trigger a run from /admin/discoveries with their session.
 */

import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { adminSession, bearerOk } from '@/lib/cron-auth';
import { runDiscoveryPipeline } from '@/lib/discovery/pipeline';
import { rateLimited } from '@/lib/rate-limit';

export const maxDuration = 60; // Vercel Pro: 60s timeout
export const dynamic = 'force-dynamic';

const US_STATE = /^[A-Z]{2}$/;
const manualRunSchema = z.object({
  states: z.array(z.string().regex(US_STATE)).max(10).optional(),
  emailsPerRun: z.number().int().min(0).max(100).optional(),
});

async function run(options: Parameters<typeof runDiscoveryPipeline>[1], label: string) {
  try {
    const result = await runDiscoveryPipeline(getDb(), options);
    console.log(`[Cron] ${label} discovery complete:`, JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Cron] Discovery pipeline error:', message);
    return NextResponse.json({ ok: false, error: message, timestamp: new Date().toISOString() }, { status: 500 });
  }
}

/** Scheduled run. Vercel Cron calls this with the CRON_SECRET bearer token. */
export async function GET(req: Request) {
  if (!bearerOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run({
    statesPerRun: 10,  // ~10 states per weekly run, cycles through all in ~5 weeks
    emailsPerRun: 20,  // Resend free tier: 100/day, keep headroom for RFQs
  }, 'Weekly');
}

/**
 * Manual trigger: CRON_SECRET bearer token or an admin session.
 * Optional body: { states?: string[], emailsPerRun?: number }
 */
export async function POST(req: Request) {
  if (!bearerOk(req)) {
    const admin = await adminSession();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const limited = await rateLimited('discoveryRun', admin.userId);
    if (limited) return limited;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = manualRunSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return validationResponse(parsed.error);
  }

  return run({
    forceStates: parsed.data.states,
    emailsPerRun: parsed.data.emailsPerRun,
  }, 'Manual');
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validationResponse } from '@/lib/api/validation';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { findAirport } from '@/lib/airports';
import { ALLOWED_PATHS } from '@/lib/ads/lint';
import { lintAllCopy } from '@/lib/ads/copy';

const airport = z.string().trim().toUpperCase().refine(c => !!findAirport(c), 'Unknown airport code');
const resource = z.string().trim().max(200).optional();

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(80),
  originCode: airport.optional(),
  destCode: airport.optional(),
  landingPath: z.enum(ALLOWED_PATHS as [string, ...string[]]),
  dailyBudgetCents: z.number().int().min(0).max(10_000_000),
  platformCampaign: resource,
  platformAdGroup: resource,
  platformBudget: resource,
}).refine(c => !!c.originCode === !!c.destCode, { message: 'Give both airports or neither', path: ['destCode'] });

/** Create a campaign for the loop to manage. Its first ads are written on the next run. */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  const parsed = campaignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationResponse(parsed.error);
  const c = parsed.data;
  const target = { id: 0, name: c.name, origin_code: c.originCode ?? null, dest_code: c.destCode ?? null, landing_path: c.landingPath };
  const problems = lintAllCopy(target);
  if (problems.length) return NextResponse.json({ error: 'Copy for this campaign breaks an ad rule', problems: problems.slice(0, 5) }, { status: 400 });

  const db = getDb();
  if (await db.one('SELECT 1 FROM ad_campaigns WHERE name = ?', [c.name])) {
    return NextResponse.json({ error: 'Check the highlighted fields.', fieldErrors: { name: ['A campaign with this name exists'] } }, { status: 400 });
  }
  const row = await db.one(
    `INSERT INTO ad_campaigns (name, origin_code, dest_code, landing_path, daily_budget_cents, platform_campaign, platform_ad_group, platform_budget)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [c.name, target.origin_code, target.dest_code, c.landingPath, c.dailyBudgetCents, c.platformCampaign || null, c.platformAdGroup || null, c.platformBudget || null]);
  return NextResponse.json(row, { status: 201 });
}

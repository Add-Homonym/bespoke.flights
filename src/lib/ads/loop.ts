/**
 * The ads loop. Each run:
 *
 *   1. pulls ad delivery from the platform (api mode; manual mode uses the CSV import)
 *   2. measures each ad: clicks, cost, requests, bookings, net revenue
 *   3. decides: pause losers, launch replacements, move budgets (decide.ts)
 *   4. writes replacement copy from vetted blocks (copy.ts) and lints it (lint.ts)
 *   5. applies the changes through the platform, or queues them on /admin/ads
 *
 * With settings.enabled off, steps 1-2 run and nothing changes.
 * Runs daily from /api/cron/ads-loop.
 */
import type { Db } from '@/lib/db';
import { getBusinessModel } from '@/lib/business-model';
import { getAdsSettings } from './settings';
import { addDays, angleStats, dayOf, monthSummary, valuePerRequestCents, variantStats, type MonthSummary } from './measure';
import { decide, type Action } from './decide';
import { buildCopy, componentsKey, nextVariant, type Angle, type CampaignTarget, type Components } from './copy';
import { lintAd, type AdCopy } from './lint';
import { seededRng } from './stats';
import { upsertMetrics } from './csv';
import { platformFor, type AdsPlatform, type PlatformCampaign } from './platform';

export interface CampaignRow extends CampaignTarget, PlatformCampaign {
  daily_budget_cents: number;
  status: 'active' | 'paused';
  budget_changed_at: string | null;
}

export interface VariantRow {
  id: number; campaign_id: number; angle: Angle; components: string; headlines: string; descriptions: string; final_url: string;
  status: 'draft' | 'active' | 'paused'; platform_ad_id: string | null;
}

export interface ActionRow {
  id: number; kind: Action['kind']; campaign_id: number | null; variant_id: number | null; detail: string; reason: string;
  status: 'pending' | 'applied' | 'failed' | 'superseded'; error: string | null; created_at: string; applied_at: string | null;
}

export interface RunResult {
  runId: number;
  mode: string;
  enabled: boolean;
  month: MonthSummary;
  valuePerRequestCents: number;
  applied: number;
  pending: number;
  failed: number;
  notes: string[];
}

export const copyOf = (v: Pick<VariantRow, 'headlines' | 'descriptions' | 'final_url'>): AdCopy =>
  ({ headlines: JSON.parse(v.headlines), descriptions: JSON.parse(v.descriptions), finalUrl: v.final_url });

/**
 * Make an action's effect true in the database. Called once the change is
 * live: straight after the platform call in api mode, or when an admin marks
 * a queued change as applied.
 */
export async function commitAction(db: Db, action: Pick<ActionRow, 'id' | 'kind' | 'campaign_id' | 'variant_id' | 'detail' | 'reason'>, opts: { platformAdId?: string } = {}): Promise<void> {
  await db.transaction(async tx => {
    if (action.kind === 'pause') {
      await tx.run("UPDATE ad_variants SET status = 'paused', paused_at = now(), pause_reason = ? WHERE id = ?", [action.reason, action.variant_id]);
    } else if (action.kind === 'launch') {
      await tx.run("UPDATE ad_variants SET status = 'active', activated_at = now(), platform_ad_id = COALESCE(?, platform_ad_id) WHERE id = ?", [opts.platformAdId ?? null, action.variant_id]);
    } else {
      const { toCents } = JSON.parse(action.detail) as { toCents: number };
      await tx.run('UPDATE ad_campaigns SET daily_budget_cents = ?, budget_changed_at = now() WHERE id = ?', [toCents, action.campaign_id]);
    }
    await tx.run("UPDATE ad_actions SET status = 'applied', applied_at = now(), error = NULL WHERE id = ?", [action.id]);
  });
}

async function syncMetrics(db: Db, platform: AdsPlatform, since: Date, until: Date): Promise<number> {
  const rows = await platform.fetchMetrics(dayOf(since), dayOf(until));
  const known = await db.query<{ id: number; platform_ad_id: string }>('SELECT id, platform_ad_id FROM ad_variants WHERE platform_ad_id IS NOT NULL');
  const byAdId = new Map(known.map(v => [v.platform_ad_id, v.id]));
  const mine = rows.flatMap(r => {
    const variantId = byAdId.get(r.platformAdId);
    return variantId ? [{ variantId, day: r.day, impressions: r.impressions, clicks: r.clicks, costCents: r.costCents }] : [];
  });
  await upsertMetrics(db, mine);
  return mine.length;
}

export interface RunOptions {
  now?: Date;
  /** Override the platform: an adapter, or null to queue every change. Default: from settings and environment. */
  platform?: AdsPlatform | null;
  seed?: number;
}

export async function runAdsLoop(db: Db, opts: RunOptions = {}): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const settings = await getAdsSettings(db);
  const model = await getBusinessModel(db);
  const platform = opts.platform !== undefined ? opts.platform : platformFor(settings);
  const rng = seededRng(opts.seed ?? Math.floor(now.getTime() / 86_400_000));
  const notes: string[] = [];
  const since = addDays(now, -settings.lookbackDays);
  const until = addDays(now, 1);

  if (settings.mode === 'api' && !platform) notes.push('api mode is set but the Google Ads credentials are incomplete; changes are queued instead');
  if (platform) {
    try { notes.push(`synced ${await syncMetrics(db, platform, since, until)} metric rows from ${platform.name}`); }
    catch (err) { notes.push(`metrics sync failed: ${err instanceof Error ? err.message : String(err)}`); }
  }

  if (platform && settings.enabled) {
    const { applied, failed } = await retryOpenActions(db, platform);
    if (applied || failed) notes.push(`retried queued changes: ${applied} applied, ${failed} failed`);
  }

  const stats = await variantStats(db, model, since, until);
  const month = await monthSummary(db, model, settings, now);
  const value = await valuePerRequestCents(db, model, settings, now);
  const campaigns = await db.query<CampaignRow>('SELECT * FROM ad_campaigns ORDER BY id');
  const pendingPause = new Set((await db.query<{ variant_id: number }>("SELECT variant_id FROM ad_actions WHERE kind = 'pause' AND status = 'pending'")).map(r => r.variant_id));

  const actions = settings.enabled
    ? decide({
        settings, valuePerRequestCents: value, monthSpendCents: month.adSpendCents, now, rng,
        campaigns: campaigns.map(c => ({ id: c.id, name: c.name, status: c.status, dailyBudgetCents: c.daily_budget_cents, budgetChangedAt: c.budget_changed_at })),
        // An ad with a pause already queued counts as paused, so it is not queued twice.
        variants: stats.map(s => ({ ...s, status: pendingPause.has(s.id) ? 'paused' as const : s.status })),
      })
    : [];
  if (!settings.enabled) notes.push('loop is off: measured only');
  if (settings.enabled && settings.monthlySpendCapCents === 0) notes.push('monthly spend cap is $0: every campaign budget is held at zero');

  const { id: runId } = (await db.one<{ id: number }>(
    'INSERT INTO ad_loop_runs (mode, summary) VALUES (?, ?) RETURNING id', [platform ? platform.name : 'manual', '{}']))!;
  const tally = { applied: 0, pending: 0, failed: 0 };
  const byId = new Map(campaigns.map(c => [c.id, c]));
  const angles = await angleStats(db);
  const pausing = new Set(actions.flatMap(a => (a.kind === 'pause' ? [a.variantId] : [])));

  const record = async (a: Action, variantId: number | null, detail: unknown) =>
    (await db.one<ActionRow>(
      'INSERT INTO ad_actions (run_id, kind, campaign_id, variant_id, detail, reason) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
      [runId, a.kind, a.campaignId, variantId, JSON.stringify(detail), a.reason]))!;

  const apply = async (row: ActionRow, live: (p: AdsPlatform) => Promise<{ platformAdId?: string } | void>) => {
    if (!platform) { tally.pending++; return; }
    try {
      const out = await live(platform);
      await commitAction(db, row, out ?? {});
      tally.applied++;
    } catch (err) {
      await db.run("UPDATE ad_actions SET status = 'failed', error = ? WHERE id = ?", [(err instanceof Error ? err.message : String(err)).slice(0, 500), row.id]);
      tally.failed++;
    }
  };

  for (const action of actions) {
    const campaign = byId.get(action.campaignId)!;

    if (action.kind === 'pause') {
      const variant = (await db.one<VariantRow>('SELECT * FROM ad_variants WHERE id = ?', [action.variantId]))!;
      const row = await record(action, variant.id, {});
      await apply(row, async p => {
        if (!variant.platform_ad_id) throw new Error('Ad has no Google ad id recorded');
        await p.pauseAd(campaign, variant.platform_ad_id);
      });
    }

    if (action.kind === 'launch') {
      const all = await db.query<VariantRow>('SELECT * FROM ad_variants WHERE campaign_id = ?', [campaign.id]);
      const comps = nextVariant({
        campaign, angleStats: angles, rng,
        tried: new Set(all.map(v => componentsKey(JSON.parse(v.components) as Components))),
        liveAngles: new Set(all.filter(v => v.status !== 'paused' && !pausing.has(v.id) && !pendingPause.has(v.id)).map(v => v.angle)),
      });
      if (!comps) { notes.push(`${campaign.name}: every copy combination has run; add blocks in src/lib/ads/copy.ts`); continue; }
      const variant = await createVariant(db, campaign, comps, all.length === 0 ? 'seed' : 'generated');
      if (!variant) { notes.push(`${campaign.name}: generated copy failed the lint and was discarded`); continue; }
      const copy = copyOf(variant);
      const row = await record(action, variant.id, copy);
      await apply(row, async p => ({ platformAdId: await p.createAd(campaign, copy) }));
    }

    if (action.kind === 'budget') {
      const open = await db.query<ActionRow>("SELECT * FROM ad_actions WHERE kind = 'budget' AND status = 'pending' AND campaign_id = ?", [campaign.id]);
      if (open.some(o => (JSON.parse(o.detail) as { toCents: number }).toCents === action.toCents)) { tally.pending++; continue; }
      if (open.length) await db.run("UPDATE ad_actions SET status = 'superseded' WHERE kind = 'budget' AND status = 'pending' AND campaign_id = ?", [campaign.id]);
      const row = await record(action, null, { fromCents: action.fromCents, toCents: action.toCents });
      await apply(row, p => p.setDailyBudget(campaign, action.toCents));
    }
  }

  const result: RunResult = { runId, mode: platform ? platform.name : 'manual', enabled: settings.enabled, month, valuePerRequestCents: value, ...tally, notes };
  await db.run('UPDATE ad_loop_runs SET summary = ? WHERE id = ?', [JSON.stringify(result), runId]);
  return result;
}

/**
 * Push changes that are still open through the platform: launches that were
 * queued or failed, and pauses or budget changes queued while in manual mode.
 * A failed pause or budget change is not retried here; the next decision re-derives it.
 */
export async function retryOpenActions(db: Db, platform: AdsPlatform): Promise<{ applied: number; failed: number }> {
  const open = await db.query<ActionRow>(
    "SELECT * FROM ad_actions WHERE (kind = 'launch' AND status IN ('pending','failed')) OR (kind IN ('pause','budget') AND status = 'pending') ORDER BY id");
  const tally = { applied: 0, failed: 0 };
  for (const row of open) {
    try {
      const campaign = (await db.one<CampaignRow>('SELECT * FROM ad_campaigns WHERE id = ?', [row.campaign_id]))!;
      const variant = row.variant_id ? await db.one<VariantRow>('SELECT * FROM ad_variants WHERE id = ?', [row.variant_id]) : undefined;
      let platformAdId: string | undefined;
      if (row.kind === 'launch') platformAdId = await platform.createAd(campaign, copyOf(variant!));
      else if (row.kind === 'pause') {
        if (!variant?.platform_ad_id) throw new Error('Ad has no Google ad id recorded');
        await platform.pauseAd(campaign, variant.platform_ad_id);
      } else await platform.setDailyBudget(campaign, (JSON.parse(row.detail) as { toCents: number }).toCents);
      await commitAction(db, row, { platformAdId });
      tally.applied++;
    } catch (err) {
      await db.run("UPDATE ad_actions SET status = 'failed', error = ? WHERE id = ?", [(err instanceof Error ? err.message : String(err)).slice(0, 500), row.id]);
      tally.failed++;
    }
  }
  return tally;
}

/** Insert a draft ad built from blocks. Returns null (and stores nothing) if the copy breaks a lint rule. */
export async function createVariant(db: Db, campaign: CampaignTarget, comps: Components, origin: 'seed' | 'generated'): Promise<VariantRow | null> {
  return db.transaction(async tx => {
    const { id } = (await tx.one<{ id: number }>(
      `INSERT INTO ad_variants (campaign_id, angle, components, headlines, descriptions, final_url, origin) VALUES (?, ?, ?, '[]', '[]', '', ?) RETURNING id`,
      [campaign.id, comps.angle, JSON.stringify(comps), origin]))!;
    const copy = buildCopy(campaign, comps, id);
    if (lintAd(copy).length > 0) {
      await tx.run('DELETE FROM ad_variants WHERE id = ?', [id]);
      return null;
    }
    return (await tx.one<VariantRow>(
      'UPDATE ad_variants SET headlines = ?, descriptions = ?, final_url = ? WHERE id = ? RETURNING *',
      [JSON.stringify(copy.headlines), JSON.stringify(copy.descriptions), copy.finalUrl, id]))!;
  });
}

/**
 * Ads loop settings, editable from /admin/ads. Stored as one JSON document
 * under platform_settings.key = 'ads_loop', like the business model.
 *
 * The two `assumed*` values are priors, not measurements: they stand in for
 * booking rate and net per booking until real bookings outweigh them.
 */
import { z } from 'zod';
import type { Db } from '@/lib/db';

export const ADS_SETTINGS_KEY = 'ads_loop';

const cents = z.number().int().min(0).max(1_000_000_000);

export const adsSettingsSchema = z.object({
  /** Off: the loop measures and reports but changes nothing. */
  enabled: z.boolean(),
  /** manual: changes are queued for a person to apply in Google Ads. api: the loop applies them. */
  mode: z.enum(['manual', 'api']),
  /** Monthly target: platform net revenue minus ad spend. */
  monthlyNetGoalCents: cents,
  /** Hard ceiling on ad spend per calendar month. The loop never budgets past it. */
  monthlySpendCapCents: cents,
  /** Lowest daily budget a live campaign is given. */
  minDailyBudgetCents: cents,
  /** Days of history each decision reads. */
  lookbackDays: z.number().int().min(7).max(90),
  /** Clicks an ad must have before it can be judged against the others. */
  minClicksToJudge: z.number().int().min(10).max(10_000),
  /** Pause an ad when its chance of being the campaign's best falls below this. */
  pauseBelowProbability: z.number().min(0.001).max(0.5),
  /** Live ads to keep per campaign. */
  adsPerCampaign: z.number().int().min(2).max(6),
  /** Days between budget changes. */
  budgetIntervalDays: z.number().int().min(1).max(30),
  /** Largest budget move per change, in basis points. */
  budgetStepBps: z.number().int().min(100).max(5_000),
  /** Prior: share of requests that become paid bookings. */
  assumedBookingRateBps: z.number().int().min(1).max(10_000),
  /** Prior: platform net per paid booking. */
  assumedNetPerBookingCents: cents,
  /** How many requests the priors count as. */
  priorRequests: z.number().int().min(1).max(1_000),
});

export type AdsSettings = z.infer<typeof adsSettingsSchema>;
export const adsSettingsPatchSchema = adsSettingsSchema.partial().strict();

export function defaultAdsSettings(): AdsSettings {
  return {
    enabled: false,
    mode: 'manual',
    monthlyNetGoalCents: 1_000_000,
    monthlySpendCapCents: 0,
    minDailyBudgetCents: 500,
    lookbackDays: 28,
    minClicksToJudge: 100,
    pauseBelowProbability: 0.05,
    adsPerCampaign: 3,
    budgetIntervalDays: 7,
    budgetStepBps: 2_000,
    assumedBookingRateBps: 1_000,
    assumedNetPerBookingCents: 30_000,
    priorRequests: 20,
  };
}

export async function getAdsSettings(db: Db): Promise<AdsSettings> {
  const defaults = defaultAdsSettings();
  const row = await db.one<{ value: string }>('SELECT value FROM platform_settings WHERE key = ?', [ADS_SETTINGS_KEY]).catch(() => undefined);
  if (!row) return defaults;
  let stored: unknown;
  try { stored = JSON.parse(row.value); } catch { return defaults; }
  const parsed = adsSettingsSchema.partial().safeParse(stored);
  return parsed.success ? { ...defaults, ...parsed.data } : defaults;
}

export async function saveAdsSettings(db: Db, patch: Partial<AdsSettings>): Promise<AdsSettings> {
  return db.transaction(async tx => {
    const next = adsSettingsSchema.parse({ ...(await getAdsSettings(tx)), ...patch });
    await tx.run(`INSERT INTO platform_settings (key, value) VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [ADS_SETTINGS_KEY, JSON.stringify(next)]);
    return next;
  });
}

/** Daily spend ceiling implied by the monthly cap. */
export const dailySpendCapCents = (s: AdsSettings) => Math.floor(s.monthlySpendCapCents / 30.4);

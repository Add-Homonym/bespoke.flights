/**
 * The ad platform as the loop sees it. With no platform (manual mode, or the
 * Google Ads credentials absent) the loop still decides, and queues each
 * change on /admin/ads for a person to apply.
 */
import type { AdCopy } from './lint';
import type { AdsSettings } from './settings';
import { googleAdsFromEnv } from './google';

export interface MetricRow { platformAdId: string; day: string; impressions: number; clicks: number; costCents: number }

export interface PlatformCampaign {
  id: number;
  name: string;
  platform_campaign: string | null;
  platform_ad_group: string | null;
  platform_budget: string | null;
}

export interface AdsPlatform {
  name: string;
  /** Daily delivery per ad for [since, until), days as YYYY-MM-DD. */
  fetchMetrics(since: string, until: string): Promise<MetricRow[]>;
  pauseAd(campaign: PlatformCampaign, platformAdId: string): Promise<void>;
  /** Creates the ad live and returns the platform's ad id. */
  createAd(campaign: PlatformCampaign, copy: AdCopy): Promise<string>;
  /** Zero pauses the campaign; anything above zero sets the budget and enables it. */
  setDailyBudget(campaign: PlatformCampaign, cents: number): Promise<void>;
}

/** The live platform for these settings, or null when changes must be applied by hand. */
export function platformFor(settings: AdsSettings, env: NodeJS.ProcessEnv = process.env): AdsPlatform | null {
  return settings.mode === 'api' ? googleAdsFromEnv(env) : null;
}

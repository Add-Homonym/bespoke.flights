/**
 * The ads loop's decisions. Pure: numbers in, actions out.
 *
 *   pause   an ad that is very unlikely to be its campaign's best at earning
 *           requests, or that has spent three requests' worth with none
 *   launch  a replacement for each paused ad, and enough ads to keep each
 *           campaign at its target count
 *   budget  move a campaign's daily budget toward what it returns: up when
 *           each dollar brings back more than it costs, down when less;
 *           always inside the monthly spend cap
 *
 * Ads are compared on requests per click, not bookings: bookings are too few
 * and too late to separate one ad from another. Bookings set the value of a
 * request (measure.ts: valuePerRequestCents), which drives the budget.
 */
import { dailySpendCapCents, type AdsSettings } from './settings';
import { probabilityBest, type Rng } from './stats';

export interface DecideVariant { id: number; campaignId: number; status: 'draft' | 'active' | 'paused'; clicks: number; costCents: number; requests: number }
export interface DecideCampaign { id: number; name: string; status: 'active' | 'paused'; dailyBudgetCents: number; budgetChangedAt: string | null }

export type Action =
  | { kind: 'pause'; campaignId: number; variantId: number; reason: string }
  | { kind: 'launch'; campaignId: number; reason: string }
  | { kind: 'budget'; campaignId: number; fromCents: number; toCents: number; reason: string };

export interface DecideInput {
  settings: AdsSettings;
  campaigns: DecideCampaign[];
  /** Stats over the lookback window. */
  variants: DecideVariant[];
  valuePerRequestCents: number;
  /** Ad spend so far this calendar month. */
  monthSpendCents: number;
  now: Date;
  rng: Rng;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function decide(input: DecideInput): Action[] {
  const { settings, campaigns, variants, valuePerRequestCents: value, now, rng } = input;
  const actions: Action[] = [];
  const live = campaigns.filter(c => c.status === 'active');

  // ── Ads ──
  for (const campaign of live) {
    const mine = variants.filter(v => v.campaignId === campaign.id);
    const active = mine.filter(v => v.status === 'active');
    const drafts = mine.filter(v => v.status === 'draft').length;
    const judged = active.filter(v => v.clicks >= settings.minClicksToJudge);
    const paused = new Set<number>();

    if (judged.length >= 2) {
      const p = probabilityBest(judged.map(v => ({ successes: v.requests, trials: v.clicks })), rng);
      judged.forEach((v, i) => {
        if (p[i] < settings.pauseBelowProbability) {
          paused.add(v.id);
          actions.push({ kind: 'pause', campaignId: campaign.id, variantId: v.id,
            reason: `${pct(p[i])} chance of being this campaign's best ad (${v.requests} requests from ${v.clicks} clicks)` });
        }
      });
    }
    const wasteLimit = 3 * value;
    for (const v of active) {
      if (!paused.has(v.id) && v.requests === 0 && value > 0 && v.costCents >= wasteLimit) {
        paused.add(v.id);
        actions.push({ kind: 'pause', campaignId: campaign.id, variantId: v.id,
          reason: `spent ${usd(v.costCents)} with no requests (limit ${usd(wasteLimit)}, three requests' worth)` });
      }
    }
    const missing = settings.adsPerCampaign - (active.length - paused.size) - drafts;
    for (let i = 0; i < missing; i++) {
      actions.push({ kind: 'launch', campaignId: campaign.id, reason: i < paused.size ? 'replaces a paused ad' : `keeps ${settings.adsPerCampaign} ads live` });
    }
  }

  // ── Budgets ──
  const totalClicks = variants.reduce((s, v) => s + v.clicks, 0);
  const totalRequests = variants.reduce((s, v) => s + v.requests, 0);
  const accountRate = (totalRequests + 1) / (totalClicks + 50);
  const step = settings.budgetStepBps / 10_000;
  const proposed = new Map<number, { to: number; reason: string }>();

  for (const campaign of live) {
    const mine = variants.filter(v => v.campaignId === campaign.id);
    const clicks = mine.reduce((s, v) => s + v.clicks, 0);
    const cost = mine.reduce((s, v) => s + v.costCents, 0);
    const requests = mine.reduce((s, v) => s + v.requests, 0);
    const sinceChange = campaign.budgetChangedAt ? (now.getTime() - new Date(campaign.budgetChangedAt).getTime()) / 86_400_000 : Infinity;
    if (campaign.dailyBudgetCents <= 0 || sinceChange < settings.budgetIntervalDays || clicks < settings.minClicksToJudge || cost <= 0) continue;

    // Shrink the campaign's request rate toward the account's until it has clicks of its own.
    const rate = (requests + settings.minClicksToJudge * accountRate) / (clicks + settings.minClicksToJudge);
    const returned = (rate * clicks * value) / cost;
    const basis = `each $1 returned an expected ${usd(returned * 100)} over ${settings.lookbackDays} days (${requests} requests, ${clicks} clicks, ${usd(cost)} spent)`;
    if (returned >= 1.2) proposed.set(campaign.id, { to: Math.round(campaign.dailyBudgetCents * (1 + step)), reason: `raise: ${basis}` });
    else if (returned < 0.8) proposed.set(campaign.id, { to: Math.max(settings.minDailyBudgetCents, Math.round(campaign.dailyBudgetCents * (1 - step))), reason: `cut: ${basis}` });
  }

  // The cap binds every run, whether or not a campaign is due a change.
  const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const daysLeft = Math.max(1, Math.ceil((monthEnd - now.getTime()) / 86_400_000));
  const remaining = Math.max(0, settings.monthlySpendCapCents - input.monthSpendCents);
  const ceiling = Math.min(dailySpendCapCents(settings), Math.floor(remaining / daysLeft));
  const target = (c: DecideCampaign) => proposed.get(c.id)?.to ?? c.dailyBudgetCents;
  const total = live.reduce((s, c) => s + target(c), 0);
  const scale = total > ceiling ? ceiling / total : 1;

  for (const campaign of live) {
    const to = Math.floor(target(campaign) * scale);
    if (to === campaign.dailyBudgetCents) continue;
    const capNote = scale < 1 ? `held to the monthly spend cap (${usd(ceiling)} a day across campaigns, ${usd(remaining)} left this month)` : '';
    const reason = [proposed.get(campaign.id)?.reason, capNote].filter(Boolean).join('; ');
    actions.push({ kind: 'budget', campaignId: campaign.id, fromCents: campaign.dailyBudgetCents, toCents: to, reason });
  }
  return actions;
}

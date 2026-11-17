import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import { defaultBusinessModel } from '@/lib/business-model';
import { attributionColumns, attributionFromUrl, encodeAttribution, parseAttribution } from './attribution';
import { lintAd } from './lint';
import { ANGLES, CLOSERS, anglesFor, buildCopy, componentsKey, finalUrlFor, lintAllCopy, nextVariant, routeHeadline, type CampaignTarget } from './copy';
import { probabilityBest, sampleBeta, seededRng } from './stats';
import { decide, type DecideCampaign, type DecideVariant } from './decide';
import { defaultAdsSettings, getAdsSettings, saveAdsSettings } from './settings';
import { importMetricsCsv, parseCsv } from './csv';
import { monthSummary, netOfPayment, valuePerRequestCents, variantStats } from './measure';
import { commitAction, runAdsLoop, type ActionRow, type VariantRow } from './loop';
import { googleAds, googleAdsConfig } from './google';
import type { AdsPlatform } from './platform';
import type { SessionPayload } from '@/lib/types';

const who = vi.hoisted(() => ({ session: null as SessionPayload | null, cookie: undefined as string | undefined }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => (who.cookie ? { value: who.cookie } : undefined), set: () => {}, delete: () => {} }) }));
vi.mock('next/server', async orig => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));

const NOW = new Date('2026-11-20T12:00:00Z');
const route: CampaignTarget = { id: 1, name: 'HNL-OGG', origin_code: 'PHNL', dest_code: 'PHOG', landing_path: '/book' };
const settings = { ...defaultAdsSettings(), enabled: true, monthlySpendCapCents: 300_000 };

afterAll(() => { setDb(null); vi.restoreAllMocks(); });

describe('attribution', () => {
  it('reads bfv, gclid and utm parameters from a landing URL', () => {
    const a = attributionFromUrl(new URL('https://bespoke.flights/book?from=HNL&to=OGG&utm_source=google&utm_medium=cpc&utm_campaign=hnl-ogg&bfv=12&gclid=abc'), NOW)!;
    expect(a).toMatchObject({ variantId: 12, gclid: 'abc', source: 'google', medium: 'cpc', campaign: 'hnl-ogg', landing: '/book' });
    expect(parseAttribution(encodeAttribution(a))).toEqual(a);
    expect(attributionColumns(a)[0]).toBe(12);
  });
  it('ignores ordinary visits and malformed values', () => {
    expect(attributionFromUrl(new URL('https://bespoke.flights/book?from=HNL'))).toBeNull();
    expect(attributionFromUrl(new URL('https://bespoke.flights/book?bfv=1;drop'))).toBeNull();
    expect(parseAttribution('%7Bnot json')).toBeNull();
    expect(parseAttribution(encodeURIComponent(JSON.stringify({ variantId: 'x' })))).toBeNull();
    expect(attributionColumns(null)).toEqual([null, null]);
  });
});

describe('proxy', () => {
  it('stores a paid click in an httpOnly cookie on page views only', async () => {
    const { NextRequest } = await import('next/server');
    const { proxy } = await import('@/proxy');
    const landed = await proxy(new NextRequest('https://bespoke.flights/book?from=HNL&to=OGG&bfv=5&gclid=xyz'));
    const cookie = landed.cookies.get('bf_attr');
    expect(parseAttribution(cookie?.value)).toMatchObject({ variantId: 5, gclid: 'xyz', landing: '/book' });
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true });
    expect((await proxy(new NextRequest('https://bespoke.flights/book?from=HNL'))).cookies.get('bf_attr')).toBeUndefined();
    expect((await proxy(new NextRequest('https://bespoke.flights/api/empty-legs?bfv=5'))).cookies.get('bf_attr')).toBeUndefined();
    // A protected page still remembers the click through the sign-in redirect.
    const redirected = await proxy(new NextRequest('https://bespoke.flights/requests?bfv=6'));
    expect(redirected.status).toBe(307);
    expect(parseAttribution(redirected.cookies.get('bf_attr')?.value)?.variantId).toBe(6);
  });
});

describe('lintAd', () => {
  const ok = { headlines: ['Honolulu to Kahului charter', 'Compare charter quotes', 'Bespoke Flights'], descriptions: ['Request a trip once and compare quotes.', 'Request quotes online.'], finalUrl: '/book?bfv=1' };
  it('passes clean copy', () => expect(lintAd(ok)).toEqual([]));
  it.each([
    ['Book now!', 'exclamation'],
    ['The ultimate luxury charter', 'banned word'],
    ['Call us for a quote', 'phone'],
    ['No membership needed', 'membership'],
    ['Lowest price guaranteed', 'superlative'],
    ['Charters from $4,900', 'price'],
    ['Compare 450+ operators', 'counts'],
    ['Quotes within 2 hours', 'response-time'],
    ['Save 40% off empty legs', 'percent-off'],
    ['A headline that runs well past thirty characters', 'over 30'],
  ])('rejects %s', (headline, why) => {
    const problems = lintAd({ ...ok, headlines: [ok.headlines[0], headline, ok.headlines[2]] });
    expect(problems.join(' | ')).toContain(why);
  });
  it('rejects a final URL off the allowed pages or without bfv', () => {
    expect(lintAd({ ...ok, finalUrl: 'https://example.com/book?bfv=1' }).length).toBe(0); // path is what is checked; the host is set by APP_URL
    expect(lintAd({ ...ok, finalUrl: '/admin?bfv=1' }).join()).toContain('final URL must be');
    expect(lintAd({ ...ok, finalUrl: '/book' }).join()).toContain('bfv');
  });
});

describe('copy', () => {
  const targets: CampaignTarget[] = [
    route,
    { id: 2, name: 'LAX-HNL', origin_code: 'KLAX', dest_code: 'PHNL', landing_path: '/book' },
    { id: 3, name: 'SFO-KOA', origin_code: 'KSFO', dest_code: 'PHKO', landing_path: '/book' },
    { id: 4, name: 'Hawaii', origin_code: null, dest_code: null, landing_path: '/book' },
    { id: 5, name: 'Empty legs', origin_code: null, dest_code: null, landing_path: '/empty-legs' },
    { id: 6, name: 'HNL-LIH empty', origin_code: 'PHNL', dest_code: 'PHLI', landing_path: '/empty-legs' },
  ];
  it.each(targets)('every block combination passes the lint for $name', t => expect(lintAllCopy(t)).toEqual([]));
  it('shortens the route headline to fit', () => {
    expect(routeHeadline(route)).toBe('Honolulu to Kahului charter');
    expect([...routeHeadline(targets[1])].length).toBeLessThanOrEqual(30);
  });
  it('builds the final URL with route and attribution parameters', () => {
    expect(finalUrlFor(route, 7)).toBe('/book?from=HNL&to=OGG&utm_source=google&utm_medium=cpc&utm_campaign=hnl-ogg&bfv=7');
  });
  it('picks untried combinations, prefers angles not live, and stops when the pool is spent', () => {
    const tried = new Set<string>();
    const total = anglesFor(route).reduce((n, a) => n + ANGLES[a].leads.length * ANGLES[a].descriptions.length * CLOSERS.length, 0);
    const rng = seededRng(1);
    const first = nextVariant({ campaign: route, tried, liveAngles: new Set(['compare', 'operator', 'flexible', 'no_markup']), angleStats: {}, rng })!;
    expect(first.angle).toBe('all_in');
    for (let i = 0; i < total; i++) {
      const c = nextVariant({ campaign: route, tried, liveAngles: new Set(), angleStats: {}, rng })!;
      expect(tried.has(componentsKey(c))).toBe(false);
      expect(lintAd(buildCopy(route, c, i + 1))).toEqual([]);
      tried.add(componentsKey(c));
    }
    expect(nextVariant({ campaign: route, tried, liveAngles: new Set(), angleStats: {}, rng })).toBeNull();
  });
  it('favours the angle with the better request rate', () => {
    const rng = seededRng(3);
    const picks = Array.from({ length: 200 }, () => nextVariant({ campaign: route, tried: new Set(), liveAngles: new Set(), rng,
      angleStats: { operator: { successes: 60, trials: 1000 }, compare: { successes: 5, trials: 1000 }, flexible: { successes: 5, trials: 1000 }, no_markup: { successes: 5, trials: 1000 }, all_in: { successes: 5, trials: 1000 } } })!.angle);
    expect(picks.filter(a => a === 'operator').length).toBeGreaterThan(190);
  });
});

describe('stats', () => {
  it('samples Beta with the right mean and is reproducible', () => {
    const rng = seededRng(7);
    const mean = Array.from({ length: 5000 }, () => sampleBeta(3, 7, rng)).reduce((a, b) => a + b, 0) / 5000;
    expect(mean).toBeGreaterThan(0.28);
    expect(mean).toBeLessThan(0.32);
    expect(seededRng(9)()).toBe(seededRng(9)());
  });
  it('gives the clear winner nearly all the probability, and splits evenly on a tie', () => {
    const p = probabilityBest([{ successes: 30, trials: 300 }, { successes: 6, trials: 300 }], seededRng(1));
    expect(p[0]).toBeGreaterThan(0.99);
    const tie = probabilityBest([{ successes: 10, trials: 300 }, { successes: 10, trials: 300 }], seededRng(1));
    expect(Math.abs(tie[0] - 0.5)).toBeLessThan(0.05);
  });
});

describe('decide', () => {
  const camp = (over: Partial<DecideCampaign> = {}): DecideCampaign => ({ id: 1, name: 'HNL-OGG', status: 'active', dailyBudgetCents: 3_000, budgetChangedAt: null, ...over });
  const v = (id: number, clicks: number, requests: number, costCents = clicks * 300, over: Partial<DecideVariant> = {}): DecideVariant => ({ id, campaignId: 1, status: 'active', clicks, requests, costCents, ...over });
  const run = (variants: DecideVariant[], over: Partial<Parameters<typeof decide>[0]> = {}) =>
    decide({ settings, campaigns: [camp()], variants, valuePerRequestCents: 3_000, monthSpendCents: 0, now: NOW, rng: seededRng(1), ...over });

  it('pauses the clear loser and launches its replacement', () => {
    const actions = run([v(1, 400, 40), v(2, 400, 6), v(3, 400, 38)]);
    expect(actions.filter(a => a.kind === 'pause')).toMatchObject([{ variantId: 2 }]);
    expect(actions.filter(a => a.kind === 'launch')).toHaveLength(1);
  });
  it('does not judge ads short of the click minimum', () => {
    const actions = run([v(1, 99, 20, 100), v(2, 99, 0, 100), v(3, 99, 9, 100)]);
    expect(actions.filter(a => a.kind === 'pause')).toEqual([]);
  });
  it('pauses an ad that spent three requests worth with nothing to show', () => {
    const actions = run([v(1, 40, 0, 9_000), v(2, 40, 2, 9_000), v(3, 40, 1, 2_000)]);
    expect(actions.filter(a => a.kind === 'pause')).toMatchObject([{ variantId: 1 }]);
  });
  it('tops a campaign up to the target count, counting drafts', () => {
    expect(run([]).filter(a => a.kind === 'launch')).toHaveLength(3);
    expect(run([v(1, 0, 0), v(2, 0, 0, 0, { status: 'draft' })]).filter(a => a.kind === 'launch')).toHaveLength(1);
    expect(run([v(1, 0, 0), v(2, 0, 0), v(3, 0, 0), v(4, 0, 0, 0, { status: 'paused' })]).filter(a => a.kind === 'launch')).toHaveLength(0);
  });
  it('raises the budget of a campaign that returns more than it costs, by one step', () => {
    const actions = run([v(1, 300, 30, 30_000), v(2, 300, 28, 30_000), v(3, 300, 29, 30_000)]);
    expect(actions.filter(a => a.kind === 'budget')).toMatchObject([{ fromCents: 3_000, toCents: 3_600 }]);
  });
  it('cuts the budget of a campaign that returns less than it costs, not below the floor', () => {
    const variants = [v(1, 300, 3, 90_000), v(2, 300, 2, 90_000), v(3, 300, 3, 90_000)];
    expect(run(variants).filter(a => a.kind === 'budget')).toMatchObject([{ toCents: 2_400 }]);
    expect(run(variants, { campaigns: [camp({ dailyBudgetCents: 550 })] }).filter(a => a.kind === 'budget')).toMatchObject([{ toCents: 500 }]);
  });
  it('leaves budgets alone inside the interval and without enough clicks', () => {
    const good = [v(1, 300, 30, 30_000), v(2, 300, 28, 30_000), v(3, 300, 29, 30_000)];
    expect(run(good, { campaigns: [camp({ budgetChangedAt: '2026-11-17T00:00:00Z' })] }).filter(a => a.kind === 'budget')).toEqual([]);
    expect(run([v(1, 20, 5, 2_000), v(2, 20, 5, 2_000), v(3, 20, 5, 2_000)]).filter(a => a.kind === 'budget')).toEqual([]);
  });
  it('never budgets past the monthly cap, even when no change is due', () => {
    const two = [camp({ id: 1, dailyBudgetCents: 8_000, budgetChangedAt: '2026-11-19T00:00:00Z' }), camp({ id: 2, name: 'B', dailyBudgetCents: 8_000, budgetChangedAt: '2026-11-19T00:00:00Z' })];
    const actions = decide({ settings, campaigns: two, variants: [], valuePerRequestCents: 3_000, monthSpendCents: 0, now: NOW, rng: seededRng(1) }).filter(a => a.kind === 'budget');
    const total = actions.reduce((s, a) => s + (a.kind === 'budget' ? a.toCents : 0), 0);
    expect(actions).toHaveLength(2);
    expect(total).toBeLessThanOrEqual(Math.floor(300_000 / 30.4));
    // Month nearly spent: 11 days left, $55 remaining.
    const tight = decide({ settings, campaigns: two, variants: [], valuePerRequestCents: 3_000, monthSpendCents: 294_500, now: NOW, rng: seededRng(1) }).filter(a => a.kind === 'budget');
    expect(tight.reduce((s, a) => s + (a.kind === 'budget' ? a.toCents : 0), 0)).toBeLessThanOrEqual(500);
    // Cap of zero: everything to zero.
    const zero = decide({ settings: { ...settings, monthlySpendCapCents: 0 }, campaigns: two, variants: [], valuePerRequestCents: 3_000, monthSpendCents: 0, now: NOW, rng: seededRng(1) });
    expect(zero.filter(a => a.kind === 'budget').every(a => a.kind === 'budget' && a.toCents === 0)).toBe(true);
  });
  it('ignores paused campaigns', () => {
    expect(run([], { campaigns: [camp({ status: 'paused' })] })).toEqual([]);
  });
});

describe('csv', () => {
  it('parses quoted fields and doubled quotes', () => {
    expect(parseCsv('a,"b,1","c ""x"""\r\n1,2,3\n')).toEqual([['a', 'b,1', 'c "x"'], ['1', '2', '3']]);
  });
});

describe('google adapter', () => {
  const env = { GOOGLE_ADS_API_VERSION: 'v25', GOOGLE_ADS_DEVELOPER_TOKEN: 'dev', GOOGLE_ADS_CUSTOMER_ID: '123-456-7890', GOOGLE_ADS_CLIENT_ID: 'id', GOOGLE_ADS_CLIENT_SECRET: 'secret', GOOGLE_ADS_REFRESH_TOKEN: 'refresh', APP_URL: 'https://bespoke.flights' } as unknown as NodeJS.ProcessEnv;
  const campaign = { id: 1, name: 'HNL-OGG', platform_campaign: 'customers/1234567890/campaigns/5', platform_ad_group: 'customers/1234567890/adGroups/77', platform_budget: 'customers/1234567890/campaignBudgets/9' };

  function mockFetch(replies: Record<string, unknown>) {
    const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      const u = String(url);
      if (u.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      calls.push({ url: u, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      const key = Object.keys(replies).find(k => u.endsWith(k));
      return new Response(JSON.stringify(key ? replies[key] : {}));
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it('is off unless every variable is present, and the version is explicit', () => {
    expect(googleAdsConfig(env)?.customerId).toBe('1234567890');
    expect(googleAdsConfig({ ...env, GOOGLE_ADS_API_VERSION: '' })).toBeNull();
    expect(googleAdsConfig({ ...env, GOOGLE_ADS_DEVELOPER_TOKEN: '' })).toBeNull();
    expect(googleAdsConfig({ ...env, APP_URL: 'http://localhost:3000' })).toBeNull();
  });
  it('reads metrics, converting micros to cents', async () => {
    const { impl, calls } = mockFetch({ 'googleAds:search': { results: [{ adGroupAd: { ad: { id: '555' } }, segments: { date: '2026-11-01' }, metrics: { impressions: '1000', clicks: '40', costMicros: '123450000' } }] } });
    const rows = await googleAds(googleAdsConfig(env)!, impl).fetchMetrics('2026-11-01', '2026-11-03');
    expect(rows).toEqual([{ platformAdId: '555', day: '2026-11-01', impressions: 1000, clicks: 40, costCents: 12345 }]);
    expect(calls[0].url).toBe('https://googleads.googleapis.com/v25/customers/1234567890/googleAds:search');
    expect((calls[0].body as { query: string }).query).toContain("BETWEEN '2026-11-01' AND '2026-11-02'");
    expect(calls[0].headers['developer-token']).toBe('dev');
  });
  it('creates, pauses and budgets with the expected requests', async () => {
    const { impl, calls } = mockFetch({ 'adGroupAds:mutate': { results: [{ resourceName: 'customers/1234567890/adGroupAds/77~999' }] } });
    const g = googleAds(googleAdsConfig(env)!, impl);
    expect(await g.createAd(campaign, { headlines: ['A', 'B', 'C'], descriptions: ['D', 'E'], finalUrl: '/book?bfv=3' })).toBe('999');
    expect(calls[0].body).toMatchObject({ operations: [{ create: { adGroup: campaign.platform_ad_group, status: 'ENABLED', ad: { finalUrls: ['https://bespoke.flights/book?bfv=3'] } } }] });
    await g.pauseAd(campaign, '999');
    expect(calls[1].body).toEqual({ operations: [{ updateMask: 'status', update: { resourceName: 'customers/1234567890/adGroupAds/77~999', status: 'PAUSED' } }] });
    await g.setDailyBudget(campaign, 3_600);
    expect(calls[2].body).toEqual({ operations: [{ updateMask: 'amount_micros', update: { resourceName: campaign.platform_budget, amountMicros: '36000000' } }] });
    await g.setDailyBudget(campaign, 0);
    expect(calls[4].body).toEqual({ operations: [{ updateMask: 'status', update: { resourceName: campaign.platform_campaign, status: 'PAUSED' } }] });
    await expect(g.pauseAd({ ...campaign, platform_ad_group: null }, '1')).rejects.toThrow('no ad group');
  });
});

describe('with a database', () => {
  let f: Fixture;
  let campaignId: number;

  const addVariant = async (angle: string, lead: number, status = 'active', adId: string | null = null) => {
    const { id } = await row<{ id: number }>(f.db,
      `INSERT INTO ad_variants (campaign_id, angle, components, headlines, descriptions, final_url, status, platform_ad_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      campaignId, angle, JSON.stringify({ angle, lead, description: 0, closer: 0 }), '["A","B","C"]', '["D","E"]', '/book?bfv=0', status, adId);
    return id;
  };
  const metrics = (variantId: number, day: string, clicks: number, costCents: number) =>
    f.db.run('INSERT INTO ad_metrics_daily (variant_id, day, impressions, clicks, cost_cents) VALUES (?, ?, ?, ?, ?)', [variantId, day, clicks * 20, clicks, costCents]);
  const requests = async (variantId: number, n: number, createdAt = '2026-11-10T00:00:00Z') => {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      ids.push((await row<{ id: number }>(f.db, 'INSERT INTO booking_requests (customer_id, ad_variant_id, created_at) VALUES (?, ?, ?) RETURNING id', f.customerId, variantId, createdAt)).id);
    }
    return ids;
  };
  const pay = (requestId: number, amount: number, fee: number, refunded = 0, paidAt = '2026-11-12T00:00:00Z') =>
    f.db.run(`INSERT INTO payments (request_id, quote_id, customer_id, operator_id, amount_cents, platform_fee_cents, operator_payout_cents, refunded_cents, status, provider, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'succeeded', 'stub', ?)`, [requestId, f.quoteA, f.customerId, f.operatorA, amount, fee, amount - fee, refunded, paidAt]);

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    who.session = null;
    who.cookie = undefined;
    f = await createFixture();
    setDb(f.db);
    campaignId = (await row<{ id: number }>(f.db,
      `INSERT INTO ad_campaigns (name, origin_code, dest_code, daily_budget_cents, platform_campaign, platform_ad_group, platform_budget) VALUES ('HNL-OGG', 'PHNL', 'PHOG', 3000, 'c/1', 'customers/1/adGroups/7', 'b/1') RETURNING id`)).id;
    await saveAdsSettings(f.db, { enabled: true, monthlySpendCapCents: 300_000 });
  });

  it('stores settings over defaults and rejects nothing valid', async () => {
    expect(await getAdsSettings(f.db)).toMatchObject({ enabled: true, monthlySpendCapCents: 300_000, monthlyNetGoalCents: 1_000_000, mode: 'manual' });
  });

  it('records the paid click on a new booking request', async () => {
    const { createBookingRequest } = await import('@/lib/bookings/create');
    who.cookie = encodeAttribution(attributionFromUrl(new URL('https://bespoke.flights/book?bfv=42&gclid=g1&utm_source=google'), NOW)!);
    const { id } = await createBookingRequest(f.db, f.customerId, { passengerCount: 2, legs: [{ originCode: 'PHNL', destCode: 'PHOG', departureDate: '2027-01-10' }] } as never);
    const saved = await row<{ ad_variant_id: number; attribution: string }>(f.db, 'SELECT ad_variant_id, attribution FROM booking_requests WHERE id = ?', id);
    expect(saved.ad_variant_id).toBe(42);
    expect(JSON.parse(saved.attribution)).toMatchObject({ gclid: 'g1', source: 'google' });
    who.cookie = undefined;
    const plain = await createBookingRequest(f.db, f.customerId, { passengerCount: 2, legs: [{ originCode: 'PHNL', destCode: 'PHOG', departureDate: '2027-01-10' }] } as never);
    expect((await row<{ ad_variant_id: number | null }>(f.db, 'SELECT ad_variant_id FROM booking_requests WHERE id = ?', plain.id)).ad_variant_id).toBeNull();
  });

  it('computes net per payment with and without absorbed processing', () => {
    const model = defaultBusinessModel();
    expect(netOfPayment(model, { amount_cents: 600_000, platform_fee_cents: 30_000, refunded_cents: 0 })).toBe(30_000 - 17_400 - 30);
    expect(netOfPayment({ ...model, passProcessingToOperator: true }, { amount_cents: 600_000, platform_fee_cents: 30_000, refunded_cents: 0 })).toBe(30_000);
    expect(netOfPayment({ ...model, passProcessingToOperator: true }, { amount_cents: 600_000, platform_fee_cents: 30_000, refunded_cents: 300_000 })).toBe(15_000);
  });

  it('measures each ad and the month against the goal', async () => {
    const model = { ...defaultBusinessModel(), passProcessingToOperator: true };
    const a = await addVariant('compare', 0), b = await addVariant('operator', 0);
    await metrics(a, '2026-11-05', 200, 60_000);
    await metrics(b, '2026-11-05', 100, 30_000);
    await metrics(b, '2026-10-01', 500, 99_000); // outside the window and the month
    const [r1] = await requests(a, 10);
    await requests(b, 2);
    await pay(r1, 800_000, 40_000);
    await pay(f.requestId, 1_000_000, 50_000); // organic booking

    const stats = await variantStats(f.db, model, new Date('2026-10-23T12:00:00Z'), new Date('2026-11-21T12:00:00Z'));
    expect(stats.find(s => s.id === a)).toMatchObject({ clicks: 200, costCents: 60_000, requests: 10, bookings: 1, netRevenueCents: 40_000 });
    expect(stats.find(s => s.id === b)).toMatchObject({ clicks: 100, costCents: 30_000, requests: 2, bookings: 0, netRevenueCents: 0 });

    const month = await monthSummary(f.db, model, settings, NOW);
    expect(month).toMatchObject({ month: '2026-11', platformNetCents: 90_000, attributedNetCents: 40_000, bookings: 2, attributedBookings: 1,
      attributedRequests: 12, adSpendCents: 90_000, netAfterAdsCents: 0, goalCents: 1_000_000, daysElapsed: 20, daysInMonth: 30, netPerBookingCents: 45_000 });
    expect(month.bookingsToGoal).toBe(Math.ceil(1_000_000 / 45_000));
  });

  it('values a request from the priors, then from mature bookings', async () => {
    const model = { ...defaultBusinessModel(), passProcessingToOperator: true };
    expect(await valuePerRequestCents(f.db, model, settings, NOW)).toBe(3_000); // 10% x $300
    const a = await addVariant('compare', 0);
    const ids = await requests(a, 20, '2026-10-01T00:00:00Z');
    await pay(ids[0], 2_000_000, 100_000);
    await pay(ids[1], 2_000_000, 100_000);
    await requests(a, 50, '2026-11-19T00:00:00Z'); // too recent to count
    expect(await valuePerRequestCents(f.db, model, settings, NOW)).toBe(Math.round((20 * 3_000 + 200_000) / 40));
  });

  it('imports a Google Ads report, matching by bfv or ad id, and replaces on re-import', async () => {
    const a = await addVariant('compare', 0), b = await addVariant('operator', 0, 'active', '555');
    const csv = `Ads report\n"Nov 1, 2026 - Nov 2, 2026"\nDay,Final URL,Ad ID,Impr.,Clicks,Cost\n2026-11-01,https://bespoke.flights/book?from=HNL&bfv=${a},111,"1,200",30,"1,050.50"\n"Nov 2, 2026",,555,400,10,31.00\n2026-11-02,https://bespoke.flights/book?bfv=9999,222,5,1,2.00\nTotal,,,1605,41,1083.50\n`;
    expect(await importMetricsCsv(f.db, csv)).toMatchObject({ imported: 2, skipped: 2 });
    expect(await row(f.db, 'SELECT impressions, clicks, cost_cents FROM ad_metrics_daily WHERE variant_id = ?', a)).toEqual({ impressions: 1200, clicks: 30, cost_cents: 105_050 });
    expect(await row(f.db, 'SELECT day, clicks FROM ad_metrics_daily WHERE variant_id = ?', b)).toEqual({ day: '2026-11-02', clicks: 10 });
    await importMetricsCsv(f.db, `Day,bfv,Impr.,Clicks,Cost\n2026-11-01,${a},10,3,9.00\n`);
    expect((await row<{ clicks: number }>(f.db, 'SELECT clicks FROM ad_metrics_daily WHERE variant_id = ?', a)).clicks).toBe(3);
    expect((await importMetricsCsv(f.db, 'foo,bar\n1,2\n')).problems[0]).toContain('No header row');
  });

  it('manual mode: seeds a campaign, queues changes once, and applies them when marked', async () => {
    const first = await runAdsLoop(f.db, { now: NOW, platform: null });
    expect(first).toMatchObject({ mode: 'manual', applied: 0, pending: 3, failed: 0 });
    const drafts = await f.db.query<VariantRow>("SELECT * FROM ad_variants WHERE status = 'draft'");
    expect(drafts).toHaveLength(3);
    expect(new Set(drafts.map(d => d.angle)).size).toBe(3);
    for (const d of drafts) {
      expect(d.final_url).toContain(`bfv=${d.id}`);
      expect(lintAd({ headlines: JSON.parse(d.headlines), descriptions: JSON.parse(d.descriptions), finalUrl: d.final_url })).toEqual([]);
    }
    // A second run does not queue the same launches again.
    expect(await runAdsLoop(f.db, { now: NOW, platform: null })).toMatchObject({ pending: 0 });
    expect((await f.db.query('SELECT 1 FROM ad_actions')).length).toBe(3);

    const launch = await row<ActionRow>(f.db, "SELECT * FROM ad_actions WHERE kind = 'launch' ORDER BY id LIMIT 1");
    await commitAction(f.db, launch, { platformAdId: '777' });
    expect(await row(f.db, 'SELECT status, platform_ad_id FROM ad_variants WHERE id = ?', launch.variant_id)).toEqual({ status: 'active', platform_ad_id: '777' });
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM ad_actions WHERE id = ?', launch.id)).status).toBe('applied');
  });

  it('manual mode: a queued pause is not queued twice and its replacement is drafted once', async () => {
    const a = await addVariant('compare', 0), b = await addVariant('operator', 0), c = await addVariant('flexible', 0);
    await metrics(a, '2026-11-10', 400, 120_000); await metrics(b, '2026-11-10', 400, 120_000); await metrics(c, '2026-11-10', 400, 120_000);
    await requests(a, 40); await requests(b, 5); await requests(c, 38);
    await runAdsLoop(f.db, { now: NOW, platform: null });
    await runAdsLoop(f.db, { now: NOW, platform: null });
    const pauses = await f.db.query<ActionRow>("SELECT * FROM ad_actions WHERE kind = 'pause'");
    expect(pauses).toMatchObject([{ variant_id: b, status: 'pending' }]);
    expect((await f.db.query("SELECT 1 FROM ad_actions WHERE kind = 'launch'")).length).toBe(1);
    const replacement = await row<VariantRow>(f.db, "SELECT * FROM ad_variants WHERE status = 'draft'");
    expect(['no_markup', 'all_in']).toContain(replacement.angle);
    await commitAction(f.db, pauses[0]);
    expect(await row(f.db, 'SELECT status FROM ad_variants WHERE id = ?', b)).toEqual({ status: 'paused' });
  });

  it('api mode: syncs metrics, pauses, launches and rebudgets through the platform', async () => {
    const a = await addVariant('compare', 0, 'active', '101'), b = await addVariant('operator', 0, 'active', '102'), c = await addVariant('flexible', 0, 'active', '103');
    await requests(a, 40); await requests(b, 5); await requests(c, 38);
    const calls: string[] = [];
    const platform: AdsPlatform = {
      name: 'google',
      fetchMetrics: async () => [a, b, c].map((_, i) => ({ platformAdId: String(101 + i), day: '2026-11-10', impressions: 8000, clicks: 400, costCents: 40_000 })).concat([{ platformAdId: 'unknown', day: '2026-11-10', impressions: 1, clicks: 1, costCents: 1 }]),
      pauseAd: async (_c, id) => { calls.push(`pause ${id}`); },
      createAd: async (_c, copy) => { calls.push(`create ${copy.headlines[1]}`); return '900'; },
      setDailyBudget: async (_c, cents) => { calls.push(`budget ${cents}`); },
    };
    const result = await runAdsLoop(f.db, { now: NOW, platform });
    expect(result).toMatchObject({ mode: 'google', applied: 3, pending: 0, failed: 0 });
    expect(result.notes[0]).toBe('synced 3 metric rows from google');
    expect(calls[0]).toBe('pause 102');
    expect(calls[1]).toMatch(/^create /);
    expect(calls[2]).toBe('budget 3600'); // 83 requests x $30 on $1,200 spend: returns about 2x
    expect(await row(f.db, 'SELECT status FROM ad_variants WHERE id = ?', b)).toEqual({ status: 'paused' });
    expect(await row(f.db, "SELECT status, platform_ad_id FROM ad_variants WHERE platform_ad_id = '900'")).toEqual({ status: 'active', platform_ad_id: '900' });
    expect((await row<{ daily_budget_cents: number }>(f.db, 'SELECT daily_budget_cents FROM ad_campaigns WHERE id = ?', campaignId)).daily_budget_cents).toBe(3_600);
    // Next day: the budget was just changed, the loser is gone, nothing more to do.
    await f.db.run('UPDATE ad_campaigns SET budget_changed_at = ? WHERE id = ?', [NOW.toISOString(), campaignId]); // commit stamps the database clock
    expect(await runAdsLoop(f.db, { now: new Date('2026-11-21T12:00:00Z'), platform })).toMatchObject({ applied: 0, pending: 0, failed: 0 });
  });

  it('api mode: a refused launch is kept as failed and retried on the next run', async () => {
    let refuse = true;
    const platform: AdsPlatform = {
      name: 'google', fetchMetrics: async () => [], pauseAd: async () => {}, setDailyBudget: async () => {},
      createAd: async () => { if (refuse) throw new Error('POLICY_FINDING'); return String(Math.floor(Math.random() * 1e9)); },
    };
    expect(await runAdsLoop(f.db, { now: NOW, platform })).toMatchObject({ applied: 0, failed: 3 });
    expect((await f.db.query("SELECT 1 FROM ad_variants WHERE status = 'active'")).length).toBe(0);
    expect((await row<{ error: string }>(f.db, 'SELECT error FROM ad_actions LIMIT 1')).error).toBe('POLICY_FINDING');
    refuse = false;
    const second = await runAdsLoop(f.db, { now: NOW, platform });
    expect(second.notes).toContain('retried queued changes: 3 applied, 0 failed');
    expect((await f.db.query("SELECT 1 FROM ad_variants WHERE status = 'active'")).length).toBe(3);
  });

  it('does nothing but measure while the loop is off, and holds budgets at zero with no cap', async () => {
    await saveAdsSettings(f.db, { enabled: false });
    const off = await runAdsLoop(f.db, { now: NOW, platform: null });
    expect(off).toMatchObject({ enabled: false, pending: 0 });
    expect(off.notes).toContain('loop is off: measured only');
    expect((await f.db.query('SELECT 1 FROM ad_actions')).length).toBe(0);

    await saveAdsSettings(f.db, { enabled: true, monthlySpendCapCents: 0 });
    await runAdsLoop(f.db, { now: NOW, platform: null });
    expect(JSON.parse((await row<{ detail: string }>(f.db, "SELECT detail FROM ad_actions WHERE kind = 'budget'")).detail)).toEqual({ fromCents: 3_000, toCents: 0 });
  });

  describe('routes', () => {
    const admin: SessionPayload = { userId: 1, role: 'admin' } as SessionPayload;
    const json = (method: string, body: unknown) => new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    it('cron: refuses callers without the secret or an admin session, runs for either', async () => {
      vi.stubEnv('CRON_SECRET', 's3cret');
      const cron = await import('@/app/api/cron/ads-loop/route');
      expect((await cron.GET(new Request('http://localhost/api/cron/ads-loop'))).status).toBe(401);
      expect((await cron.POST(new Request('http://localhost/api/cron/ads-loop', { method: 'POST' }))).status).toBe(401);
      const ok = await cron.GET(new Request('http://localhost/api/cron/ads-loop', { headers: { authorization: 'Bearer s3cret' } }));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ ok: true, mode: 'manual', pending: 3 });
      who.session = admin;
      expect((await cron.POST(new Request('http://localhost/api/cron/ads-loop', { method: 'POST' }))).status).toBe(200);
      vi.unstubAllEnvs();
    });

    it('admin routes: forbidden to others; settings, campaign, import and resolve work for admins', async () => {
      const settingsRoute = await import('@/app/api/admin/ads/settings/route');
      const campaigns = await import('@/app/api/admin/ads/campaigns/route');
      const metricsRoute = await import('@/app/api/admin/ads/metrics/route');
      const actions = await import('@/app/api/admin/ads/actions/[actionId]/route');
      const p = (id: number) => ({ params: Promise.resolve({ actionId: String(id) }) });

      who.session = { userId: f.customerId, role: 'customer' } as SessionPayload;
      expect((await settingsRoute.PATCH(json('PATCH', { enabled: false }))).status).toBe(403);
      expect((await campaigns.POST(json('POST', {}))).status).toBe(403);
      expect((await metricsRoute.POST(new Request('http://localhost/x', { method: 'POST', body: 'Day,Clicks,Cost' }))).status).toBe(403);
      expect((await actions.PATCH(json('PATCH', { status: 'applied' }), p(1))).status).toBe(403);

      who.session = admin;
      expect((await settingsRoute.PATCH(json('PATCH', { monthlySpendCapCents: -1 }))).status).toBe(400);
      expect((await settingsRoute.PATCH(json('PATCH', { bogus: 1 }))).status).toBe(400);
      expect(await (await settingsRoute.PATCH(json('PATCH', { monthlySpendCapCents: 150_000 }))).json()).toMatchObject({ monthlySpendCapCents: 150_000 });

      expect((await campaigns.POST(json('POST', { name: 'X', landingPath: '/book', dailyBudgetCents: 1000, originCode: 'HNL' }))).status).toBe(400);
      expect((await campaigns.POST(json('POST', { name: 'Bad', landingPath: '/admin', dailyBudgetCents: 1000 }))).status).toBe(400);
      const made = await campaigns.POST(json('POST', { name: 'LAX-HNL', originCode: 'lax', destCode: 'hnl', landingPath: '/book', dailyBudgetCents: 2500 }));
      expect(made.status).toBe(201);
      expect(await made.json()).toMatchObject({ name: 'LAX-HNL', origin_code: 'LAX', daily_budget_cents: 2500 });
      expect((await campaigns.POST(json('POST', { name: 'LAX-HNL', landingPath: '/book', dailyBudgetCents: 1 }))).status).toBe(400);

      await runAdsLoop(f.db, { now: NOW, platform: null });
      const [launch, other] = await f.db.query<ActionRow>("SELECT * FROM ad_actions WHERE kind = 'launch' ORDER BY id");
      expect((await actions.PATCH(json('PATCH', { status: 'applied', platformAdId: 'abc' }), p(launch.id))).status).toBe(400);
      expect((await actions.PATCH(json('PATCH', { status: 'applied', platformAdId: '4242' }), p(launch.id))).status).toBe(200);
      expect(await row(f.db, 'SELECT status, platform_ad_id FROM ad_variants WHERE id = ?', launch.variant_id)).toEqual({ status: 'active', platform_ad_id: '4242' });
      expect((await actions.PATCH(json('PATCH', { status: 'applied' }), p(launch.id))).status).toBe(409);
      expect((await actions.PATCH(json('PATCH', { status: 'dismissed' }), p(other.id))).status).toBe(200);
      expect(await row(f.db, 'SELECT status FROM ad_variants WHERE id = ?', other.variant_id)).toEqual({ status: 'paused' });
      expect((await actions.PATCH(json('PATCH', { status: 'applied' }), p(99999))).status).toBe(404);

      const imported = await metricsRoute.POST(new Request('http://localhost/x', { method: 'POST', body: `Day,bfv,Impr.,Clicks,Cost\n2026-11-01,${launch.variant_id},100,5,12.00\n` }));
      expect(await imported.json()).toMatchObject({ imported: 1 });
      expect((await metricsRoute.POST(new Request('http://localhost/x', { method: 'POST', body: 'nope' }))).status).toBe(400);
    });
  });
});

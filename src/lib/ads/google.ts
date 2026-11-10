/**
 * Google Ads API adapter (REST). Used only when the ads loop is in api mode
 * and every GOOGLE_ADS_* variable below is set.
 *
 *   GOOGLE_ADS_API_VERSION        e.g. v25. Required: Google retires each version about a year after release.
 *   GOOGLE_ADS_DEVELOPER_TOKEN    from the manager account's API Center
 *   GOOGLE_ADS_CUSTOMER_ID        the advertiser account, digits only
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID  the manager account, digits only (optional)
 *   GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN   OAuth for a user with access
 *   APP_URL                       site origin, for absolute final URLs
 *
 * NOT YET RUN AGAINST A LIVE ACCOUNT. Request shapes follow Google's REST
 * reference and are covered by tests with a mocked fetch. Before switching
 * the loop to api mode, run one pause, one create and one budget change
 * against a test account and confirm each in the Google Ads UI.
 */
import type { AdCopy } from './lint';
import type { AdsPlatform, MetricRow, PlatformCampaign } from './platform';

interface Config {
  version: string; developerToken: string; customerId: string; loginCustomerId?: string;
  clientId: string; clientSecret: string; refreshToken: string; appUrl: string;
}

const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '');

export function googleAdsConfig(env: NodeJS.ProcessEnv): Config | null {
  const c: Config = {
    version: (env.GOOGLE_ADS_API_VERSION ?? '').trim(),
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    customerId: digits(env.GOOGLE_ADS_CUSTOMER_ID),
    loginCustomerId: digits(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) || undefined,
    clientId: env.GOOGLE_ADS_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET ?? '',
    refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN ?? '',
    appUrl: (env.APP_URL ?? '').replace(/\/$/, ''),
  };
  const complete = /^v\d+$/.test(c.version) && c.developerToken && c.customerId && c.clientId && c.clientSecret && c.refreshToken && /^https:\/\//.test(c.appUrl);
  return complete ? c : null;
}

export function googleAdsFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): AdsPlatform | null {
  const config = googleAdsConfig(env);
  return config ? googleAds(config, fetchImpl) : null;
}

export function googleAds(config: Config, fetchImpl: typeof fetch = fetch): AdsPlatform {
  const base = `https://googleads.googleapis.com/${config.version}/customers/${config.customerId}`;
  let token: { value: string; expires: number } | undefined;

  async function accessToken(): Promise<string> {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken }),
    });
    if (!res.ok) throw new Error(`Google OAuth ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    return token.value;
  }

  async function call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetchImpl(`${base}/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await accessToken()}`,
        'developer-token': config.developerToken,
        ...(config.loginCustomerId ? { 'login-customer-id': config.loginCustomerId } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google Ads ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  const need = (value: string | null, what: string, campaign: PlatformCampaign): string => {
    if (!value) throw new Error(`Campaign "${campaign.name}" has no ${what} resource name`);
    return value;
  };
  const adGroupId = (campaign: PlatformCampaign) => need(campaign.platform_ad_group, 'ad group', campaign).split('/').pop()!;

  return {
    name: 'google',

    async fetchMetrics(since, until) {
      const last = new Date(new Date(`${until}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
      const query = `SELECT ad_group_ad.ad.id, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros
        FROM ad_group_ad WHERE segments.date BETWEEN '${since}' AND '${last}'`;
      const out: MetricRow[] = [];
      let pageToken: string | undefined;
      do {
        const page = await call<{ results?: { adGroupAd: { ad: { id: string } }; segments: { date: string }; metrics: { impressions?: string; clicks?: string; costMicros?: string } }[]; nextPageToken?: string }>(
          'googleAds:search', { query, ...(pageToken ? { pageToken } : {}) });
        for (const r of page.results ?? []) {
          out.push({
            platformAdId: String(r.adGroupAd.ad.id), day: r.segments.date,
            impressions: Number(r.metrics.impressions ?? 0), clicks: Number(r.metrics.clicks ?? 0),
            costCents: Math.round(Number(r.metrics.costMicros ?? 0) / 10_000),
          });
        }
        pageToken = page.nextPageToken || undefined;
      } while (pageToken);
      return out;
    },

    async pauseAd(campaign, platformAdId) {
      await call('adGroupAds:mutate', { operations: [{ updateMask: 'status',
        update: { resourceName: `customers/${config.customerId}/adGroupAds/${adGroupId(campaign)}~${platformAdId}`, status: 'PAUSED' } }] });
    },

    async createAd(campaign, copy: AdCopy) {
      const res = await call<{ results: { resourceName: string }[] }>('adGroupAds:mutate', { operations: [{ create: {
        adGroup: need(campaign.platform_ad_group, 'ad group', campaign),
        status: 'ENABLED',
        ad: {
          finalUrls: [new URL(copy.finalUrl, config.appUrl).toString()],
          responsiveSearchAd: { headlines: copy.headlines.map(text => ({ text })), descriptions: copy.descriptions.map(text => ({ text })) },
        },
      } }] });
      const id = res.results?.[0]?.resourceName?.split('~').pop();
      if (!id) throw new Error('Google Ads returned no ad id');
      return id;
    },

    async setDailyBudget(campaign, cents) {
      const campaignName = need(campaign.platform_campaign, 'campaign', campaign);
      if (cents <= 0) {
        await call('campaigns:mutate', { operations: [{ updateMask: 'status', update: { resourceName: campaignName, status: 'PAUSED' } }] });
        return;
      }
      await call('campaignBudgets:mutate', { operations: [{ updateMask: 'amount_micros',
        update: { resourceName: need(campaign.platform_budget, 'budget', campaign), amountMicros: String(cents * 10_000) } }] });
      await call('campaigns:mutate', { operations: [{ updateMask: 'status', update: { resourceName: campaignName, status: 'ENABLED' } }] });
    },
  };
}

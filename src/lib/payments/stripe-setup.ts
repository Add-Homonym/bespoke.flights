/**
 * Stripe setup from the admin Payments page: readiness checks and webhook
 * endpoints. The webhook signing secrets Stripe returns on creation are kept in
 * platform_settings, so no environment variables need copying by hand.
 * STRIPE_WEBHOOK_SECRET / STRIPE_CONNECT_WEBHOOK_SECRET still work and are
 * checked first.
 */

import type Stripe from 'stripe';
import type { Db } from '@/lib/db';
import { getStripe } from './stripe';
import { appBaseUrl, getPaymentsMode } from './config';

/** Platform-account events (see src/lib/payments/service.ts handleStripeEvent). */
export const PLATFORM_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
];
/** Connected-account events. */
export const CONNECT_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = ['account.updated'];

const KEYS = { platform: 'stripe_webhook_secret', connect: 'stripe_connect_webhook_secret' } as const;
const DESCRIPTION = 'bespoke.flights';

export function webhookUrl(): string {
  return `${appBaseUrl()}/api/webhooks/stripe`;
}

async function setting(db: Db, key: string): Promise<string | null> {
  return (await db.one<{ value: string }>('SELECT value FROM platform_settings WHERE key = ?', [key]))?.value ?? null;
}

async function putSetting(db: Db, key: string, value: string): Promise<void> {
  await db.run(`INSERT INTO platform_settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [key, value]);
}

/** Every webhook signing secret to try: environment first, then those created from the admin page. */
export async function allWebhookSecrets(db: Db): Promise<string[]> {
  const env = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET];
  const stored = await Promise.all([setting(db, KEYS.platform), setting(db, KEYS.connect)]).catch(() => [null, null]);
  return [...new Set([...env, ...stored].filter((s): s is string => !!s))];
}

export interface StripeReadiness {
  mode: 'stripe' | 'stub' | 'disabled';
  keyMode: 'live' | 'test' | null;
  appUrl: string | null;
  account: { id: string; name: string | null; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; country: string | null } | null;
  /** Connect is enabled when the platform can create connected accounts; checked by listing them. */
  connect: boolean | null;
  webhooks: { platform: 'env' | 'stored' | null; connect: 'env' | 'stored' | null; endpoints: { id: string; url: string; status: string; connect: boolean }[] };
  error: string | null;
  ready: boolean;
}

export async function checkStripe(db: Db): Promise<StripeReadiness> {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  const out: StripeReadiness = {
    mode: getPaymentsMode(),
    keyMode: key.startsWith('sk_live_') || key.startsWith('rk_live_') ? 'live' : key ? 'test' : null,
    appUrl: null,
    account: null,
    connect: null,
    webhooks: {
      platform: process.env.STRIPE_WEBHOOK_SECRET ? 'env' : (await setting(db, KEYS.platform)) ? 'stored' : null,
      connect: process.env.STRIPE_CONNECT_WEBHOOK_SECRET ? 'env' : (await setting(db, KEYS.connect)) ? 'stored' : null,
      endpoints: [],
    },
    error: null,
    ready: false,
  };
  try { out.appUrl = appBaseUrl(); } catch { out.appUrl = null; }
  if (!key) return out;

  try {
    const stripe = getStripe();
    const acct = await stripe.accounts.retrieveCurrent();
    out.account = {
      id: acct.id,
      name: acct.settings?.dashboard?.display_name ?? acct.business_profile?.name ?? null,
      chargesEnabled: !!acct.charges_enabled,
      payoutsEnabled: !!acct.payouts_enabled,
      detailsSubmitted: !!acct.details_submitted,
      country: acct.country ?? null,
    };
    try {
      await stripe.accounts.list({ limit: 1 });
      out.connect = true;
    } catch {
      out.connect = false;
    }
    const url = out.appUrl ? `${out.appUrl}/api/webhooks/stripe` : null;
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    out.webhooks.endpoints = endpoints.data
      .filter(e => !url || e.url === url)
      .map(e => ({ id: e.id, url: e.url, status: e.status, connect: !!(e as { application?: unknown }).application || e.enabled_events.includes('account.updated') }));
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  out.ready = out.mode === 'stripe' && !!out.account?.chargesEnabled && out.connect === true
    && !!out.webhooks.platform && !!out.webhooks.connect && !!out.appUrl;
  return out;
}

/**
 * Create the two webhook endpoints at this app's URL and keep their signing
 * secrets. Endpoints at the same URL made earlier are replaced, because Stripe
 * only reveals a signing secret when the endpoint is created.
 */
export async function setupWebhooks(db: Db): Promise<{ platformId: string; connectId: string; replaced: number }> {
  const stripe = getStripe();
  const url = webhookUrl();
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const old = existing.data.filter(e => e.url === url);

  const platform = await stripe.webhookEndpoints.create({ url, enabled_events: PLATFORM_EVENTS, description: `${DESCRIPTION} payments` });
  const connect = await stripe.webhookEndpoints.create({ url, enabled_events: CONNECT_EVENTS, connect: true, description: `${DESCRIPTION} operator accounts` });
  if (!platform.secret || !connect.secret) throw new Error('Stripe did not return webhook signing secrets');
  await putSetting(db, KEYS.platform, platform.secret);
  await putSetting(db, KEYS.connect, connect.secret);

  for (const e of old) await stripe.webhookEndpoints.del(e.id).catch(() => {});
  return { platformId: platform.id, connectId: connect.id, replaced: old.length };
}

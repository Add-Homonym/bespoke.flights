import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { createFixture, type Fixture } from './fixtures';
import { setStripeClient } from '../stripe';
import { allWebhookSecrets, checkStripe, CONNECT_EVENTS, PLATFORM_EVENTS, setupWebhooks } from '../stripe-setup';

let f: Fixture;
let endpoints: { id: string; url: string; status: string; enabled_events: string[] }[];
let deleted: string[];
let created: Record<string, unknown>[];
let connectOn = true;

const fake = {
  accounts: {
    retrieveCurrent: async () => ({ id: 'acct_platform', charges_enabled: true, payouts_enabled: true, details_submitted: true, country: 'US', business_profile: { name: 'Bespoke Flights' } }),
    list: async () => { if (!connectOn) throw new Error('Connect not enabled'); return { data: [] }; },
  },
  webhookEndpoints: {
    list: async () => ({ data: endpoints }),
    create: async (p: { url: string; enabled_events: string[]; connect?: boolean }) => {
      created.push(p);
      const e = { id: `we_${created.length}`, url: p.url, status: 'enabled', enabled_events: p.enabled_events, secret: `whsec_${created.length}` };
      endpoints.push(e);
      return e;
    },
    del: async (id: string) => { deleted.push(id); endpoints = endpoints.filter(e => e.id !== id); return { id, deleted: true }; },
  },
} as unknown as Stripe;

beforeAll(async () => {
  f = await createFixture();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
  vi.stubEnv('APP_URL', 'https://www.bespoke.flights');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', '');
  vi.stubEnv('APP_TEST_MODE', '');
  setStripeClient(fake);
});
beforeEach(() => { endpoints = []; deleted = []; created = []; connectOn = true; });
afterAll(() => { setStripeClient(null); vi.unstubAllEnvs(); });

describe('Stripe setup', () => {
  it('reports what is missing before webhooks exist', async () => {
    await f.db.run('DELETE FROM platform_settings');
    const s = await checkStripe(f.db);
    expect(s).toMatchObject({ mode: 'stripe', keyMode: 'test', appUrl: 'https://www.bespoke.flights', connect: true, ready: false });
    expect(s.account).toMatchObject({ id: 'acct_platform', chargesEnabled: true, name: 'Bespoke Flights' });
    expect(s.webhooks).toMatchObject({ platform: null, connect: null });
  });

  it('creates both endpoints, stores their secrets and becomes ready', async () => {
    const r = await setupWebhooks(f.db);
    expect(created).toEqual([
      expect.objectContaining({ url: 'https://www.bespoke.flights/api/webhooks/stripe', enabled_events: PLATFORM_EVENTS }),
      expect.objectContaining({ url: 'https://www.bespoke.flights/api/webhooks/stripe', enabled_events: CONNECT_EVENTS, connect: true }),
    ]);
    expect(r.replaced).toBe(0);
    expect(await allWebhookSecrets(f.db)).toEqual(['whsec_1', 'whsec_2']);
    const s = await checkStripe(f.db);
    expect(s.webhooks).toMatchObject({ platform: 'stored', connect: 'stored' });
    expect(s.ready).toBe(true);
  });

  it('replaces older endpoints at the same URL and leaves others alone', async () => {
    endpoints = [
      { id: 'we_old', url: 'https://www.bespoke.flights/api/webhooks/stripe', status: 'enabled', enabled_events: ['*'] },
      { id: 'we_other', url: 'https://other.example/hook', status: 'enabled', enabled_events: ['*'] },
    ];
    const r = await setupWebhooks(f.db);
    expect(r.replaced).toBe(1);
    expect(deleted).toEqual(['we_old']);
    expect(endpoints.map(e => e.id)).toContain('we_other');
  });

  it('flags Connect when it is not enabled', async () => {
    connectOn = false;
    const s = await checkStripe(f.db);
    expect(s.connect).toBe(false);
    expect(s.ready).toBe(false);
  });

  it('prefers secrets from the environment', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_env');
    expect((await allWebhookSecrets(f.db))[0]).toBe('whsec_env');
    expect((await checkStripe(f.db)).webhooks.platform).toBe('env');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
  });
});

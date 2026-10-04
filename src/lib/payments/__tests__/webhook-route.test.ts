import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { NextRequest } from 'next/server';
import { createFixture, row, type Fixture } from './fixtures';
import { setDb } from '@/lib/db';
import { setStripeClient } from '../stripe';

const SECRET = 'whsec_test_secret';
const CONNECT_SECRET = 'whsec_test_connect';
const stripe = new Stripe('sk_test_dummy');
let f: Fixture;
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', CONNECT_SECRET);
  vi.stubEnv('RESEND_API_KEY', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  setStripeClient(stripe);
  f = await createFixture();
  setDb(f.db);
  ({ POST } = await import('@/app/api/webhooks/stripe/route'));
});

afterAll(() => {
  setStripeClient(null);
  setDb(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function signedRequest(payload: string, secret = SECRET, signature?: string) {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret }) },
    body: payload,
  });
}

describe('POST /api/webhooks/stripe', () => {
  it('rejects a missing signature', async () => {
    const res = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(400);
  });

  it('rejects a payload signed with the wrong secret', async () => {
    const payload = JSON.stringify({ id: 'evt_bad', type: 'account.updated', data: { object: {} } });
    const res = await POST(signedRequest(payload, 'whsec_wrong'));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered payload', async () => {
    const payload = JSON.stringify({ id: 'evt_t', type: 'account.updated', data: { object: {} } });
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const res = await POST(signedRequest(payload.replace('evt_t', 'evt_u'), SECRET, sig));
    expect(res.status).toBe(400);
  });

  it('refuses webhooks in test mode', async () => {
    vi.stubEnv('APP_TEST_MODE', 'true');
    try {
      const payload = JSON.stringify({ id: 'evt_test_mode', type: 'account.updated', data: { object: {} } });
      const res = await POST(signedRequest(payload));
      expect(res.status).toBe(503);
    } finally {
      vi.stubEnv('APP_TEST_MODE', '');
    }
  });

  it('processes a verified checkout completion and books the request', async () => {
    const { id: paymentId } = await row<{ id: number }>(f.db, `
      INSERT INTO payments (request_id, quote_id, customer_id, operator_id, amount_cents, platform_fee_cents, operator_payout_cents, status, provider, stripe_checkout_session_id)
      VALUES (?, ?, ?, ?, 8500000, 425000, 8075000, 'pending', 'stripe', 'cs_live_1')
      RETURNING id
    `, f.requestId, f.quoteA, f.customerId, f.operatorA);

    const payload = JSON.stringify({
      id: 'evt_ok', object: 'event', type: 'checkout.session.completed',
      data: { object: { id: 'cs_live_1', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_live_1', metadata: { payment_id: String(paymentId) } } },
    });
    const res = await POST(signedRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: 'processed' });
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM payments WHERE id = ?', paymentId)).status).toBe('succeeded');
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM booking_requests WHERE id = ?', f.requestId)).status).toBe('booked');

    const again = await POST(signedRequest(payload));
    expect(await again.json()).toEqual({ received: true, result: 'skipped' });
  });

  it('accepts events signed with the Connect endpoint secret', async () => {
    const payload = JSON.stringify({
      id: 'evt_connect', object: 'event', type: 'account.updated', account: 'acct_bravo',
      data: { object: { id: 'acct_bravo', object: 'account', charges_enabled: false, payouts_enabled: false, details_submitted: false } },
    });
    const res = await POST(signedRequest(payload, CONNECT_SECRET));
    expect(res.status).toBe(200);
    expect((await row<{ stripe_charges_enabled: number }>(f.db, 'SELECT stripe_charges_enabled FROM operators WHERE id = ?', f.operatorB)).stripe_charges_enabled).toBe(0);
  });
});

describe('proxy', () => {
  it('lets Stripe reach the webhook without a session cookie', async () => {
    const { proxy } = await import('@/proxy');
    const res = await proxy(new NextRequest('http://localhost/api/webhooks/stripe', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('still protects payment APIs', async () => {
    const { proxy } = await import('@/proxy');
    const res = await proxy(new NextRequest('http://localhost/api/payments/checkout', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('refuses the cron endpoint to anonymous callers without exposing it as public', async () => {
    const { proxy } = await import('@/proxy');
    const res = await proxy(new NextRequest('http://localhost/api/cron/weekly-discovery', { method: 'GET' }));
    // Passes through: the route itself enforces CRON_SECRET.
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects cross-site mutations of cookie-authenticated APIs', async () => {
    const { proxy } = await import('@/proxy');
    const res = await proxy(new NextRequest('http://localhost/api/quotes/1', {
      method: 'PATCH',
      headers: { origin: 'https://evil.example', host: 'localhost' },
    }));
    expect(res.status).toBe(403);
  });

  it('accepts same-origin mutations', async () => {
    const { proxy } = await import('@/proxy');
    const res = await proxy(new NextRequest('http://localhost/api/quotes/1', {
      method: 'PATCH',
      headers: { origin: 'http://localhost', host: 'localhost' },
    }));
    // Same origin but no session: falls through to the auth check.
    expect(res.status).toBe(401);
  });
});

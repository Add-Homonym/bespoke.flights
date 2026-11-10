import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFixture, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import { plural } from '@/lib/plural';
import { displayCode } from '@/lib/airports';
import { fromDbLegs, tripRoute } from '@/lib/trip-format';
import { checkoutDescription } from '@/lib/payments/service';
import { describePolicy, DEFAULT_POLICY } from '@/lib/bookings/policy';
import type { SessionPayload } from '@/lib/types';

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

let f: Fixture;
let outreach: typeof import('./route');

beforeAll(async () => {
  f = await createFixture();
  setDb(f.db);
  outreach = await import('./route');
  await f.db.run(
    'INSERT INTO outreach_log (request_id, operator_id, method, match_score, rfq_subject, rfq_body, status, reply_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [f.requestId, f.operatorA, 'email', 87, 'RFQ', 'secret rfq body', 'sent', 'tok_secret']);
});
afterAll(() => setDb(null));

const get = () => outreach.GET(new Request(`http://localhost/api/outreach?requestId=${f.requestId}`));

describe('outreach visibility', () => {
  it('shows a traveler who was asked and how it stands, without score, channel, RFQ text or reply token', async () => {
    who.session = { userId: f.customerId, role: 'customer' };
    const rows = await (await get()).json();
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(['company_name', 'id', 'operator_id', 'quote_id', 'quote_price', 'quote_status', 'request_id', 'responded_at', 'sent_at', 'status']);
    expect(JSON.stringify(rows)).not.toMatch(/match_score|contact_method|rfq_|reply_token|tok_secret/);
  });

  it('keeps the full row for admins', async () => {
    who.session = { userId: 999, role: 'admin' };
    const rows = await (await get()).json();
    expect(rows[0]).toMatchObject({ match_score: 87, reply_token: 'tok_secret' });
  });
});

describe('copy helpers', () => {
  it('pluralizes counts', () => {
    expect(plural(1, 'operator')).toBe('1 operator');
    expect(plural(0, 'operator')).toBe('0 operators');
    expect(plural(3, 'operator')).toBe('3 operators');
  });

  it('shows IATA codes wherever routes are read', () => {
    expect(displayCode('PHNL')).toBe('HNL');
    expect(displayCode('KLAX')).toBe('LAX');
    expect(displayCode('OGG')).toBe('OGG');
    expect(displayCode('ZZZZ')).toBe('ZZZZ');
    const legs = fromDbLegs([
      { origin_code: 'PHNL', dest_code: 'PHOG', departure_date: '2030-01-01', departure_time: null },
      { origin_code: 'PHOG', dest_code: 'PHNL', departure_date: '2030-01-02', departure_time: null },
    ]);
    expect(tripRoute(legs)).toBe('HNL → OGG → HNL');
  });

  it('puts the cancellation policy in the Stripe checkout description', () => {
    const text = checkoutDescription('Alpha Air', { id: 4, passenger_count: 2, notes: null }, [], describePolicy(DEFAULT_POLICY));
    expect(text).toContain('Cancellation: Full refund 72 hours or more before departure.');
  });
});

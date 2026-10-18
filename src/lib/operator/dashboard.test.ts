import { beforeAll, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { buildDashboard } from './dashboard';

let f: Fixture;
const now = new Date('2026-10-18T12:00:00Z');

beforeAll(async () => {
  f = await createFixture();
  const { db, operatorA, operatorB, requestId, quoteA, customerId } = f;
  const ins = 'INSERT INTO outreach_log (request_id, operator_id, method, rfq_body, sent_at) VALUES (?, ?, ?, ?, ?)';
  await db.run(ins, [requestId, operatorA, 'email', 'x', '2026-10-17T00:00:00Z']); // quoted (quoteA exists), this week
  const open2 = (await db.one<{ id: number }>(`INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'open', 2) RETURNING id`, [customerId]))!.id;
  const closed = (await db.one<{ id: number }>(`INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'cancelled', 2) RETURNING id`, [customerId]))!.id;
  await db.run(ins, [open2, operatorA, 'email', 'x', '2026-10-05T00:00:00Z']); // awaiting, previous 7-day window
  await db.run(ins, [closed, operatorA, 'email', 'x', '2026-06-01T00:00:00Z']); // missed, outside the chart
  await db.run(ins, [open2, operatorB, 'email', 'x', '2026-10-17T00:00:00Z']); // other operator

  await db.run(`UPDATE quotes SET status = 'accepted' WHERE id = ?`, [quoteA]);
  // Quotes on requests that were not routed to A (A found them under All demand).
  for (const status of ['rejected', 'pending']) {
    const r = (await db.one<{ id: number }>(`INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'open', 2) RETURNING id`, [customerId]))!.id;
    await db.run(`INSERT INTO quotes (request_id, operator_id, price_cents, status) VALUES (?, ?, 100, ?)`, [r, operatorA, status]);
  }

  const pay = `INSERT INTO payments (request_id, quote_id, customer_id, operator_id, amount_cents, platform_fee_cents, operator_payout_cents, refunded_cents, status, provider, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'stub', ?)`;
  await db.run(pay, [requestId, quoteA, customerId, operatorA, 100_000, 10_000, 90_000, 0, 'succeeded', '2026-10-02T00:00:00Z']);
  await db.run(pay, [requestId, quoteA, customerId, operatorA, 100_000, 10_000, 90_000, 50_000, 'partially_refunded', '2026-08-15T00:00:00Z']);
  await db.run(pay, [requestId, quoteA, customerId, operatorA, 100_000, 10_000, 90_000, 0, 'failed', null]);

  const staff = 'INSERT INTO operator_staff (operator_id, name, role, email, phone, notify_email, notify_sms, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  await db.run(staff, [operatorA, 'Kai', 'Dispatch', 'kai@a.com', '+18085550100', 1, 1, 1]);
  await db.run(staff, [operatorA, 'Lee', null, null, '+18085550101', 1, 0, 1]);
  await db.run(staff, [operatorA, 'Old', null, 'old@a.com', null, 1, 0, 0]);

  const ac = 'INSERT INTO aircraft (operator_id, tail_number, type, capacity, faa_record) VALUES (?, ?, ?, ?, ?) RETURNING id';
  const g = (await db.one<{ id: number }>(ac, [operatorA, 'N1', 'G650', 12, JSON.stringify({ status: 'assigned', registrationStatus: 'Valid', registrationExpires: '2029-01-01' })]))!.id;
  await db.run(ac, [operatorA, 'N2', 'King Air', 8, JSON.stringify({ status: 'assigned', registrationStatus: 'Valid', registrationExpires: '2025-01-01' })]);
  await db.run(ac, [operatorA, 'N3', 'Citation', 7, null]);
  await db.run(`INSERT INTO aircraft_photos (aircraft_id, content_type, bytes) VALUES (?, 'image/jpeg', ?)`, [g, new Uint8Array([0xff, 0xd8, 0xff])]);
});

describe('buildDashboard', () => {
  it('summarizes inbound requests by outcome and week', async () => {
    const d = await buildDashboard(f.db, f.operatorA, now);
    expect(d.inbound).toMatchObject({ awaiting: 1, quoted: 1, missed: 1, total: 3 });
    // Rolling 7-day windows ending now: Oct 5 is 13.5 days back.
    expect(d.inbound.weekly).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
  });

  it('counts quotes by status with a win rate', async () => {
    const d = await buildDashboard(f.db, f.operatorA, now);
    expect(d.quotes).toEqual({ pending: 1, accepted: 1, rejected: 1, withdrawn: 0, total: 3, winRate: 0.5 });
  });

  it('totals payouts net of refunds, by month', async () => {
    const d = await buildDashboard(f.db, f.operatorA, now);
    expect(d.earnings).toMatchObject({ payoutCents: 135_000, paidBookings: 2, refundedCents: 50_000 });
    expect(d.earnings.monthly.map(m => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(d.earnings.monthly.map(m => m.cents)).toEqual([0, 0, 0, 45_000, 0, 90_000]);
  });

  it('summarizes team alerts and the fleet', async () => {
    const d = await buildDashboard(f.db, f.operatorA, now);
    expect(d.team).toMatchObject({ active: 2, inactive: 1, emailAlerts: 1, smsAlerts: 1 });
    expect(d.team.members.map(m => m.name)).toEqual(['Kai', 'Lee']);
    expect(d.fleet).toMatchObject({ count: 3, seats: 27, withPhotos: 1, registryFlags: 1, unchecked: 1 });
    expect(d.fleet.aircraft.find(a => a.tail === 'N1')?.coverPhotoId).toBeTypeOf('number');
  });

  it('is empty for a new operator', async () => {
    const d = await buildDashboard(f.db, f.operatorB, now);
    expect(d.quotes.total).toBe(1);
    expect(d.earnings.payoutCents).toBe(0);
    expect(d.fleet.count).toBe(0);
    expect(d.quotes.winRate).toBeNull();
  });
});

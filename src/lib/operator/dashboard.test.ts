import { beforeAll, describe, expect, it } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import type { Operator } from '@/lib/types';
import { buildDashboard } from './dashboard';

let f: Fixture;
const now = new Date('2026-10-18T12:00:00Z');
const op = (id: number) => row<Operator>(f.db, 'SELECT * FROM operators WHERE id = ?', id);

beforeAll(async () => {
  f = await createFixture();
  const { db, operatorA, operatorB, requestId, quoteA, customerId } = f;
  const newRequest = async (status: string) =>
    (await db.one<{ id: number }>(`INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, ?, 2) RETURNING id`, [customerId, status]))!.id;
  const open2 = await newRequest('open');
  const closed = await newRequest('cancelled');
  const ins = 'INSERT INTO outreach_log (request_id, operator_id, method, rfq_body) VALUES (?, ?, ?, ?)';
  await db.run(ins, [requestId, operatorA, 'email', 'x']); // quoted (quoteA)
  await db.run(ins, [open2, operatorA, 'email', 'x']);     // awaiting
  await db.run(ins, [closed, operatorA, 'email', 'x']);    // closed unquoted
  await db.run(ins, [open2, operatorB, 'email', 'x']);     // other operator

  await db.run(`UPDATE quotes SET status = 'accepted' WHERE id = ?`, [quoteA]); // 8,500,000
  const q = `INSERT INTO quotes (request_id, operator_id, price_cents, status) VALUES (?, ?, ?, ?)`;
  await db.run(q, [await newRequest('booked'), operatorA, 1_500_000, 'accepted']);
  await db.run(q, [await newRequest('open'), operatorA, 900, 'rejected']);

  const staff = 'INSERT INTO operator_staff (operator_id, name, email, phone, notify_email, notify_sms, active) VALUES (?, ?, ?, ?, ?, ?, ?)';
  await db.run(staff, [operatorA, 'Kai', 'kai@a.com', '+18085550100', 1, 1, 1]);
  await db.run(staff, [operatorA, 'Lee', null, '+18085550101', 1, 0, 1]);
  await db.run(staff, [operatorA, 'Old', 'old@a.com', null, 1, 0, 0]);

  const ac = 'INSERT INTO aircraft (operator_id, tail_number, type, capacity, faa_record) VALUES (?, ?, ?, ?, ?) RETURNING id';
  const g = (await db.one<{ id: number }>(ac, [operatorA, 'N1', 'G650', 12, JSON.stringify({ status: 'assigned', registrationStatus: 'Valid', registrationExpires: '2029-01-01' })]))!.id;
  await db.run(ac, [operatorA, 'N2', 'King Air', 8, JSON.stringify({ status: 'assigned', registrationStatus: 'Valid', registrationExpires: '2025-01-01' })]);
  await db.run(ac, [operatorA, 'N3', 'Citation', 7, null]);
  await db.run(`INSERT INTO aircraft_photos (aircraft_id, content_type, bytes) VALUES (?, 'image/jpeg', ?)`, [g, new Uint8Array([0xff, 0xd8, 0xff])]);
  await db.run(`UPDATE operators SET markets = '["hawaii"]', fleet_types = '["midsize"]' WHERE id = ?`, [operatorA]);
});

describe('buildDashboard', () => {
  it('summarizes deals', async () => {
    const d = await buildDashboard(f.db, await op(f.operatorA), now);
    expect(d.deals).toEqual({ inbound: 3, awaiting: 1, submitted: 3, accepted: 2, wonCents: 10_000_000 });
  });

  it('summarizes fleet, team and settings', async () => {
    const d = await buildDashboard(f.db, await op(f.operatorA), now);
    expect(d.fleet).toEqual({ count: 3, seats: 27, withoutPhotos: 2, registryFlags: 1 });
    expect(d.team).toEqual({ active: 2, emailAlerts: 1, smsAlerts: 1 });
    expect(d.settings).toEqual({ profileComplete: true, payoutsReady: true });
  });

  it('is empty for an operator with nothing yet', async () => {
    const d = await buildDashboard(f.db, await op(f.operatorB), now);
    expect(d.deals).toMatchObject({ inbound: 1, awaiting: 1, accepted: 0, wonCents: 0 });
    expect(d.fleet.count).toBe(0);
    expect(d.settings.profileComplete).toBe(false);
  });
});

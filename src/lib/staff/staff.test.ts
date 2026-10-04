import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { addStaff, updateStaff, removeStaff, listStaff, StaffError, MAX_STAFF } from './roster';
import { alertStaff } from './alerts';
import { createCheckout, simulateStubPayment, refundPayment } from '@/lib/payments/service';
import { dispatchOutreach } from '@/lib/outreach/engine';
import { buildBoard, createBoardToken, operatorForBoardToken, revokeBoardToken, getBoardToken } from '@/lib/board/data';
import type { BookingLeg } from '@/lib/types';

const BASE = 'https://bespoke.flights';
let f: Fixture;
let log: ReturnType<typeof vi.spyOn>;

const member = (over: Record<string, unknown> = {}) => ({
  name: 'Dee Dispatch', role: 'Dispatch', email: 'dee@alpha.com', phone: '808 555 0100',
  notify_email: true, notify_sms: true, on_new_request: true, on_booking: true, on_cancellation: true, ...over,
});

/** Recipients of stub emails and texts logged since the last call. */
function sentSince(start: number) {
  const calls = log.mock.calls.slice(start) as unknown[][];
  return {
    emails: calls.filter(c => c[0] === '  To:' && calls[calls.indexOf(c) - 2]?.[0] === '[EMAIL STUB] Would send:').map(c => c[1]),
    texts: calls.filter(c => c[0] === '  To:' && calls[calls.indexOf(c) - 1]?.[0] === '[SMS STUB] Would text:').map(c => c[1]),
    bodies: calls.filter(c => c[0] === '  Body:').map(c => String(c[1])),
    subjects: calls.filter(c => c[0] === '  Subject:').map(c => String(c[1])),
  };
}

beforeEach(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_TEST_MODE', '');
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  await f.db.run("UPDATE booking_requests SET notes = 'Vegan catering' WHERE id = ?", [f.requestId]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('roster', () => {
  it('normalizes phone numbers and validates channels', async () => {
    const m = await addStaff(f.db, f.operatorA, member());
    expect(m.phone).toBe('+18085550100');
    await expect(addStaff(f.db, f.operatorA, member({ email: '' }))).rejects.toThrow('Add an email address');
    await expect(addStaff(f.db, f.operatorA, member({ phone: '' }))).rejects.toThrow('Add a mobile number');
    await expect(addStaff(f.db, f.operatorA, member({ phone: '12' }))).rejects.toThrow('Invalid phone');
    await expect(addStaff(f.db, f.operatorA, member({ email: 'nope' }))).rejects.toThrow('Invalid email');
    await expect(addStaff(f.db, f.operatorA, member({ name: ' ' }))).rejects.toThrow('Name is required');
  });

  it('keeps each company to its own staff', async () => {
    const m = await addStaff(f.db, f.operatorA, member());
    await expect(updateStaff(f.db, f.operatorB, m.id, member({ name: 'Hijack' }))).rejects.toMatchObject({ status: 404 });
    await expect(removeStaff(f.db, f.operatorB, m.id)).rejects.toBeInstanceOf(StaffError);
    expect(await listStaff(f.db, f.operatorB)).toHaveLength(0);
    expect((await updateStaff(f.db, f.operatorA, m.id, member({ name: 'Dee D.' }))).name).toBe('Dee D.');
    await removeStaff(f.db, f.operatorA, m.id);
    expect(await listStaff(f.db, f.operatorA)).toHaveLength(0);
  });

  it(`caps a company at ${MAX_STAFF} people`, async () => {
    for (let i = 0; i < MAX_STAFF; i++) await addStaff(f.db, f.operatorA, member({ email: `s${i}@alpha.com`, notify_sms: false }));
    await expect(addStaff(f.db, f.operatorA, member())).rejects.toThrow(`up to ${MAX_STAFF}`);
  });
});

describe('alerts', () => {
  async function book() {
    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    return paymentId;
  }

  it('emails and texts subscribed staff when a charter is booked, once', async () => {
    await addStaff(f.db, f.operatorA, member());
    await addStaff(f.db, f.operatorA, member({ name: 'Cap', email: 'cap@alpha.com', phone: '+1 808 555 0199', notify_sms: false }));
    await addStaff(f.db, f.operatorA, member({ name: 'Sales only', email: 'sales@alpha.com', on_booking: false, notify_sms: false }));
    await addStaff(f.db, f.operatorA, member({ name: 'Off', email: 'off@alpha.com', notify_sms: false, active: false }));
    await addStaff(f.db, f.operatorB, member({ name: 'Rival', email: 'rival@bravo.com', notify_sms: false }));

    const start = log.mock.calls.length;
    await book();
    const out = sentSince(start);
    expect(out.emails).toEqual(expect.arrayContaining(['dee@alpha.com', 'cap@alpha.com']));
    expect(out.emails).not.toEqual(expect.arrayContaining(['sales@alpha.com']));
    expect(out.emails).not.toContain('off@alpha.com');
    expect(out.emails).not.toContain('rival@bravo.com');
    expect(out.texts).toEqual(['+18085550100']);
    const sms = out.bodies.find(b => b.includes('BOOKED'))!;
    expect(sms).toContain(`BOOKED #${f.requestId}: KLAX → PHNL → KLAX`);
    expect(sms).toContain('4 pax');
    expect(sms).toContain('Requests: Vegan catering');
    expect(sms).toMatch(/https:\/\/bespoke\.flights\/trip\/[A-Za-z0-9_-]{32}/);
    expect(out.subjects).toContain(`New charter booked: KLAX → PHNL → KLAX (#${f.requestId})`);

    // Repeating the event (e.g. a redelivered webhook) sends nothing new
    const again = await alertStaff(f.db, { kind: 'booking', requestId: f.requestId, operatorId: f.operatorA }, BASE);
    expect(again).toEqual({ sent: 0, failed: 0, skipped: 3 });
  });

  it('retries a failed send on the next trigger', async () => {
    const m = await addStaff(f.db, f.operatorA, member({ notify_sms: false }));
    await book();
    await f.db.run("UPDATE staff_notifications SET status = 'failed', error = 'boom' WHERE staff_id = ?", [m.id]);
    const r = await alertStaff(f.db, { kind: 'booking', requestId: f.requestId, operatorId: f.operatorA }, BASE);
    expect(r.sent).toBe(1);
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM staff_notifications WHERE staff_id = ?', m.id)).status).toBe('sent');
  });

  it('alerts on cancellation when a booking is fully refunded', async () => {
    await addStaff(f.db, f.operatorA, member({ on_booking: false }));
    const paymentId = await book();
    const start = log.mock.calls.length;
    await refundPayment(f.db, paymentId, { baseUrl: BASE });
    const out = sentSince(start);
    expect(out.subjects.some(s => s.startsWith('Charter cancelled: KLAX → PHNL → KLAX'))).toBe(true);
    expect(out.bodies.some(b => b.includes(`CANCELLED #${f.requestId}`))).toBe(true);
  });

  it('does not alert on a partial refund', async () => {
    await addStaff(f.db, f.operatorA, member({ on_booking: false }));
    const paymentId = await book();
    const start = log.mock.calls.length;
    await refundPayment(f.db, paymentId, { amountCents: 1000, baseUrl: BASE });
    expect(sentSince(start).subjects.filter(s => s.includes('cancelled'))).toHaveLength(0);
  });

  it('alerts sales staff when a new request is matched to the company', async () => {
    await f.db.run(`UPDATE operators SET markets = '["mainland_hi"]', fleet_types = '["heavy"]', safety_rating = 'ARGUS Platinum', hi_capable = 1, transoceanic = 1 WHERE id = ?`, [f.operatorA]);
    await addStaff(f.db, f.operatorA, member({ name: 'Sales', email: 'sales@alpha.com', notify_sms: false, on_booking: false }));
    await addStaff(f.db, f.operatorA, member({ name: 'Ops', email: 'ops@alpha.com', notify_sms: false, on_new_request: false }));
    const legs = await f.db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [f.requestId]);
    const start = log.mock.calls.length;
    const { deliveries } = await dispatchOutreach(f.db, f.requestId, legs, 4, null, BASE);
    await deliveries;
    const out = sentSince(start);
    expect(out.emails).toContain('sales@alpha.com');
    expect(out.emails).not.toContain('ops@alpha.com');
    expect(out.subjects).toContain(`New charter request: KLAX → PHNL → KLAX (#${f.requestId})`);
  });
});

describe('company board', () => {
  it('sorts charters into sections, with contact details only for booked ones', async () => {
    await f.db.run("INSERT INTO outreach_log (request_id, operator_id, method, rfq_body) VALUES (?, ?, 'email', 'x')", [f.requestId, f.operatorB]);
    let board = await buildBoard(f.db, f.operatorA);
    expect(board.company).toBe('Alpha Air');
    expect(board.awaitingClient.map(t => t.requestId)).toEqual([f.requestId]);
    expect(board.awaitingClient[0].leadPassenger).toBeNull();
    expect(board.upcoming).toHaveLength(0);

    // Operator B was matched but has not quoted; delete B's quote to model that
    await f.db.run('DELETE FROM quotes WHERE id = ?', [f.quoteB]);
    expect((await buildBoard(f.db, f.operatorB)).toQuote.map(t => t.requestId)).toEqual([f.requestId]);

    const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
    await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
    board = await buildBoard(f.db, f.operatorA);
    expect(board.upcoming).toHaveLength(1);
    expect(board.upcoming[0]).toMatchObject({
      requestId: f.requestId, passengerCount: 4, specialRequests: 'Vegan catering', quoteCents: 8_500_000,
      leadPassenger: { name: 'Customer', email: 'cust@example.com' },
    });
    expect(board.awaitingClient).toHaveLength(0);

    await refundPayment(f.db, paymentId, { baseUrl: BASE });
    board = await buildBoard(f.db, f.operatorA);
    expect(board.upcoming).toHaveLength(0);
    expect(board.cancelled.map(t => t.requestId)).toEqual([f.requestId]);
  });

  it('board links are per company, replaceable and revocable', async () => {
    const t1 = await createBoardToken(f.db, f.operatorA);
    expect(await operatorForBoardToken(f.db, t1)).toBe(f.operatorA);
    const t2 = await createBoardToken(f.db, f.operatorA);
    expect(t2).not.toBe(t1);
    expect(await operatorForBoardToken(f.db, t1)).toBeNull();
    await f.db.run("UPDATE operators SET status = 'suspended' WHERE id = ?", [f.operatorA]);
    expect(await operatorForBoardToken(f.db, t2)).toBeNull();
    await revokeBoardToken(f.db, f.operatorA);
    expect(await getBoardToken(f.db, f.operatorA)).toBeNull();
    expect(await operatorForBoardToken(f.db, 'bad token')).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { createCheckout, fulfillPayment, simulateStubPayment } from '@/lib/payments/service';
import { addStaff } from '@/lib/staff/roster';
import {
  acceptChange, applyChange, ChangeError, declineChange, getChangeRequest, pendingChange, proposeChange, withdrawChange,
} from './changes';
import type { BookingLeg, BookingRequest, Operator, Payment } from '@/lib/types';

const BASE = 'https://bespoke.flights';
let f: Fixture;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('APP_TEST_MODE', '');
  vi.stubEnv('PLATFORM_FEE_BPS', '');
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const request = () => row<BookingRequest>(f.db, 'SELECT * FROM booking_requests WHERE id = ?', f.requestId);
const operator = (id: number) => row<Operator>(f.db, 'SELECT * FROM operators WHERE id = ?', id);
const legs = () => f.db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [f.requestId]);
const subjects = () => log.mock.calls.filter(c => c[0] === '  Subject:').map(c => String(c[1]));
const recipients = () => log.mock.calls.filter(c => c[0] === '  To:').map(c => String(c[1]));

const proposal = {
  legs: [
    { originCode: 'KLAX', destCode: 'PHOG', departureDate: '2030-06-01', departureTime: '09:00' },
    { originCode: 'PHOG', destCode: 'KLAX', departureDate: '2030-06-09' },
  ],
  passengerCount: 6,
  notes: 'Two dogs',
};

async function booked() {
  const { paymentId } = await createCheckout(f.db, { quoteId: f.quoteA, customerId: f.customerId, baseUrl: BASE });
  await simulateStubPayment(f.db, paymentId, f.customerId, BASE);
  log.mockClear();
  return paymentId;
}

async function expectError(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toBeInstanceOf(ChangeError);
  await p.catch(e => expect(e.status).toBe(status));
}

describe('propose', () => {
  it('requires a paid booking and allows one pending change at a time', async () => {
    await expectError(proposeChange(f.db, await request(), f.customerId, proposal, BASE), 409);
    await booked();
    await addStaff(f.db, f.operatorA, { name: 'Dee', email: 'dee@alpha.com', notify_email: true, notify_sms: false, on_new_request: false, on_booking: false, on_cancellation: false, on_change: true });
    const cr = await proposeChange(f.db, await request(), f.customerId, proposal, BASE);
    expect(cr.status).toBe('pending');
    expect(cr.previous_price_cents).toBe(8_500_000);
    expect(await pendingChange(f.db, f.requestId)).toMatchObject({ id: cr.id });
    await expectError(proposeChange(f.db, await request(), f.customerId, proposal, BASE), 409);
    // Operator email + staff alert
    expect(recipients()).toEqual(expect.arrayContaining(['dispatch@alpha.com', 'dee@alpha.com']));
    expect(subjects().some(s => s.startsWith('Change requested'))).toBe(true);
    // Booking untouched until accepted
    expect((await legs())[0].dest_code).toBe('PHNL');
  });

  it('can be withdrawn by its author only', async () => {
    await booked();
    const cr = await proposeChange(f.db, await request(), f.customerId, proposal, BASE);
    await expectError(withdrawChange(f.db, cr.id, f.otherCustomerId), 403);
    expect((await withdrawChange(f.db, cr.id, f.customerId)).status).toBe('withdrawn');
    await expectError(withdrawChange(f.db, cr.id, f.customerId), 409);
  });
});

describe('resolve', () => {
  it('only the winning operator may accept or decline', async () => {
    await booked();
    const cr = await proposeChange(f.db, await request(), f.customerId, proposal, BASE);
    await expectError(acceptChange(f.db, cr.id, await operator(f.operatorB), { baseUrl: BASE }), 403);
    await expectError(declineChange(f.db, cr.id, f.operatorB, 'no', BASE), 403);
  });

  it('decline keeps the booking and emails the traveler with the note', async () => {
    await booked();
    const cr = await proposeChange(f.db, await request(), f.customerId, proposal, BASE);
    log.mockClear();
    const updated = await declineChange(f.db, cr.id, f.operatorA, 'Aircraft unavailable that week', BASE);
    expect(updated).toMatchObject({ status: 'declined', operator_note: 'Aircraft unavailable that week', applied_at: null });
    expect(recipients()).toEqual(['cust@example.com']);
    expect(subjects()[0]).toMatch(/^Change declined/);
    expect((await legs())[0].dest_code).toBe('PHNL');
    await expectError(acceptChange(f.db, cr.id, await operator(f.operatorA), { baseUrl: BASE }), 409);
  });

  it('accept at the same price applies the change at once and notifies both sides', async () => {
    const paymentId = await booked();
    const cr = await proposeChange(f.db, await request(), f.customerId, proposal, BASE);
    log.mockClear();
    const result = await acceptChange(f.db, cr.id, await operator(f.operatorA), { note: 'Done', baseUrl: BASE });
    expect(result.paymentDue).toBeUndefined();
    expect(result.changeRequest).toMatchObject({ status: 'accepted', new_price_cents: 8_500_000, previous_price_cents: 8_500_000 });
    expect(result.changeRequest.applied_at).not.toBeNull();

    const l = await legs();
    expect(l.map(x => [x.origin_code, x.dest_code, x.departure_date, x.departure_time])).toEqual([
      ['KLAX', 'PHOG', '2030-06-01', '09:00'], ['PHOG', 'KLAX', '2030-06-09', null],
    ]);
    expect(await request()).toMatchObject({ passenger_count: 6, notes: 'Two dogs', status: 'booked' });
    expect((await row<Payment>(f.db, 'SELECT * FROM payments WHERE id = ?', paymentId)).status).toBe('succeeded');
    expect(recipients()).toEqual(['cust@example.com', 'dispatch@alpha.com']);
    expect(subjects()[0]).toMatch(/^Change accepted/);
  });

  it('accept at a lower price refunds the difference and applies', async () => {
    const paymentId = await booked();
    const cr = await proposeChange(f.db, await request(), f.customerId, proposal, BASE);
    const result = await acceptChange(f.db, cr.id, await operator(f.operatorA), { newPriceCents: 8_000_000, baseUrl: BASE });
    expect(result.refundedCents).toBe(500_000);
    const p = await row<Payment>(f.db, 'SELECT * FROM payments WHERE id = ?', paymentId);
    expect(p).toMatchObject({ status: 'partially_refunded', refunded_cents: 500_000 });
    expect((await request()).status).toBe('booked');
    expect((await getChangeRequest(f.db, cr.id))!.applied_at).not.toBeNull();
    expect((await legs())[0].dest_code).toBe('PHOG');
  });

  it('accept at a higher price creates a difference payment; the change applies when it is paid', async () => {
    await booked();
    const cr = await proposeChange(f.db, await request(), f.customerId, proposal, BASE);
    log.mockClear();
    const result = await acceptChange(f.db, cr.id, await operator(f.operatorA), { newPriceCents: 9_000_000, baseUrl: BASE });
    expect(result.paymentDue).toMatchObject({ amountCents: 500_000 });
    expect(result.paymentDue!.url).toContain(`/requests/${f.requestId}?checkout=stub&payment=`);
    expect(result.changeRequest.applied_at).toBeNull();
    expect((await legs())[0].dest_code).toBe('PHNL');  // not yet
    expect(subjects()[0]).toMatch(/payment due/);

    const diff = await row<Payment>(f.db, 'SELECT * FROM payments WHERE id = ?', result.paymentDue!.paymentId);
    expect(diff).toMatchObject({ status: 'pending', amount_cents: 500_000, platform_fee_cents: 25_000, change_request_id: cr.id, provider: 'stub' });

    log.mockClear();
    expect(await simulateStubPayment(f.db, diff.id, f.customerId, BASE)).toBe('change_paid');
    expect((await legs())[0].dest_code).toBe('PHOG');
    expect(await request()).toMatchObject({ passenger_count: 6, status: 'booked' });
    expect((await getChangeRequest(f.db, cr.id))!.applied_at).not.toBeNull();
    expect((await row<Payment>(f.db, 'SELECT * FROM payments WHERE id = ?', diff.id)).status).toBe('succeeded');
    expect(subjects().some(s => s.startsWith('Itinerary updated'))).toBe(true);

    // Replaying the webhook neither re-applies nor refunds.
    log.mockClear();
    expect(await fulfillPayment(f.db, diff.id, { baseUrl: BASE })).toBe('change_paid');
    expect(subjects()).toEqual([]);
    expect((await row<{ n: number }>(f.db, 'SELECT COUNT(*) n FROM refunds')).n).toBe(0);
    // The original booking payment still counts as the booking; a second booking checkout is refused.
    expect((await f.db.query("SELECT id FROM payments WHERE request_id = ? AND status = 'succeeded'", [f.requestId])).length).toBe(2);
  });

  it('a second accept of a pending change with a higher price supersedes the open difference checkout', async () => {
    await booked();
    const cr = await proposeChange(f.db, await request(), f.customerId, proposal, BASE);
    await acceptChange(f.db, cr.id, await operator(f.operatorA), { newPriceCents: 9_000_000, baseUrl: BASE });
    await expectError(acceptChange(f.db, cr.id, await operator(f.operatorA), { newPriceCents: 9_500_000, baseUrl: BASE }), 409);
  });

  it('shows on the winning operator\'s company board until resolved', async () => {
    const { buildBoard } = await import('@/lib/board/data');
    await booked();
    const cr = await proposeChange(f.db, await request(), f.customerId, proposal, BASE);
    const board = await buildBoard(f.db, f.operatorA);
    expect(board.changeRequests.map(t => t.proposed?.changeRequestId)).toEqual([cr.id]);
    expect(board.changeRequests[0].proposed?.legs[0]).toMatchObject({ from: 'KLAX', to: 'PHOG', date: '2030-06-01', time: '09:00' });
    expect((await buildBoard(f.db, f.operatorB)).changeRequests).toEqual([]);
    await declineChange(f.db, cr.id, f.operatorA, undefined, BASE);
    expect((await buildBoard(f.db, f.operatorA)).changeRequests).toEqual([]);
  });

  it('applyChange is idempotent', async () => {
    await booked();
    const cr = await proposeChange(f.db, await request(), f.customerId, proposal, BASE);
    expect(await applyChange(f.db, cr.id)).toBe(false);  // still pending
    await acceptChange(f.db, cr.id, await operator(f.operatorA), { baseUrl: BASE });
    expect(await applyChange(f.db, cr.id)).toBe(false);  // already applied
    expect((await legs()).length).toBe(2);
  });
});

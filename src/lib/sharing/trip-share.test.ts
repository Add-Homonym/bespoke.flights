import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, type Fixture } from '@/lib/payments/__tests__/fixtures';
import {
  getShare, getOrCreateShare, revokeShares, loadTripSheet, emailTripSheet, parseRecipients,
  tripSheetIcs, ShareError, MAX_SHARE_RECIPIENTS,
} from './trip-share';

let f: Fixture;
let opUserA: number;

async function book(fx: Fixture) {
  await fx.db.run("UPDATE quotes SET status = 'accepted' WHERE id = ?", [fx.quoteA]);
  await fx.db.run("UPDATE quotes SET status = 'rejected' WHERE id = ?", [fx.quoteB]);
  await fx.db.run("UPDATE booking_requests SET status = 'booked', notes = ? WHERE id = ?", ['Dog <Max>; vegan, please', fx.requestId]);
  await fx.db.run("UPDATE booking_legs SET departure_time = '09:30' WHERE request_id = ? AND leg_order = 1", [fx.requestId]);
  await fx.db.run("UPDATE users SET phone = '+1-808-555-0100' WHERE id = ?", [fx.customerId]);
}

beforeEach(async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  opUserA = (await f.db.one<{ user_id: number }>('SELECT user_id FROM operators WHERE id = ?', [f.operatorA]))!.user_id;
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const expectShareError = async (p: Promise<unknown>, status: number) => {
  await expect(p).rejects.toBeInstanceOf(ShareError);
  await p.catch(e => expect(e.status).toBe(status));
};

describe('who can share', () => {
  it('nobody before the booking is paid', async () => {
    await expectShareError(getOrCreateShare(f.db, f.requestId, f.operatorA, opUserA), 403);
    expect(await getShare(f.db, f.requestId, f.operatorA)).toBeNull();
  });

  it('only the operator whose quote won', async () => {
    await book(f);
    await expectShareError(getOrCreateShare(f.db, f.requestId, f.operatorB, opUserA), 403);
    await expectShareError(revokeShares(f.db, f.requestId, f.operatorB), 403);
    const share = await getOrCreateShare(f.db, f.requestId, f.operatorA, opUserA);
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe('links', () => {
  it('reuses the active link, and revoking kills it', async () => {
    await book(f);
    const first = await getOrCreateShare(f.db, f.requestId, f.operatorA, opUserA);
    expect((await getOrCreateShare(f.db, f.requestId, f.operatorA, opUserA)).token).toBe(first.token);
    expect(await loadTripSheet(f.db, first.token)).not.toBeNull();

    await revokeShares(f.db, f.requestId, f.operatorA);
    expect(await loadTripSheet(f.db, first.token)).toBeNull();
    expect(await getShare(f.db, f.requestId, f.operatorA)).toBeNull();

    const second = await getOrCreateShare(f.db, f.requestId, f.operatorA, opUserA);
    expect(second.token).not.toBe(first.token);
  });

  it('expires 30 days after the last leg', async () => {
    await book(f);
    const share = await getOrCreateShare(f.db, f.requestId, f.operatorA, opUserA);
    const last = (await f.db.one<{ d: string }>('SELECT MAX(departure_date) AS d FROM booking_legs WHERE request_id = ?', [f.requestId]))!.d;
    const days = (new Date(share.expires_at).getTime() - new Date(`${last}T00:00:00Z`).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);

    await f.db.run("UPDATE trip_shares SET expires_at = now() - interval '1 minute'");
    expect(await loadTripSheet(f.db, share.token)).toBeNull();
  });

  it('rejects malformed and unknown tokens', async () => {
    expect(await loadTripSheet(f.db, "' OR 1=1 --")).toBeNull();
    expect(await loadTripSheet(f.db, 'a'.repeat(32))).toBeNull();
  });

  it('still opens after cancellation, marked cancelled', async () => {
    await book(f);
    const { token } = await getOrCreateShare(f.db, f.requestId, f.operatorA, opUserA);
    await f.db.run("UPDATE booking_requests SET status = 'cancelled' WHERE id = ?", [f.requestId]);
    expect((await loadTripSheet(f.db, token))!.status).toBe('cancelled');
  });
});

describe('trip sheet contents', () => {
  it('has every trip detail and the lead passenger contact', async () => {
    await book(f);
    const { token } = await getOrCreateShare(f.db, f.requestId, f.operatorA, opUserA);
    const sheet = (await loadTripSheet(f.db, token))!;
    expect(sheet).toMatchObject({
      requestId: f.requestId,
      status: 'booked',
      operatorCompany: 'Alpha Air',
      passengerCount: 4,
      specialRequests: 'Dog <Max>; vegan, please',
      leadPassenger: { name: 'Customer', email: 'cust@example.com', phone: '+1-808-555-0100' },
    });
    expect(sheet.legs).toEqual([
      expect.objectContaining({ from: 'KLAX', to: 'PHNL', time: '09:30' }),
      expect.objectContaining({ from: 'PHNL', to: 'KLAX', time: '' }),
    ]);
  });
});

describe('email', () => {
  it('parses free-form recipient lists', () => {
    expect(parseRecipients(' A@x.com, b@x.com;c@x.com\n a@x.com ')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('sends the link to each colleague', async () => {
    await book(f);
    const log = vi.mocked(console.log);
    const result = await emailTripSheet(f.db, {
      requestId: f.requestId, operatorId: f.operatorA, userId: opUserA,
      recipients: ['dispatch@alpha.com', 'captain@alpha.com'], baseUrl: 'https://bespoke.flights', senderName: 'Op A',
    });
    expect(result).toEqual({ sent: 2, failed: [] });
    expect(log.mock.calls.filter(c => c[0] === '  To:').map(c => c[1])).toEqual(['dispatch@alpha.com', 'captain@alpha.com']);
  });

  it('rejects invalid, empty or too many recipients', async () => {
    await book(f);
    const base = { requestId: f.requestId, operatorId: f.operatorA, userId: opUserA, baseUrl: 'x', senderName: 'Op A' };
    await expectShareError(emailTripSheet(f.db, { ...base, recipients: [] }), 400);
    await expectShareError(emailTripSheet(f.db, { ...base, recipients: ['not-an-email'] }), 400);
    const many = Array.from({ length: MAX_SHARE_RECIPIENTS + 1 }, (_, i) => `p${i}@alpha.com`);
    await expectShareError(emailTripSheet(f.db, { ...base, recipients: many }), 400);
  });

  it('cannot be used by an operator who did not win the booking', async () => {
    await book(f);
    await expectShareError(emailTripSheet(f.db, {
      requestId: f.requestId, operatorId: f.operatorB, userId: opUserA,
      recipients: ['x@bravo.com'], baseUrl: 'x', senderName: 'Op B',
    }), 403);
  });
});

describe('calendar file', () => {
  const sheet = {
    requestId: 12, status: 'booked', operatorId: 1, operatorCompany: 'Alpha Air', aircraft: 'Gulfstream G650 (N650EA)',
    legs: [
      { from: 'KLAX', to: 'PHNL', date: '2026-12-01', time: '09:30' },
      { from: 'PHNL', to: 'KLAX', date: '2026-12-31', time: '' },
    ],
    passengerCount: 3, specialRequests: 'Dog; vegan, please\nthanks',
    leadPassenger: { name: 'Ada', email: 'ada@x.com', phone: '+1-555' }, expiresAt: '2027-01-30T00:00:00.000Z',
  };
  const ics = tripSheetIcs(sheet, 'https://bespoke.flights/trip/tok', new Date('2026-10-04T06:00:00Z'));
  const unfolded = ics.replace(/\r\n /g, '');

  it('is valid iCalendar with CRLF line endings and folded lines', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every(l => Buffer.byteLength(l, 'utf8') <= 75)).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('has one event per leg: timed legs float, untimed legs are all-day', () => {
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(unfolded).toContain('DTSTART:20261201T093000\r\n');
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n');
    expect(unfolded).toContain('UID:booking-12-leg-1@bespoke.flights');
  });

  it('escapes text and carries the trip details', () => {
    expect(unfolded).toContain('Special requests: Dog\; vegan\\, please\\nthanks');
    expect(unfolded).toContain('Aircraft: Gulfstream G650 (N650EA)');
    expect(unfolded).toContain('STATUS:CONFIRMED');
  });

  it('marks cancelled bookings', () => {
    expect(tripSheetIcs({ ...sheet, status: 'cancelled' }, 'u')).toContain('STATUS:CANCELLED');
  });
});

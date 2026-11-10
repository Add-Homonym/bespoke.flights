import { beforeAll, describe, expect, it } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { buildAutopilotDraft, DEFAULT_AUTOPILOT, draftQuote, loadDraft, parseAutopilot, pickAircraft } from './autopilot';
import { computeWorksheet } from './worksheet';

const plane = (id: number, capacity: number, rate: number | null, range: number | null = null, cruise: number | null = 450) => ({
  id, type: `Jet ${id}`, tail_number: `N${id}`, capacity, range_nm: range, hourly_rate_cents: rate, cruise_ktas: cruise,
});
const settings = { ...DEFAULT_AUTOPILOT, enabled: true, baseAirport: 'PHNL', marginPct: 10, landingPerLeg: 500, cateringPerPaxLeg: 50, crewOvernight: 400 };
const legs = [
  { origin_code: 'PHNL', dest_code: 'PHOG', departure_date: '2026-11-10' },
  { origin_code: 'PHOG', dest_code: 'PHNL', departure_date: '2026-11-12' },
];

describe('pickAircraft', () => {
  it('takes the smallest aircraft that seats the group and has a rate', () => {
    const r = pickAircraft([plane(1, 14, 900_000), plane(2, 6, 350_000), plane(3, 8, null)], 5, 100);
    expect(r.aircraft?.id).toBe(2);
    expect(r.flags).toEqual([]);
  });

  it('skips aircraft without the range for the longest leg', () => {
    expect(pickAircraft([plane(1, 8, 400_000, 1500), plane(2, 12, 800_000, 6000)], 4, 2200).aircraft?.id).toBe(2);
  });

  it('flags a group larger than the fleet', () => {
    const r = pickAircraft([plane(1, 8, 400_000)], 30, 100);
    expect(r.aircraft?.id).toBe(1);
    expect(r.flags[0]).toMatch(/30 guests exceed/);
  });

  it('flags missing rate and speed', () => {
    const r = pickAircraft([plane(1, 8, null, null, null)], 2, 100);
    expect(r.flags.join(' ')).toMatch(/No hourly rate.*No cruise speed/);
  });
});

describe('buildAutopilotDraft', () => {
  it('prices the trip from the operator parameters', () => {
    const d = buildAutopilotDraft({ legs, passengers: 4, fleet: [plane(7, 8, 400_000)], settings, today: '2026-10-18' });
    expect(d.aircraft?.id).toBe(7);
    expect(d.worksheet).toMatchObject({
      hourlyRate: 4000, positioningHours: 0, overnights: 2, crewOvernight: 400,
      landingFees: 1000, catering: 400, marginPct: 10, passengers: 4,
    });
    expect(d.priceCents).toBe(computeWorksheet(d.worksheet).totalCents);
    expect(d.priceCents).toBeGreaterThan(0);
    expect(d.validUntil).toBe('2026-10-25');
    expect(d.message).toBe('All-in price for the Jet 7 (8 seats), crew, fuel, fees and taxes included.');
  });

  it('adds positioning from and back to the home base', () => {
    const away = [{ origin_code: 'PHOG', dest_code: 'PHKO', departure_date: '2026-11-10' }];
    const d = buildAutopilotDraft({ legs: away, passengers: 2, fleet: [plane(7, 8, 400_000)], settings, today: '2026-10-18' });
    expect(d.worksheet.positioningHours).toBeGreaterThan(0.6);
    expect(d.flags.join(' ')).toMatch(/Positioning .* PHNL/);
  });

  it('keeps the quote valid only until the day before departure', () => {
    const d = buildAutopilotDraft({ legs, passengers: 2, fleet: [plane(7, 8, 400_000)], settings: { ...settings, validDays: 60 }, today: '2026-11-05' });
    expect(d.validUntil).toBe('2026-11-09');
  });

  it('notes a missing home base', () => {
    const d = buildAutopilotDraft({ legs, passengers: 2, fleet: [plane(7, 8, 400_000)], settings: { ...settings, baseAirport: null } });
    expect(d.flags).toContain('No home base set, so no positioning is included.');
  });
});

describe('parseAutopilot', () => {
  it('falls back to defaults for bad JSON and fills missing keys', () => {
    expect(parseAutopilot('{nope')).toEqual(DEFAULT_AUTOPILOT);
    expect(parseAutopilot(JSON.stringify({ enabled: true, marginPct: 12 }))).toMatchObject({ enabled: true, marginPct: 12, validDays: 7 });
  });
});

describe('draftQuote', () => {
  let f: Fixture;
  let requestId: number;

  beforeAll(async () => {
    f = await createFixture();
    requestId = (await f.db.one<{ id: number }>(`INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'open', 3) RETURNING id`, [f.customerId]))!.id;
    await f.db.run(`INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date) VALUES (?, 1, 'PHNL', 'PHOG', '2027-01-10')`, [requestId]);
    await f.db.run(`INSERT INTO aircraft (operator_id, tail_number, type, capacity, hourly_rate_cents, cruise_ktas) VALUES (?, 'N7', 'King Air', 8, 300000, 280)`, [f.operatorA]);
  });

  it('does nothing while Autopilot is off', async () => {
    expect(await draftQuote(f.db, requestId, f.operatorA)).toBeNull();
  });

  it('drafts once Autopilot is on, and redrafts in place', async () => {
    await f.db.run('UPDATE operators SET autopilot = ? WHERE id = ?', [JSON.stringify(settings), f.operatorA]);
    const id = await draftQuote(f.db, requestId, f.operatorA);
    expect(id).toBeTypeOf('number');
    const d = await loadDraft(f.db, requestId, f.operatorA);
    expect(d).toMatchObject({ priceCents: expect.any(Number), worksheet: { hourlyRate: 3000, passengers: 3 } });
    expect(await draftQuote(f.db, requestId, f.operatorA)).toBe(id);
    expect((await row<{ n: number }>(f.db, 'SELECT COUNT(*)::int AS n FROM quote_drafts')).n).toBe(1);
  });

  it('is never visible as a quote until submitted', async () => {
    expect((await row<{ n: number }>(f.db, 'SELECT COUNT(*)::int AS n FROM quotes WHERE request_id = ?', requestId)).n).toBe(0);
  });

  it('skips a request the operator already quoted', async () => {
    expect(await draftQuote(f.db, f.requestId, f.operatorA)).toBeNull();
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { applyLearning, emptyLearned, learnFromQuote, loadLearned, observe } from './learning';
import { buildAutopilotDraft, DEFAULT_AUTOPILOT, draftQuote, loadDraft } from './autopilot';
import { computeWorksheet, type WorksheetInputs } from './worksheet';

const ws = (over: Partial<WorksheetInputs> = {}): WorksheetInputs => ({
  aircraftId: 7, hourlyRate: 5000,
  legs: [{ origin: 'KSFO', dest: 'KJFK', date: '2026-11-01', hours: 6 }, { origin: 'KJFK', dest: 'KSFO', date: '2026-11-03', hours: 6.4 }],
  positioningHours: 0, minDailyHours: 2, overnights: 2, crewOvernight: 600, fuelSurchargePct: 4,
  landingFees: 2000, catering: 800, other: 0, marginPct: 15, fetPct: 7.5, segmentFeePerPax: 5.3, passengers: 4,
  ...over,
});
const settings = { ...DEFAULT_AUTOPILOT, enabled: true, baseAirport: 'KSFO' };

describe('observe', () => {
  it('takes the first quote as is', () => {
    const l = observe(emptyLearned(), { worksheet: ws(), finalPriceCents: computeWorksheet(ws()).totalCents, cruiseKtas: 450 });
    expect(l.samples).toBe(1);
    expect(l.fields.marginPct).toEqual({ v: 15, n: 1 });
    expect(l.fields.landingPerLeg).toEqual({ v: 1000, n: 1 });
    expect(l.fields.cateringPerPaxLeg).toEqual({ v: 100, n: 1 });
    expect(l.fields.crewOvernight).toEqual({ v: 600, n: 1 });
    expect(l.aircraft['7']!.rate).toEqual({ v: 5000, n: 1 });
    // SFO–JFK at 450 kt estimates 5.3 h a leg; 12.4 entered vs 10.6 estimated.
    expect(l.aircraft['7']!.hoursFactor!.v).toBeCloseTo(12.4 / 10.6, 3);
    expect(l.priceRatio!.v).toBeCloseTo(1, 2);
  });

  it('weights recent quotes more', () => {
    let l = observe(emptyLearned(), { worksheet: ws({ marginPct: 10 }), finalPriceCents: 1 });
    l = observe(l, { worksheet: ws({ marginPct: 20 }), finalPriceCents: 1 });
    expect(l.fields.marginPct!.v).toBeCloseTo(13.5, 5);
    expect(l.fields.marginPct!.n).toBe(2);
  });

  it('learns how far staff move the final price from the worksheet', () => {
    const total = computeWorksheet(ws()).totalCents;
    const l = observe(emptyLearned(), { worksheet: ws(), finalPriceCents: Math.round(total * 1.1) });
    expect(l.priceRatio!.v).toBeCloseTo(1.1, 3);
  });

  it('ignores the overnight rate on day trips', () => {
    const l = observe(emptyLearned(), { worksheet: ws({ overnights: 0, crewOvernight: 0 }), finalPriceCents: 1 });
    expect(l.fields.crewOvernight).toBeUndefined();
  });
});

describe('applyLearning', () => {
  const learned = observe(emptyLearned(), { worksheet: ws(), finalPriceCents: Math.round(computeWorksheet(ws()).totalCents * 1.05), cruiseKtas: 450 });

  it('overrides console settings with learned values and says so', () => {
    const a = applyLearning(settings, learned);
    expect(a.settings).toMatchObject({ marginPct: 15, landingPerLeg: 1000, cateringPerPaxLeg: 100, crewOvernight: 600, minDailyHours: 2, fuelSurchargePct: 4 });
    expect(a.rates[7]).toBe(5000);
    expect(a.priceRatio).toBeCloseTo(1.05, 2);
    expect(a.notes[0]).toMatch(/^Learned from your last 1 quote: margin 15%/);
  });

  it('does nothing when learning is off', () => {
    const a = applyLearning({ ...settings, learn: false }, learned);
    expect(a.settings.marginPct).toBe(DEFAULT_AUTOPILOT.marginPct);
    expect(a.notes).toEqual([]);
  });

  it('feeds the draft: rate for an aircraft without one, scaled leg times, adjusted price', () => {
    const fleet = [{ id: 7, type: 'G-IV', tail_number: 'N7', capacity: 12, range_nm: 4000, hourly_rate_cents: null, cruise_ktas: 450 }];
    const legs = [{ origin_code: 'KSFO', dest_code: 'KJFK', departure_date: '2026-12-01' }];
    const d = buildAutopilotDraft({ legs, passengers: 4, fleet, settings, learned, today: '2026-10-18' });
    expect(d.worksheet.hourlyRate).toBe(5000);
    expect(d.worksheet.legs[0]!.hours).toBeCloseTo(5.3 * 1.17, 1);
    expect(d.flags.join(' ')).not.toMatch(/No hourly rate/);
    expect(d.notes.join(' ')).toMatch(/Hourly rate \$5,000 for N7/);
    expect(d.priceCents).toBe(Math.round(computeWorksheet(d.worksheet).totalCents * 1.05 / 100) * 100);
  });
});

describe('learnFromQuote', () => {
  let f: Fixture;
  let aircraftId: number;
  beforeAll(async () => {
    f = await createFixture();
    aircraftId = (await f.db.one<{ id: number }>(`INSERT INTO aircraft (operator_id, tail_number, type, capacity) VALUES (?, 'N7894', 'Tecnam', 7) RETURNING id`, [f.operatorA]))!.id;
  });

  it('stores what was learned and fills the aircraft rate when missing', async () => {
    await learnFromQuote(f.db, f.operatorA, ws({ aircraftId, hourlyRate: 1800 }), 3_000_000);
    expect((await loadLearned(f.db, f.operatorA)).samples).toBe(1);
    expect((await row<{ r: number }>(f.db, 'SELECT hourly_rate_cents AS r FROM aircraft WHERE id = ?', aircraftId)).r).toBe(180_000);
  });

  it('shapes the next draft for that operator', async () => {
    await f.db.run('UPDATE operators SET autopilot = ? WHERE id = ?', [JSON.stringify(settings), f.operatorA]);
    const req = (await f.db.one<{ id: number }>(`INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'open', 2) RETURNING id`, [f.customerId]))!.id;
    await f.db.run(`INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date) VALUES (?, 1, 'KSFO', 'KLAS', '2027-01-10')`, [req]);
    await draftQuote(f.db, req, f.operatorA);
    const d = (await loadDraft(f.db, req, f.operatorA))!;
    expect(d.worksheet).toMatchObject({ hourlyRate: 1800, marginPct: 15, landingFees: 1000 });
    expect(d.notes.join(' ')).toMatch(/Learned from your last 1 quote/);
  });
});

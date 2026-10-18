import { describe, expect, it } from 'vitest';
import { computeWorksheet, defaultWorksheet, estimateLegHours, nightsAway, worksheetSchema, type WorksheetInputs } from './worksheet';

const base: WorksheetInputs = {
  hourlyRate: 5000,
  legs: [
    { origin: 'KSFO', dest: 'KJFK', date: '2026-11-01', hours: 5.5 },
    { origin: 'KJFK', dest: 'KSFO', date: '2026-11-03', hours: 6 },
  ],
  positioningHours: 0, minDailyHours: 0, overnights: 0, crewOvernight: 0, fuelSurchargePct: 0,
  landingFees: 0, catering: 0, other: 0, marginPct: 0, fetPct: 0, segmentFeePerPax: 0, passengers: 4,
};
const line = (r: ReturnType<typeof computeWorksheet>, key: string) => r.lines.find(l => l.key === key)?.cents;

describe('computeWorksheet', () => {
  it('prices flight time at the hourly rate', () => {
    const r = computeWorksheet(base);
    expect(line(r, 'flight')).toBe(5_750_000);
    expect(r.totalCents).toBe(5_750_000);
    expect(r.billableHours).toBe(11.5);
  });

  it('applies the daily minimum per flying day', () => {
    const r = computeWorksheet({ ...base, legs: [
      { origin: 'A', dest: 'B', date: '2026-11-01', hours: 0.8 },
      { origin: 'B', dest: 'C', date: '2026-11-01', hours: 0.5 },
      { origin: 'C', dest: 'A', date: '2026-11-02', hours: 3 },
    ], minDailyHours: 2 });
    // Day 1: 1.3 h → 2 h; day 2: 3 h. Top-up 0.7 h.
    expect(line(r, 'minimum')).toBe(350_000);
    expect(r.billableHours).toBe(5);
  });

  it('adds positioning, fuel, crew, fees, margin, tax and segment fees in order', () => {
    const r = computeWorksheet({
      ...base, positioningHours: 1, fuelSurchargePct: 10, overnights: 2, crewOvernight: 800,
      landingFees: 1200, catering: 600, other: 200, marginPct: 10, fetPct: 7.5, segmentFeePerPax: 5.3,
    });
    // Time 12.5 h × $5,000 = $62,500; fuel $6,250; crew $1,600; fees $2,000 → cost $72,350.
    expect(r.costCents).toBe(7_235_000);
    expect(line(r, 'margin')).toBe(723_500);
    expect(r.baseCents).toBe(7_958_500);
    expect(line(r, 'fet')).toBe(596_888);
    expect(line(r, 'segment')).toBe(4_240); // 2 legs × 4 pax × $5.30
    // 7,958,500 + 596,888 + 4,240 = 8,559,628 → whole dollars.
    expect(r.totalCents).toBe(8_559_600);
    expect(r.lines.map(l => l.key)).toEqual(['flight', 'positioning', 'fuel', 'crew', 'landing', 'catering', 'other', 'margin', 'fet', 'segment']);
  });

  it('omits zero lines', () => {
    expect(computeWorksheet({ ...base, hourlyRate: 0 }).lines).toEqual([]);
  });
});

describe('defaults', () => {
  it('estimates leg hours from distance and cruise speed', () => {
    // SFO–JFK 2,247 nm at 450 kt = 4.99 h + 0.3 allowance.
    expect(estimateLegHours('KSFO', 'KJFK', 450)).toBe(5.3);
    expect(estimateLegHours('ZZZZ', 'KJFK')).toBeNull();
  });

  it('counts nights from first to last leg', () => {
    expect(nightsAway(['2026-11-03', '2026-11-01'])).toBe(2);
    expect(nightsAway(['2026-11-01'])).toBe(0);
  });

  it('starts from the aircraft rate and speed and passes validation', () => {
    const w = defaultWorksheet({
      legs: [{ origin: 'KSFO', dest: 'KJFK', date: '2026-11-01' }, { origin: 'KJFK', dest: 'KSFO', date: '2026-11-04' }],
      passengers: 3,
      aircraft: { id: 7, hourly_rate_cents: 650_000, cruise_ktas: 450 },
    });
    expect(w).toMatchObject({ aircraftId: 7, hourlyRate: 6500, overnights: 3, fetPct: 7.5, passengers: 3 });
    expect(w.legs.map(l => l.hours)).toEqual([5.3, 5.3]);
    expect(worksheetSchema.safeParse(w).success).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { AIRPORTS } from './airports';
import { formatLandUnits, formatNm, greatCircleNm, legDistance, tripDistance } from './distance';

describe('great-circle distance', () => {
  // Published great-circle distances (e.g. Great Circle Mapper), within 0.5%.
  it.each([
    ['PHNL', 'KLAX', 2217],
    ['KJFK', 'EGLL', 2999],
    ['PHNL', 'PHOG', 87],
    ['KSFO', 'KJFK', 2247],
  ])('%s → %s is about %i nm', (a, b, nm) => {
    const d = legDistance(a, b)!;
    expect(d).not.toBeNull();
    expect(Math.abs(d.nm - nm) / nm).toBeLessThan(0.005);
  });

  it('accepts IATA codes and is symmetric', () => {
    expect(legDistance('HNL', 'LAX')!.nm).toBeCloseTo(legDistance('KLAX', 'PHNL')!.nm, 6);
  });

  it('is zero for the same airport and null for unknown codes', () => {
    expect(greatCircleNm(21.3, -157.9, 21.3, -157.9)).toBe(0);
    expect(legDistance('PHNL', 'ZZZZ')).toBeNull();
    expect(legDistance('', 'KLAX')).toBeNull();
  });

  it('converts units', () => {
    const d = legDistance('PHNL', 'KLAX')!;
    expect(d.mi / d.nm).toBeCloseTo(1.150779, 5);
    expect(d.km / d.nm).toBeCloseTo(1.852, 5);
    expect(formatNm(d)).toMatch(/^2,2\d\d nm$/);
    expect(formatLandUnits(d)).toMatch(/^2,5\d\d mi · 4,1\d\d km$/);
  });

  it('sums a trip and reports legs it could not measure', () => {
    const t = tripDistance([
      { originCode: 'KLAX', destCode: 'PHNL' },
      { originCode: 'PHNL', destCode: 'KLAX' },
    ]);
    expect(t.complete).toBe(true);
    expect(t.total.nm).toBeCloseTo(2 * legDistance('KLAX', 'PHNL')!.nm, 6);
    expect(tripDistance([{ originCode: 'KLAX', destCode: '' }]).complete).toBe(false);
  });
});

describe('airport data', () => {
  it('has coordinates for every airport', () => {
    for (const a of AIRPORTS) {
      expect(Number.isFinite(a.lat) && Math.abs(a.lat) <= 90, a.icao).toBe(true);
      expect(Number.isFinite(a.lon) && Math.abs(a.lon) <= 180, a.icao).toBe(true);
    }
  });

  it('has unique ICAO and IATA codes', () => {
    expect(new Set(AIRPORTS.map(a => a.icao)).size).toBe(AIRPORTS.length);
    expect(new Set(AIRPORTS.map(a => a.iata)).size).toBe(AIRPORTS.length);
  });
});

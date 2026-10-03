import { describe, expect, it } from 'vitest';
import { toIso, toPositional } from './index';

describe('toIso', () => {
  it('converts Postgres timestamptz text to UTC ISO', () => {
    expect(toIso('2026-10-03 21:56:01.123456+00')).toBe('2026-10-03T21:56:01.123Z');
    expect(toIso('2026-10-03 21:56:01+00')).toBe('2026-10-03T21:56:01.000Z');
    expect(toIso('2026-10-03 11:56:01.5-10')).toBe('2026-10-03T21:56:01.500Z');
    expect(toIso('2026-10-04 03:26:01+05:30')).toBe('2026-10-03T21:56:01.000Z');
  });

  it('is idempotent on ISO input and passes through special values', () => {
    expect(toIso('2026-10-03T21:56:01.123Z')).toBe('2026-10-03T21:56:01.123Z');
    expect(toIso('infinity')).toBe('infinity');
  });
});

describe('toPositional', () => {
  it('numbers placeholders in order', () => {
    expect(toPositional('a = ? AND b IN (?, ?)')).toBe('a = $1 AND b IN ($2, $3)');
  });
});

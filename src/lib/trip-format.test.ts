import { describe, expect, it } from 'vitest';
import { formatTripDate, formatTripTime, formatDeparture, tripRoute, legLine } from './trip-format';

describe('trip formatting', () => {
  it('formats dates in UTC without shifting the day', () => {
    expect(formatTripDate('2026-12-01')).toBe('Tue, Dec 1, 2026');
    expect(formatTripDate('2026-01-01')).toBe('Thu, Jan 1, 2026');
  });

  it('formats 24h times as 12h', () => {
    expect(formatTripTime('00:05')).toBe('12:05 AM');
    expect(formatTripTime('09:30')).toBe('9:30 AM');
    expect(formatTripTime('12:00')).toBe('12:00 PM');
    expect(formatTripTime('23:59')).toBe('11:59 PM');
  });

  it('returns empty for missing or malformed values', () => {
    expect(formatTripDate('')).toBe('');
    expect(formatTripDate('12/01/2026')).toBe('');
    expect(formatTripTime('')).toBe('');
    expect(formatTripTime('25:00')).toBe('');
    expect(formatTripTime('9am')).toBe('');
  });

  it('builds the route, marking legs still being entered', () => {
    expect(tripRoute([{ from: 'KLAX', to: 'PHNL', date: '', time: '' }, { from: 'PHNL', to: 'KLAX', date: '', time: '' }])).toBe('KLAX → PHNL → KLAX');
    expect(tripRoute([{ from: 'KLAX', to: '', date: '', time: '' }])).toBe('KLAX → …');
    expect(tripRoute([])).toBe('');
  });

  it('describes a leg on one line', () => {
    expect(legLine({ from: 'KLAX', to: 'PHNL', date: '2026-12-01', time: '09:30' }, 0)).toBe('Leg 1: KLAX → PHNL · Tue, Dec 1, 2026, 9:30 AM');
    expect(legLine({ from: 'PHNL', to: 'KLAX', date: '2026-12-08', time: '' }, 1)).toBe('Leg 2: PHNL → KLAX · Tue, Dec 8, 2026, any time');
  });

  it('formats a departure as day and 24h local time', () => {
    expect(formatDeparture('2026-10-10', '09:30')).toBe('Sat 10 Oct · 09:30');
    expect(formatDeparture('2026-10-10', '')).toBe('Sat 10 Oct · Any time');
    expect(formatDeparture('', '09:30')).toBe('');
  });
});

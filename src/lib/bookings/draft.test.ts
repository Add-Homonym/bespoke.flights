import { describe, expect, it } from 'vitest';
import { parseDraft, serializeDraft, draftHasContent, draftToRequest, emptyDraft } from './draft';
import { bookingRequestSchema } from '@/lib/validations';

const trip = {
  passengerCount: 4,
  notes: 'Dog on board; "quotes" & semicolons; ok',
  legs: [
    { originCode: 'KLAX', destCode: 'PHNL', departureDate: '2026-12-01', departureTime: '09:30' },
    { originCode: 'PHNL', destCode: 'KLAX', departureDate: '2026-12-08', departureTime: '' },
  ],
};

describe('booking draft cookie', () => {
  it('round-trips through the cookie value', () => {
    const value = serializeDraft(trip);
    expect(value).not.toMatch(/[;,\s"]/); // safe as a raw cookie value
    expect(parseDraft(value)).toEqual(trip);
  });

  it('becomes a valid booking request when complete', () => {
    expect(bookingRequestSchema.safeParse(draftToRequest(trip)).success).toBe(true);
  });

  it('rejects incomplete drafts at submit time', () => {
    const partial = { ...trip, legs: [{ originCode: 'KLAX', destCode: '', departureDate: '', departureTime: '' }] };
    expect(bookingRequestSchema.safeParse(draftToRequest(partial)).success).toBe(false);
  });

  it('returns null for missing or malformed values without throwing', () => {
    expect(parseDraft(undefined)).toBeNull();
    expect(parseDraft('')).toBeNull();
    expect(parseDraft('%E0%A4%A')).toBeNull();
    expect(parseDraft('not-json')).toBeNull();
    expect(parseDraft(encodeURIComponent('42'))).toBeNull();
  });

  it('sanitizes tampered values', () => {
    const tampered = encodeURIComponent(JSON.stringify({
      passengerCount: 500,
      notes: 'x'.repeat(5000),
      legs: Array.from({ length: 50 }, () => ({ originCode: 'klaxxx', destCode: 7, departureDate: 'tomorrow', departureTime: '9am' })),
    }));
    const d = parseDraft(tampered)!;
    expect(d.passengerCount).toBe(1);
    expect(d.notes).toHaveLength(500);
    expect(d.legs).toHaveLength(10);
    expect(d.legs[0]).toEqual({ originCode: 'KLAX', destCode: '', departureDate: '', departureTime: '' });
  });

  it('stays under the 4 KB cookie limit at maximum size', () => {
    const big = {
      passengerCount: 19,
      notes: 'é'.repeat(500),
      legs: Array.from({ length: 10 }, () => ({ originCode: 'KLAX', destCode: 'PHNL', departureDate: '2026-12-01', departureTime: '09:30' })),
    };
    const value = serializeDraft(big);
    expect(`bf_booking_draft=${value}`.length).toBeLessThan(4096);
    const back = parseDraft(value)!;
    expect(back.legs).toHaveLength(10);
    expect(back.notes.length).toBeGreaterThan(100);
    expect(big.notes.startsWith(back.notes)).toBe(true);
  });

  it('knows an untouched form has nothing worth saving', () => {
    expect(draftHasContent(emptyDraft())).toBe(false);
    expect(draftHasContent(trip)).toBe(true);
  });
});

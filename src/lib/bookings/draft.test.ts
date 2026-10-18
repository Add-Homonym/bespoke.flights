import { describe, expect, it } from 'vitest';
import { parseDraft, serializeDraft, draftHasContent, draftToRequest, emptyDraft } from './draft';
import { bookingRequestSchema } from '@/lib/validations';
import { REQUEST_TAGS, MAX_CUSTOM_REQUESTS, MAX_CUSTOM_REQUEST_CHARS, combineRequests, type RequestTagId } from './request-tags';

const trip = {
  passengerCount: 4,
  tags: ['pets', 'surfboards'] as RequestTagId[],
  custom: ['Dog on board, "quotes" & semicolons ok', 'Late arrival'],
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
      passengerCount: 5000,
      custom: [...Array.from({ length: 20 }, (_, i) => `req ${i} ` + 'x'.repeat(500)), 7, null],
      legs: Array.from({ length: 50 }, () => ({ originCode: 'klaxxx', destCode: 7, departureDate: 'tomorrow', departureTime: '9am' })),
    }));
    const d = parseDraft(tampered)!;
    expect(d.passengerCount).toBe(1);
    expect(d.custom).toHaveLength(MAX_CUSTOM_REQUESTS);
    expect(d.custom.every(c => c.length === MAX_CUSTOM_REQUEST_CHARS)).toBe(true);
    expect(d.legs).toHaveLength(10);
    expect(d.legs[0]).toEqual({ originCode: 'KLAX', destCode: '', departureDate: '', departureTime: '' });
  });

  it('stays under the 4 KB cookie limit at maximum size', () => {
    const big = {
      passengerCount: 19,
      tags: REQUEST_TAGS.map(t => t.id) as RequestTagId[],
      custom: Array.from({ length: MAX_CUSTOM_REQUESTS }, (_, i) => `${i}` + 'é'.repeat(MAX_CUSTOM_REQUEST_CHARS - 1)),
      legs: Array.from({ length: 10 }, () => ({ originCode: 'KLAX', destCode: 'PHNL', departureDate: '2026-12-01', departureTime: '09:30' })),
    };
    const value = serializeDraft(big);
    expect(`bf_booking_draft=${value}`.length).toBeLessThan(4096);
    const back = parseDraft(value)!;
    expect(back.legs).toHaveLength(10);
    expect(back.tags).toHaveLength(REQUEST_TAGS.length);
    // Long non-ASCII requests are shortened, not dropped, and keep their start.
    expect(back.custom).toHaveLength(MAX_CUSTOM_REQUESTS);
    back.custom.forEach((c, i) => expect(big.custom[i].startsWith(c)).toBe(true));
  });

  it('knows an untouched form has nothing worth saving', () => {
    expect(draftHasContent(emptyDraft())).toBe(false);
    expect(draftHasContent(trip)).toBe(true);
  });

  it('folds tags and custom requests into the notes sent with the request', () => {
    expect(draftToRequest(trip).notes).toBe('Pets, Surfboards. Dog on board, "quotes" & semicolons ok; Late arrival');
    expect(draftToRequest({ ...trip, custom: [] }).notes).toBe('Pets, Surfboards');
    expect(draftToRequest({ ...trip, tags: [] }).notes).toBe('Dog on board, "quotes" & semicolons ok; Late arrival');
    expect(draftToRequest({ ...trip, tags: [], custom: [] }).notes).toBeUndefined();
  });

  it('reads a draft saved with the old free-text notes as one custom request', () => {
    const old = encodeURIComponent(JSON.stringify({ passengerCount: 2, notes: '  Two dogs.  ', legs: trip.legs }));
    expect(parseDraft(old)!.custom).toEqual(['Two dogs.']);
  });

  it('trims, de-duplicates and caps custom requests', () => {
    const value = encodeURIComponent(JSON.stringify({ ...trip, custom: ['  Late   arrival ', 'late arrival', '', 'Wine'] }));
    expect(parseDraft(value)!.custom).toEqual(['Late arrival', 'Wine']);
  });

  it('keeps known tags only, once each, in list order', () => {
    const value = encodeURIComponent(JSON.stringify({ ...trip, tags: ['wifi', 'bogus', 'pets', 'pets', 3] }));
    expect(parseDraft(value)!.tags).toEqual(['pets', 'wifi']);
    expect(parseDraft(encodeURIComponent(JSON.stringify({ ...trip, tags: undefined })))!.tags).toEqual([]);
  });

  it('counts tags alone as content worth saving', () => {
    expect(draftHasContent({ ...emptyDraft(), tags: ['ground'] })).toBe(true);
    expect(draftHasContent({ ...emptyDraft(), custom: ['Wine'] })).toBe(true);
    expect(combineRequests(['ground', 'medical'], ['  '])).toBe('Ground transportation, Medical devices');
    expect(combineRequests([], ['Champagne.', 'Late arrival;'])).toBe('Champagne; Late arrival');
  });
});

/**
 * Booking draft: the itinerary a visitor is building, kept in a cookie so the
 * browser remembers it across reloads and visits, and so it can be submitted
 * after the visitor signs up or signs in.
 *
 * Shared by the client (writes on every edit) and the server (prefills the
 * form, and turns the draft into a booking request after authentication).
 * Not httpOnly: the form writes it from the browser. It holds only trip
 * details, never credentials.
 */

export const DRAFT_COOKIE = 'bf_booking_draft';
export const DRAFT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_LEGS = 10;
const MAX_NOTES = 500;

export interface DraftLeg {
  originCode: string;
  destCode: string;
  departureDate: string;
  departureTime: string;
}

export interface BookingDraft {
  passengerCount: number;
  notes: string;
  legs: DraftLeg[];
}

export const emptyLeg = (): DraftLeg => ({ originCode: '', destCode: '', departureDate: '', departureTime: '' });
export const emptyDraft = (): BookingDraft => ({ passengerCount: 1, notes: '', legs: [emptyLeg()] });

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Parse a cookie value leniently: unknown or malformed fields fall back to empty. Never throws. */
export function parseDraft(raw: string | undefined | null): BookingDraft | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return null;
    const legs = Array.isArray(data.legs)
      ? data.legs.slice(0, MAX_LEGS).map(l => {
          const leg = (l ?? {}) as Record<string, unknown>;
          return {
            originCode: str(leg.originCode, 4).toUpperCase(),
            destCode: str(leg.destCode, 4).toUpperCase(),
            departureDate: /^\d{4}-\d{2}-\d{2}$/.test(str(leg.departureDate, 10)) ? str(leg.departureDate, 10) : '',
            departureTime: /^\d{2}:\d{2}$/.test(str(leg.departureTime, 5)) ? str(leg.departureTime, 5) : '',
          };
        })
      : [];
    const pax = Number(data.passengerCount);
    return {
      passengerCount: Number.isInteger(pax) && pax >= 1 && pax <= 19 ? pax : 1,
      notes: str(data.notes, MAX_NOTES),
      legs: legs.length > 0 ? legs : [emptyLeg()],
    };
  } catch {
    return null;
  }
}

/** Browsers drop cookies over 4096 bytes (name + value) without an error. */
const MAX_COOKIE_VALUE = 3800;

export function serializeDraft(draft: BookingDraft): string {
  const encode = (notes: string) => encodeURIComponent(JSON.stringify({
    passengerCount: draft.passengerCount,
    notes,
    legs: draft.legs.slice(0, MAX_LEGS),
  }));
  // Non-ASCII notes expand up to 9x when encoded; shorten them rather than
  // lose the whole itinerary.
  let notes = draft.notes.slice(0, MAX_NOTES);
  let value = encode(notes);
  while (value.length > MAX_COOKIE_VALUE && notes.length > 0) {
    notes = notes.slice(0, Math.floor(notes.length * 0.8));
    value = encode(notes);
  }
  return value;
}

/** True when the draft has any user input worth keeping. */
export function draftHasContent(draft: BookingDraft): boolean {
  return draft.notes !== '' || draft.passengerCount !== 1 ||
    draft.legs.some(l => l.originCode || l.destCode || l.departureDate || l.departureTime);
}

/** The API payload for a draft (shape accepted by bookingRequestSchema). */
export function draftToRequest(draft: BookingDraft) {
  return {
    passengerCount: draft.passengerCount,
    notes: draft.notes || undefined,
    legs: draft.legs.map(l => ({
      originCode: l.originCode.toUpperCase(),
      destCode: l.destCode.toUpperCase(),
      departureDate: l.departureDate,
      departureTime: l.departureTime || undefined,
    })),
  };
}

/** Browser only: write or clear the draft cookie. */
export function writeDraftCookie(draft: BookingDraft | null) {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = draft && draftHasContent(draft)
    ? `${DRAFT_COOKIE}=${serializeDraft(draft)}; Path=/; Max-Age=${DRAFT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
    : `${DRAFT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

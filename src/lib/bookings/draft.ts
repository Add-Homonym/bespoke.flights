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

import { combineRequests, normalizeCustom, normalizeTags, MAX_CUSTOM_REQUEST_CHARS, type RequestTagId } from './request-tags';

export const DRAFT_COOKIE = 'bf_booking_draft';
export const DRAFT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_LEGS = 10;

export interface DraftLeg {
  originCode: string;
  destCode: string;
  departureDate: string;
  departureTime: string;
}

export interface BookingDraft {
  passengerCount: number;
  /** Quick-add special request tags (see request-tags.ts). */
  tags: RequestTagId[];
  /** Special requests the traveler wrote, one per chip. */
  custom: string[];
  legs: DraftLeg[];
}

export const emptyLeg = (): DraftLeg => ({ originCode: '', destCode: '', departureDate: '', departureTime: '' });
export const emptyDraft = (): BookingDraft => ({ passengerCount: 1, tags: [], custom: [], legs: [emptyLeg()] });

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
      passengerCount: Number.isInteger(pax) && pax >= 1 && pax <= 999 ? pax : 1,
      tags: normalizeTags(data.tags),
      // Drafts saved before custom chips kept one free-text `notes` field.
      custom: Array.isArray(data.custom) ? normalizeCustom(data.custom) : normalizeCustom([str(data.notes, MAX_CUSTOM_REQUEST_CHARS)]),
      legs: legs.length > 0 ? legs : [emptyLeg()],
    };
  } catch {
    return null;
  }
}

/** Browsers drop cookies over 4096 bytes (name + value) without an error. */
const MAX_COOKIE_VALUE = 3800;

export function serializeDraft(draft: BookingDraft): string {
  const encode = (custom: string[]) => encodeURIComponent(JSON.stringify({
    passengerCount: draft.passengerCount,
    tags: draft.tags,
    custom,
    legs: draft.legs.slice(0, MAX_LEGS),
  }));
  // Non-ASCII text expands up to 9x when encoded; shorten the longest custom
  // request rather than lose the whole itinerary.
  const custom = normalizeCustom(draft.custom);
  let value = encode(custom);
  while (value.length > MAX_COOKIE_VALUE && custom.some(c => c.length > 0)) {
    const i = custom.reduce((longest, c, j) => (c.length > custom[longest].length ? j : longest), 0);
    custom[i] = custom[i].slice(0, Math.floor(custom[i].length * 0.8));
    value = encode(custom.filter(Boolean));
  }
  return value;
}

/** True when the draft has any user input worth keeping. */
export function draftHasContent(draft: BookingDraft): boolean {
  return draft.custom.length > 0 || draft.tags.length > 0 || draft.passengerCount !== 1 ||
    draft.legs.some(l => l.originCode || l.destCode || l.departureDate || l.departureTime);
}

/** The API payload for a draft (shape accepted by bookingRequestSchema). */
export function draftToRequest(draft: BookingDraft) {
  return {
    passengerCount: draft.passengerCount,
    notes: combineRequests(draft.tags, draft.custom) || undefined,
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

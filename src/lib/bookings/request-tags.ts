/**
 * Quick-add tags for special requests. Stored by id in the booking draft and
 * folded into the request's notes on submit, so every page and email that
 * shows special requests shows them too.
 */
export const REQUEST_TAGS = [
  { id: 'pets', label: 'Pets' },
  { id: 'surfboards', label: 'Surfboards' },
  { id: 'golf', label: 'Golf clubs' },
  { id: 'luggage', label: 'Extra luggage' },
  { id: 'ground', label: 'Ground transportation' },
  { id: 'catering', label: 'Catering' },
  { id: 'medical', label: 'Medical devices' },
  { id: 'wheelchair', label: 'Wheelchair assistance' },
  { id: 'child-seat', label: 'Child seats' },
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'attendant', label: 'Flight attendant' },
  { id: 'lavatory', label: 'Enclosed lavatory' },
] as const;

export type RequestTagId = (typeof REQUEST_TAGS)[number]['id'];

const KNOWN = new Set<string>(REQUEST_TAGS.map(t => t.id));

/** Keep known ids only, once each, in list order. */
export function normalizeTags(ids: unknown): RequestTagId[] {
  if (!Array.isArray(ids)) return [];
  const chosen = new Set(ids.filter((x): x is string => typeof x === 'string' && KNOWN.has(x)));
  return REQUEST_TAGS.filter(t => chosen.has(t.id)).map(t => t.id);
}

/** Requests the traveler writes themselves, each shown as an editable chip. */
export const MAX_CUSTOM_REQUESTS = 6;
export const MAX_CUSTOM_REQUEST_CHARS = 120;

/** Trim, drop empties and duplicates, cap count and length. */
export function normalizeCustom(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    if (typeof e !== 'string') continue;
    const text = e.replace(/\s+/g, ' ').trim().slice(0, MAX_CUSTOM_REQUEST_CHARS);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === MAX_CUSTOM_REQUESTS) break;
  }
  return out;
}

/**
 * The text operators see: preset tags, then the traveler's own requests.
 * 'Pets, Surfboards. Two dogs under 20 lb; Late arrival'
 */
export function combineRequests(tags: readonly string[], custom: readonly string[]): string {
  const labels = REQUEST_TAGS.filter(t => tags.includes(t.id)).map(t => t.label);
  const own = custom.map(c => c.trim().replace(/[.;,\s]+$/, '')).filter(Boolean);
  const parts = [labels.join(', '), own.join('; ')].filter(Boolean);
  return parts.join('. ');
}

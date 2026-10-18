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

/** 'Pets, Surfboards. Two dogs under 20 lb.' — tags first, then the free text. */
export function combineRequests(tags: readonly string[], notes: string): string {
  const labels = REQUEST_TAGS.filter(t => tags.includes(t.id)).map(t => t.label);
  const text = notes.trim();
  if (labels.length === 0) return text;
  return text ? `${labels.join(', ')}. ${text}` : labels.join(', ');
}

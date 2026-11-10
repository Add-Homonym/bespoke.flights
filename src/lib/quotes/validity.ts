/**
 * How long a quote stays open. Dates, not instants: lifecycle expires a quote
 * the day after its valid-until date. A quote defaults to 72 hours, or the
 * first departure when that comes sooner, and can never outlive the departure.
 */

export const DEFAULT_VALID_HOURS = 72;

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ValidityWindow {
  /** Earliest allowed date: today. */
  min: string;
  /** Latest allowed date: the first departure. */
  max: string;
  /** Pre-filled date. */
  default: string;
}

export function validityWindow(firstDeparture: string, now = new Date()): ValidityWindow {
  const today = isoDate(now);
  const inThreeDays = isoDate(new Date(now.getTime() + DEFAULT_VALID_HOURS * 3_600_000));
  const max = firstDeparture < today ? today : firstDeparture;
  return { min: today, max, default: inThreeDays > max ? max : inThreeDays };
}

/** The date to store, or a plain-language reason it cannot be used. */
export function resolveValidUntil(requested: string | null | undefined, firstDeparture: string | null, now = new Date()): { value: string } | { error: string } {
  if (!firstDeparture) return { value: requested || isoDate(new Date(now.getTime() + DEFAULT_VALID_HOURS * 3_600_000)) };
  const w = validityWindow(firstDeparture, now);
  if (!requested) return { value: w.default };
  if (requested < w.min) return { error: 'Valid-until date is in the past' };
  if (requested > w.max) return { error: `Valid-until cannot be after the departure date (${w.max})` };
  return { value: requested };
}

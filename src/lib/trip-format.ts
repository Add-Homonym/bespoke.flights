/**
 * Formatting for trip details. Pure functions, safe on server and client:
 * fixed locale and UTC so server and browser render identical text.
 */

export interface TripLeg {
  from: string;
  to: string;
  date: string;  // YYYY-MM-DD, or '' while being entered
  time: string;  // HH:MM, or '' for no preference
}

/** 'Tue, Dec 1, 2026'. Returns '' for an empty or malformed date. */
export function formatTripDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** '9:30 AM'. Returns '' for an empty or malformed time. */
export function formatTripTime(time: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return '';
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return '';
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

export function tripRoute(legs: TripLeg[]): string {
  if (legs.length === 0) return '';
  return [...legs.map(l => l.from || '…'), legs[legs.length - 1].to || '…'].join(' → ');
}

/** One line per leg, for plain-text contexts (Stripe, emails). */
export function legLine(leg: TripLeg, index: number): string {
  const when = [formatTripDate(leg.date), formatTripTime(leg.time) || 'any time'].filter(Boolean).join(', ');
  return `Leg ${index + 1}: ${leg.from || '…'} → ${leg.to || '…'}${when ? ` · ${when}` : ''}`;
}

export function fromDbLegs(legs: { origin_code: string; dest_code: string; departure_date: string; departure_time: string | null }[]): TripLeg[] {
  return legs.map(l => ({ from: l.origin_code, to: l.dest_code, date: l.departure_date, time: l.departure_time ?? '' }));
}

export function fromDraftLegs(legs: { originCode: string; destCode: string; departureDate: string; departureTime: string }[]): TripLeg[] {
  return legs.map(l => ({ from: l.originCode.toUpperCase(), to: l.destCode.toUpperCase(), date: l.departureDate, time: l.departureTime }));
}

/**
 * 'Sat 12 Oct · 09:30': the departure day and 24-hour local time of the
 * departure airport. Without a time: 'Sat 12 Oct · Any time'. '' for a
 * malformed date.
 */
export function formatDeparture(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  const clock = m && Number(m[1]) <= 23 && Number(m[2]) <= 59 ? time : 'Any time';
  return `${day} · ${clock}`;
}

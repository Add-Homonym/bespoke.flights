import { findAirport } from './airports';

/**
 * Great-circle distance between airports: the shortest path over the Earth's
 * surface (haversine on a sphere). Real routings add a few percent for
 * airways and departure/arrival procedures.
 */

/** Mean Earth radius in nautical miles (6,371.0088 km / 1.852). */
const EARTH_RADIUS_NM = 3440.065;
export const KM_PER_NM = 1.852;
export const MI_PER_NM = 1.150779;

export interface Distance {
  nm: number;
  mi: number;
  km: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in nautical miles between two lat/lon points. */
export function greatCircleNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function fromNm(nm: number): Distance {
  return { nm, mi: nm * MI_PER_NM, km: nm * KM_PER_NM };
}

/** Distance between two airport codes (ICAO or IATA), or null when either is unknown. */
export function legDistance(originCode: string, destCode: string): Distance | null {
  const a = findAirport(originCode);
  const b = findAirport(destCode);
  if (!a || !b) return null;
  return fromNm(greatCircleNm(a.lat, a.lon, b.lat, b.lon));
}

/** Sum of the legs whose airports are both known. `complete` is false if any leg could not be measured. */
export function tripDistance(legs: { originCode: string; destCode: string }[]): { total: Distance; complete: boolean; measured: number } {
  let nm = 0;
  let measured = 0;
  for (const leg of legs) {
    const d = legDistance(leg.originCode, leg.destCode);
    if (d) { nm += d.nm; measured++; }
  }
  return { total: fromNm(nm), complete: measured === legs.length, measured };
}

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** '2,217 nm'. */
export function formatNm(d: Distance): string {
  return `${whole.format(Math.round(d.nm))} nm`;
}

/** '2,551 mi · 4,106 km'. */
export function formatLandUnits(d: Distance): string {
  return `${whole.format(Math.round(d.mi))} mi · ${whole.format(Math.round(d.km))} km`;
}

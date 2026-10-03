import type { Db } from './index';
import type { BookingLeg } from '@/lib/types';

/** Parse a route param as a positive integer id; returns 0 (matches nothing) if invalid. */
export function toId(value: string | number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : 0;
}

/** Legs for several requests in one query, keyed by request id and ordered by leg_order. */
export async function legsByRequest(db: Db, requestIds: number[]): Promise<Map<number, BookingLeg[]>> {
  const map = new Map<number, BookingLeg[]>();
  if (requestIds.length === 0) return map;
  const legs = await db.query<BookingLeg>(
    'SELECT * FROM booking_legs WHERE request_id = ANY(?::int[]) ORDER BY request_id, leg_order',
    [requestIds]
  );
  for (const leg of legs) {
    const list = map.get(leg.request_id) ?? [];
    list.push(leg);
    map.set(leg.request_id, list);
  }
  return map;
}

/** Quote counts for several requests in one query. */
export async function quoteCountsByRequest(db: Db, requestIds: number[]): Promise<Map<number, number>> {
  if (requestIds.length === 0) return new Map();
  const rows = await db.query<{ request_id: number; count: number }>(
    'SELECT request_id, COUNT(*) AS count FROM quotes WHERE request_id = ANY(?::int[]) GROUP BY request_id',
    [requestIds]
  );
  return new Map(rows.map(r => [r.request_id, r.count]));
}

/**
 * Daily housekeeping, run by /api/cron/daily-lifecycle.
 *
 *   expireQuotes: pending quotes whose valid_until is before today → 'expired'
 *   completeTrips: booked requests whose last leg is before today → 'completed'
 *   expireEmptyLegs: listed empty legs whose departure date is before today → 'expired'
 *
 * Both are idempotent and email the traveler about what changed.
 */

import type { Db } from '@/lib/db';
import { notifyQuotesExpired, notifyTripCompleted } from '@/lib/notify/traveler';
import { appBaseUrl } from '@/lib/payments/config';
import { expireEmptyLegs } from '@/lib/empty-legs/service';

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface LifecycleResult {
  expiredQuotes: number;
  completedTrips: number;
  expiredEmptyLegs: number;
}

export async function expireQuotes(db: Db, options: { today?: string; baseUrl?: string } = {}): Promise<number> {
  const today = options.today ?? todayUtc();
  const rows = await db.query<{ id: number; request_id: number; company_name: string }>(`
    UPDATE quotes q SET status = 'expired'
    FROM operators o
    WHERE o.id = q.operator_id AND q.status = 'pending' AND q.valid_until IS NOT NULL AND q.valid_until < ?
    RETURNING q.id, q.request_id, o.company_name
  `, [today]);
  if (rows.length === 0) return 0;

  const byRequest = new Map<number, string[]>();
  for (const r of rows) byRequest.set(r.request_id, [...(byRequest.get(r.request_id) ?? []), r.company_name]);
  const baseUrl = options.baseUrl ?? appBaseUrl();
  for (const [requestId, companies] of byRequest) {
    // Only requests still open to booking care; booked/cancelled ones have moved on.
    const status = (await db.one<{ status: string }>('SELECT status FROM booking_requests WHERE id = ?', [requestId]))?.status;
    if (status === 'open' || status === 'quoted') await notifyQuotesExpired(db, requestId, companies, baseUrl);
  }
  return rows.length;
}

export async function completeTrips(db: Db, options: { today?: string; baseUrl?: string } = {}): Promise<number> {
  const today = options.today ?? todayUtc();
  const rows = await db.query<{ id: number }>(`
    UPDATE booking_requests br SET status = 'completed', updated_at = now()
    WHERE br.status = 'booked'
      AND (SELECT MAX(departure_date) FROM booking_legs WHERE request_id = br.id) < ?
    RETURNING br.id
  `, [today]);
  const baseUrl = options.baseUrl ?? appBaseUrl();
  for (const r of rows) await notifyTripCompleted(db, r.id, baseUrl);
  return rows.length;
}

export async function runDailyLifecycle(db: Db, options: { today?: string; baseUrl?: string } = {}): Promise<LifecycleResult> {
  return {
    expiredQuotes: await expireQuotes(db, options),
    completedTrips: await completeTrips(db, options),
    expiredEmptyLegs: await expireEmptyLegs(db, options.today ?? todayUtc()),
  };
}

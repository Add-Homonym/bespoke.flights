/**
 * Operator dashboard: one summary per operator section (inbound, quotes,
 * earnings, team, fleet), computed in a handful of aggregate queries.
 */

import type { Db } from '@/lib/db';

export interface Dashboard {
  inbound: {
    /** Matched to this operator, still open, not yet quoted. */
    awaiting: number;
    /** Matched and quoted. */
    quoted: number;
    /** Matched requests that closed without a quote from this operator. */
    missed: number;
    total: number;
    /** Requests matched per week, oldest first, the current week last. */
    weekly: number[];
  };
  quotes: {
    pending: number;
    accepted: number;
    rejected: number;
    withdrawn: number;
    total: number;
    /** Accepted ÷ (accepted + rejected), 0–1; null before any decision. */
    winRate: number | null;
  };
  earnings: {
    /** Operator payouts on paid bookings (after platform fee), net of refunds. */
    payoutCents: number;
    paidBookings: number;
    refundedCents: number;
    /** Payouts per calendar month, oldest first, the current month last. */
    monthly: { month: string; cents: number }[];
  };
  team: {
    active: number;
    inactive: number;
    emailAlerts: number;
    smsAlerts: number;
    members: { name: string; role: string | null }[];
  };
  fleet: {
    count: number;
    seats: number;
    withPhotos: number;
    /** Aircraft whose stored FAA record shows a problem (not valid, expired, unassigned). */
    registryFlags: number;
    unchecked: number;
    aircraft: { id: number; type: string; tail: string; coverPhotoId: number | null }[];
  };
}

/** The operator's share of a payment after refunds: payout scaled by the unrefunded fraction. */
const netPayout = `CASE WHEN amount_cents > 0
  THEN operator_payout_cents * GREATEST(amount_cents - refunded_cents, 0) / amount_cents
  ELSE 0 END`;

const WEEKS = 8;
const MONTHS = 6;

/** 'YYYY-MM' for the last n months, current last. */
function monthKeys(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export async function buildDashboard(db: Db, operatorId: number, now = new Date()): Promise<Dashboard> {
  const [inbound, weekly, quotes, earnings, monthly, team, members, fleet, aircraft] = await Promise.all([
    db.one<{ awaiting: number; quoted: number; missed: number; total: number }>(`
      SELECT
        COUNT(*) FILTER (WHERE q.id IS NULL AND br.status IN ('open','quoted'))::int AS awaiting,
        COUNT(*) FILTER (WHERE q.id IS NOT NULL)::int AS quoted,
        COUNT(*) FILTER (WHERE q.id IS NULL AND br.status NOT IN ('open','quoted'))::int AS missed,
        COUNT(*)::int AS total
      FROM outreach_log ol
      JOIN booking_requests br ON br.id = ol.request_id
      LEFT JOIN LATERAL (SELECT id FROM quotes WHERE request_id = ol.request_id AND operator_id = ol.operator_id LIMIT 1) q ON true
      WHERE ol.operator_id = ?`, [operatorId]),
    db.query<{ week: number; n: number }>(`
      SELECT FLOOR(EXTRACT(EPOCH FROM (?::timestamptz - sent_at)) / 604800)::int AS week, COUNT(*)::int AS n
      FROM outreach_log
      WHERE operator_id = ? AND sent_at > ?::timestamptz - interval '${WEEKS} weeks'
      GROUP BY 1`, [now.toISOString(), operatorId, now.toISOString()]),
    db.one<{ pending: number; accepted: number; rejected: number; withdrawn: number }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE status = 'withdrawn')::int AS withdrawn
      FROM quotes WHERE operator_id = ?`, [operatorId]),
    db.one<{ payout: number; refunded: number; paid: number }>(`
      SELECT
        COALESCE(SUM(${netPayout}) FILTER (WHERE status IN ('succeeded','partially_refunded','refunded')), 0)::bigint AS payout,
        COALESCE(SUM(refunded_cents), 0)::bigint AS refunded,
        COUNT(*) FILTER (WHERE status IN ('succeeded','partially_refunded','refunded'))::int AS paid
      FROM payments WHERE operator_id = ?`, [operatorId]),
    db.query<{ month: string; cents: number }>(`
      SELECT to_char(date_trunc('month', COALESCE(paid_at, created_at) AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
             COALESCE(SUM(${netPayout}), 0)::bigint AS cents
      FROM payments
      WHERE operator_id = ? AND status IN ('succeeded','partially_refunded','refunded')
        AND COALESCE(paid_at, created_at) >= date_trunc('month', ?::timestamptz AT TIME ZONE 'UTC') - interval '${MONTHS - 1} months'
      GROUP BY 1`, [operatorId, now.toISOString()]),
    db.one<{ active: number; inactive: number; email: number; sms: number }>(`
      SELECT
        COUNT(*) FILTER (WHERE active = 1)::int AS active,
        COUNT(*) FILTER (WHERE active = 0)::int AS inactive,
        COUNT(*) FILTER (WHERE active = 1 AND notify_email = 1 AND email IS NOT NULL)::int AS email,
        COUNT(*) FILTER (WHERE active = 1 AND notify_sms = 1 AND phone IS NOT NULL)::int AS sms
      FROM operator_staff WHERE operator_id = ?`, [operatorId]),
    db.query<{ name: string; role: string | null }>(
      'SELECT name, role FROM operator_staff WHERE operator_id = ? AND active = 1 ORDER BY created_at, id LIMIT 6', [operatorId]),
    db.one<{ count: number; seats: number; with_photos: number; unchecked: number; flags: number }>(`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(SUM(capacity), 0)::int AS seats,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM aircraft_photos p WHERE p.aircraft_id = a.id))::int AS with_photos,
        COUNT(*) FILTER (WHERE faa_record IS NULL)::int AS unchecked,
        COUNT(*) FILTER (WHERE faa_record IS NOT NULL AND (
          faa_record::jsonb->>'status' <> 'assigned'
          OR lower(COALESCE(faa_record::jsonb->>'registrationStatus', 'valid')) <> 'valid'
          OR (faa_record::jsonb->>'registrationExpires') < to_char(?::timestamptz, 'YYYY-MM-DD')))::int AS flags
      FROM aircraft a WHERE operator_id = ?`, [now.toISOString(), operatorId]),
    db.query<{ id: number; type: string; tail_number: string; cover: number | null }>(`
      SELECT a.id, a.type, a.tail_number,
        (SELECT p.id FROM aircraft_photos p WHERE p.aircraft_id = a.id ORDER BY p.position, p.id LIMIT 1) AS cover
      FROM aircraft a WHERE operator_id = ? ORDER BY created_at DESC, id DESC LIMIT 4`, [operatorId]),
  ]);

  const weeks = Array<number>(WEEKS).fill(0);
  for (const w of weekly) if (w.week >= 0 && w.week < WEEKS) weeks[WEEKS - 1 - w.week] += w.n;

  const byMonth = new Map(monthly.map(m => [m.month, Number(m.cents)]));
  const q = quotes!;
  const decided = q.accepted + q.rejected;

  return {
    inbound: { ...inbound!, weekly: weeks },
    quotes: { ...q, total: q.pending + q.accepted + q.rejected + q.withdrawn, winRate: decided ? q.accepted / decided : null },
    earnings: {
      payoutCents: Number(earnings!.payout),
      refundedCents: Number(earnings!.refunded),
      paidBookings: earnings!.paid,
      monthly: monthKeys(MONTHS, now).map(month => ({ month, cents: byMonth.get(month) ?? 0 })),
    },
    team: { active: team!.active, inactive: team!.inactive, emailAlerts: team!.email, smsAlerts: team!.sms, members },
    fleet: {
      count: fleet!.count,
      seats: fleet!.seats,
      withPhotos: fleet!.with_photos,
      registryFlags: fleet!.flags,
      unchecked: fleet!.unchecked,
      aircraft: aircraft.map(a => ({ id: a.id, type: a.type, tail: a.tail_number, coverPhotoId: a.cover })),
    },
  };
}

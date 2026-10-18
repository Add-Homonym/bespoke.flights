/**
 * Operator dashboard: four summaries — deals, fleet, team, settings.
 */

import type { Db } from '@/lib/db';
import type { Operator } from '@/lib/types';

export interface Dashboard {
  deals: {
    /** Requests matched to this operator. */
    inbound: number;
    /** Matched, still open, not yet quoted. */
    awaiting: number;
    submitted: number;
    accepted: number;
    /** Sum of accepted quote prices. */
    wonCents: number;
    /** Autopilot drafts waiting for a staffer. */
    drafts: number;
  };
  fleet: {
    count: number;
    seats: number;
    withoutPhotos: number;
    /** Aircraft whose stored FAA record shows a problem (not valid, expired, unassigned). */
    registryFlags: number;
  };
  team: {
    active: number;
    emailAlerts: number;
    smsAlerts: number;
  };
  settings: {
    /** Routing profile filled in: markets, aircraft types, a contact. */
    profileComplete: boolean;
    payoutsReady: boolean;
  };
}

export async function buildDashboard(db: Db, operator: Operator, now = new Date()): Promise<Dashboard> {
  const id = operator.id;
  const [inbound, quotes, fleet, team, drafts] = await Promise.all([
    db.one<{ inbound: number; awaiting: number }>(`
      SELECT COUNT(*)::int AS inbound,
        COUNT(*) FILTER (WHERE br.status IN ('open','quoted')
          AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = ol.request_id AND q.operator_id = ol.operator_id))::int AS awaiting
      FROM outreach_log ol JOIN booking_requests br ON br.id = ol.request_id
      WHERE ol.operator_id = ?`, [id]),
    db.one<{ submitted: number; accepted: number; won: number }>(`
      SELECT COUNT(*)::int AS submitted,
        COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
        COALESCE(SUM(price_cents) FILTER (WHERE status = 'accepted'), 0)::bigint AS won
      FROM quotes WHERE operator_id = ?`, [id]),
    db.one<{ count: number; seats: number; without_photos: number; flags: number }>(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(capacity), 0)::int AS seats,
        COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM aircraft_photos p WHERE p.aircraft_id = a.id))::int AS without_photos,
        COUNT(*) FILTER (WHERE faa_record IS NOT NULL AND (
          faa_record::jsonb->>'status' <> 'assigned'
          OR lower(COALESCE(faa_record::jsonb->>'registrationStatus', 'valid')) <> 'valid'
          OR (faa_record::jsonb->>'registrationExpires') < to_char(?::timestamptz, 'YYYY-MM-DD')))::int AS flags
      FROM aircraft a WHERE operator_id = ?`, [now.toISOString(), id]),
    db.one<{ active: number; email: number; sms: number }>(`
      SELECT COUNT(*) FILTER (WHERE active = 1)::int AS active,
        COUNT(*) FILTER (WHERE active = 1 AND notify_email = 1 AND email IS NOT NULL)::int AS email,
        COUNT(*) FILTER (WHERE active = 1 AND notify_sms = 1 AND phone IS NOT NULL)::int AS sms
      FROM operator_staff WHERE operator_id = ?`, [id]),
    db.one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM quote_drafts d JOIN booking_requests br ON br.id = d.request_id
      WHERE d.operator_id = ? AND d.status = 'draft' AND br.status IN ('open','quoted')`, [id]),
  ]);

  const list = (json: string | null) => { try { return (JSON.parse(json ?? '[]') as unknown[]).length > 0; } catch { return false; } };

  return {
    deals: { ...inbound!, submitted: quotes!.submitted, accepted: quotes!.accepted, wonCents: Number(quotes!.won), drafts: drafts!.n },
    fleet: { count: fleet!.count, seats: fleet!.seats, withoutPhotos: fleet!.without_photos, registryFlags: fleet!.flags },
    team: { active: team!.active, emailAlerts: team!.email, smsAlerts: team!.sms },
    settings: {
      profileComplete: list(operator.markets) && list(operator.fleet_types) && !!(operator.contact_email || operator.contact_phone),
      payoutsReady: !!operator.stripe_payouts_enabled,
    },
  };
}

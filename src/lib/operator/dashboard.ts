/**
 * Operator dashboard: four summaries — deals, fleet, team, settings.
 */

import type { Db } from '@/lib/db';
import type { Operator } from '@/lib/types';

export interface ChecklistItem {
  key: 'profile' | 'certificate' | 'safety' | 'fleet' | 'payouts' | 'policy';
  label: string;
  done: boolean;
  /** What is missing, or what is in place. */
  detail: string;
  href: string;
  /** What this step gates: staff approval, getting paid, or nothing (a default applies). */
  gate: 'approval' | 'payment' | 'optional';
}

export interface Dashboard {
  deals: {
    /** Requests matched to this operator. */
    inbound: number;
    /** Matched, still open, not yet quoted. */
    awaiting: number;
    submitted: number;
    accepted: number;
    /** Sum of accepted quote prices, net of partial refunds; cancelled bookings excluded. */
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
  /** Setup steps with done or missing state. */
  checklist: ChecklistItem[];
  settings: {
    /** Routing profile filled in: markets, aircraft types, a contact. */
    profileComplete: boolean;
    /** What the routing profile still needs, in words. */
    profileMissing: string[];
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
    // Accepted counts bookings still standing: a cancelled quote is neither accepted nor won,
    // and money refunded on a standing booking (a change to a lower price) comes off the total.
    db.one<{ submitted: number; accepted: number; won: number }>(`
      SELECT COUNT(*)::int AS submitted,
        COUNT(*) FILTER (WHERE q.status = 'accepted')::int AS accepted,
        COALESCE(SUM(q.price_cents - COALESCE(r.refunded, 0)) FILTER (WHERE q.status = 'accepted'), 0)::bigint AS won
      FROM quotes q
      LEFT JOIN LATERAL (
        SELECT SUM(p.refunded_cents) AS refunded FROM payments p
        WHERE p.quote_id = q.id AND p.change_request_id IS NULL AND p.status IN ('succeeded','partially_refunded')
      ) r ON true
      WHERE q.operator_id = ?`, [id]),
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

  const profileMissing = [
    !list(operator.markets) && 'markets you serve',
    !list(operator.fleet_types) && 'aircraft categories',
    !(operator.contact_email || operator.contact_phone) && 'a charter sales email or phone',
  ].filter((m): m is string => !!m);
  const has = (v: string | null | undefined) => !!v?.trim();
  const checklist: ChecklistItem[] = [
    { key: 'profile', label: 'Company profile', done: profileMissing.length === 0, gate: 'approval', href: '/operator/settings',
      detail: profileMissing.length ? `Add ${profileMissing.join(', ')} so requests are routed to you.` : 'Markets, aircraft categories and a contact are set.' },
    { key: 'certificate', label: 'FAA Part 135 certificate', done: has(operator.certificate), gate: 'approval', href: '/operator/settings',
      detail: has(operator.certificate) ? `Certificate ${operator.certificate}.` : 'Enter your certificate number.' },
    { key: 'safety', label: 'Safety rating', done: has(operator.safety_rating), gate: 'approval', href: '/operator/settings',
      detail: has(operator.safety_rating) ? `${operator.safety_rating}.` : 'Choose your highest safety rating.' },
    { key: 'fleet', label: 'Fleet', done: fleet!.count > 0, gate: 'approval', href: '/operator/fleet',
      detail: fleet!.count > 0 ? `${fleet!.count} aircraft listed.` : 'Add at least one aircraft.' },
    { key: 'payouts', label: 'Payout setup', done: !!operator.stripe_payouts_enabled, gate: 'payment', href: '/operator/settings#payouts',
      detail: operator.stripe_payouts_enabled ? 'Ready to be paid.' : 'Connect a payout account. Travelers cannot pay you without one.' },
    { key: 'policy', label: 'Cancellation policy', done: !!operator.cancellation_policy, gate: 'optional', href: '/operator/settings',
      detail: operator.cancellation_policy ? 'Your own policy applies.' : 'The platform default applies until you set your own.' },
  ];

  return {
    deals: { ...inbound!, submitted: quotes!.submitted, accepted: quotes!.accepted, wonCents: Number(quotes!.won), drafts: drafts!.n },
    fleet: { count: fleet!.count, seats: fleet!.seats, withoutPhotos: fleet!.without_photos, registryFlags: fleet!.flags },
    checklist,
    team: { active: team!.active, emailAlerts: team!.email, smsAlerts: team!.sms },
    settings: {
      profileComplete: profileMissing.length === 0,
      profileMissing,
      payoutsReady: !!operator.stripe_payouts_enabled,
    },
  };
}

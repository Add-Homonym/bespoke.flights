import type { Db } from '@/lib/db';
import type { BookingRequest, SessionPayload } from '@/lib/types';

/**
 * Who may see what on a booking request.
 *
 * - The customer who owns it and admins see everything.
 * - An operator sees a request only while it is still open to quotes, or when
 *   the operator was invited (outreach_log) or has quoted it. Operators never
 *   see each other's quotes, and see the customer's contact details only once
 *   their own quote has been paid for.
 */
/**
 * Until an operator is approved they see what a request is (route, date, passenger
 * count) and nothing a traveler typed: no special requests or notes.
 */
export function withholdTravelerText(operatorStatus: string | null | undefined): boolean {
  return operatorStatus !== 'approved';
}

export interface RequestAccess {
  /** May read the request and its legs. */
  canView: boolean;
  /** May read the customer's name/email/phone. */
  canSeeCustomer: boolean;
  /** May read every quote; otherwise only the operator's own. */
  canSeeAllQuotes: boolean;
  /** The caller's operator id, when the caller is an operator. */
  operatorId: number | null;
}

const NONE: RequestAccess = { canView: false, canSeeCustomer: false, canSeeAllQuotes: false, operatorId: null };

export async function requestAccess(db: Db, session: SessionPayload, request: BookingRequest): Promise<RequestAccess> {
  if (session.role === 'admin') {
    return { canView: true, canSeeCustomer: true, canSeeAllQuotes: true, operatorId: null };
  }
  if (session.role === 'customer') {
    const owner = request.customer_id === session.userId;
    return { canView: owner, canSeeCustomer: owner, canSeeAllQuotes: owner, operatorId: null };
  }

  const operator = await db.one<{ id: number; status: string }>(
    'SELECT id, status FROM operators WHERE user_id = ?', [session.userId]);
  if (!operator || operator.status !== 'approved') return NONE;

  const involvement = await db.one<{ quoted: number; invited: number; won: number }>(`
    SELECT
      (SELECT COUNT(*) FROM quotes WHERE request_id = ? AND operator_id = ?) AS quoted,
      (SELECT COUNT(*) FROM outreach_log WHERE request_id = ? AND operator_id = ?) AS invited,
      (SELECT COUNT(*) FROM quotes WHERE request_id = ? AND operator_id = ? AND status = 'accepted') AS won
  `, [request.id, operator.id, request.id, operator.id, request.id, operator.id]);

  const marketplaceOpen = request.status === 'open' || request.status === 'quoted';
  const involved = Boolean(involvement && (involvement.quoted > 0 || involvement.invited > 0));
  const won = Boolean(involvement && involvement.won > 0);

  return {
    canView: marketplaceOpen || involved,
    canSeeCustomer: won,
    canSeeAllQuotes: false,
    operatorId: operator.id,
  };
}

/**
 * Who may take part in the message thread between a request's traveler and
 * one operator. A thread exists once that operator has quoted (any status).
 * Returns the side the caller speaks for, or null.
 */
export async function threadAccess(
  db: Db, session: SessionPayload, request: BookingRequest, operatorId: number,
): Promise<'customer' | 'operator' | 'admin' | null> {
  const quoted = await db.one('SELECT id FROM quotes WHERE request_id = ? AND operator_id = ? LIMIT 1', [request.id, operatorId]);
  if (!quoted) return null;
  if (session.role === 'admin') return 'admin';
  if (session.role === 'customer') return request.customer_id === session.userId ? 'customer' : null;
  const operator = await db.one<{ id: number; status: string }>('SELECT id, status FROM operators WHERE user_id = ?', [session.userId]);
  return operator && operator.id === operatorId && operator.status === 'approved' ? 'operator' : null;
}

/** Admins and the owning customer may change a request's status. */
export function canManageRequest(session: SessionPayload, request: BookingRequest): boolean {
  return session.role === 'admin' || (session.role === 'customer' && request.customer_id === session.userId);
}

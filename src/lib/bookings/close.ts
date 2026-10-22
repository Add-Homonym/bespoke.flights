/**
 * Cancelling a booking is one state change. Whoever cancels (the traveler,
 * or an admin refunding in full) calls this inside the same transaction as
 * the request's own status update so nothing is left half-open.
 */

import type { Db } from '@/lib/db';

export const TRIP_CANCELLED_REASON = 'trip_cancelled';

export async function closeCancelledBooking(
  tx: Db,
  requestId: number,
  meta: { tier?: 'full' | 'partial' | 'none'; refundCents?: number } = {},
) {
  // The quote that was booked is no longer accepted.
  await tx.run("UPDATE quotes SET status = 'cancelled' WHERE request_id = ? AND status = 'accepted'", [requestId]);
  await tx.run("UPDATE quotes SET status = 'rejected' WHERE request_id = ? AND status = 'pending'", [requestId]);
  // Change requests still open, or accepted but not yet applied, are closed.
  await tx.run(`
    UPDATE change_requests SET status = 'withdrawn', closed_reason = ?, resolved_at = COALESCE(resolved_at, now())
    WHERE request_id = ? AND (status = 'pending' OR (status = 'accepted' AND applied_at IS NULL))
  `, [TRIP_CANCELLED_REASON, requestId]);
  // A price-difference checkout for those changes can no longer be paid.
  await tx.run(`
    UPDATE payments SET status = 'canceled', failure_reason = 'Trip cancelled', updated_at = now()
    WHERE request_id = ? AND change_request_id IS NOT NULL AND status = 'pending'
  `, [requestId]);
  await tx.run(`
    UPDATE booking_requests SET cancelled_at = COALESCE(cancelled_at, now()),
      cancel_tier = COALESCE(cancel_tier, ?), cancel_refund_cents = COALESCE(cancel_refund_cents, ?)
    WHERE id = ?
  `, [meta.tier ?? null, meta.refundCents ?? null, requestId]);
}

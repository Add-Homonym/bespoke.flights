import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { canManageRequest, requestAccess } from '@/lib/access';
import { alertStaff, bookedOperatorId } from '@/lib/staff/alerts';
import { appBaseUrl } from '@/lib/payments/config';
import { notifyRequestWithdrawn } from '@/lib/notify/traveler';
import type { BookingRequest, BookingLeg } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId } = await params;
  const db = getDb();
  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const access = await requestAccess(db, session, request);
  if (!access.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const legs = await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [request.id]);
  const customer = access.canSeeCustomer
    ? await db.one<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [request.customer_id])
    : null;

  return NextResponse.json({ ...request, legs, customer });
}

const patchSchema = z.object({
  status: z.literal('cancelled'),
});

/** Status changes. Cancelling is for the customer who owns the request, or an admin. */
export async function PATCH(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  const db = getDb();
  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canManageRequest(session, request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (request.status === 'cancelled') return NextResponse.json({ success: true, status: 'cancelled' });
  if (request.status === 'completed') {
    return NextResponse.json({ error: 'A completed trip cannot be cancelled' }, { status: 409 });
  }
  if (request.status === 'booked' && session.role !== 'admin') {
    // Paid bookings are cancelled through the refund flow so money moves with the status.
    return NextResponse.json({ error: 'This trip is booked and paid. Cancel it from the trip page to request a refund.' }, { status: 409 });
  }

  const quoting = (await db.query<{ operator_id: number }>(
    "SELECT DISTINCT operator_id FROM quotes WHERE request_id = ? AND status = 'pending'", [request.id])).map(r => r.operator_id);
  await db.run("UPDATE booking_requests SET status = 'cancelled', updated_at = now() WHERE id = ? AND status <> 'cancelled'", [request.id]);
  await db.run("UPDATE quotes SET status = 'rejected' WHERE request_id = ? AND status = 'pending'", [request.id]);

  const baseUrl = appBaseUrl(req);
  // A booked charter was called off: tell the operator's staff.
  const operatorId = request.status === 'booked' ? await bookedOperatorId(db, request.id) : null;
  if (operatorId) await alertStaff(db, { kind: 'cancellation', requestId: request.id, operatorId }, baseUrl);
  // Operators with live quotes learn the request is gone.
  if (quoting.length) await notifyRequestWithdrawn(db, request.id, quoting, baseUrl);

  return NextResponse.json({ success: true, status: 'cancelled' });
}

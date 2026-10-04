import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { alertStaff, bookedOperatorId } from '@/lib/staff/alerts';
import { appBaseUrl } from '@/lib/payments/config';
import type { BookingRequest, BookingLeg } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId } = await params;
  const db = getDb();
  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Customers can only see their own requests
  if (session.role === 'customer' && request.customer_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const legs = await db.query<BookingLeg>('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order', [request.id]);
  const customer = await db.one<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [request.customer_id]);

  return NextResponse.json({ ...request, legs, customer });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId } = await params;
  const body = await req.json();
  const db = getDb();

  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (session.role === 'customer' && request.customer_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.status === 'cancelled' && request.status !== 'cancelled') {
    await db.run("UPDATE booking_requests SET status = 'cancelled', updated_at = now() WHERE id = ?", [request.id]);
    // A booked charter was called off: tell the operator's staff.
    const operatorId = request.status === 'booked' ? await bookedOperatorId(db, request.id) : null;
    if (operatorId) await alertStaff(db, { kind: 'cancellation', requestId: request.id, operatorId }, appBaseUrl(req));
  }

  return NextResponse.json({ success: true });
}

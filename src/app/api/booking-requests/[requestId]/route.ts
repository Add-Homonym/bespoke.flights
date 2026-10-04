import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
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

  // Operators quote through the platform; the customer's identity is shared
  // only after a booking is paid (by email), so it is not exposed here.
  const customer = session.role === 'admin'
    ? await db.one<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [request.customer_id])
    : undefined;

  return NextResponse.json({ ...request, legs, ...(customer ? { customer } : {}) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId } = await params;
  const body = await req.json().catch(() => ({})) as { status?: unknown };
  const db = getDb();

  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only the request's owner or an admin may change it.
  const isOwner = session.role === 'customer' && request.customer_id === session.userId;
  if (!isOwner && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.status !== 'cancelled') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  // A paid booking is unwound through a refund, not by cancelling the request.
  if (!['open', 'quoted'].includes(request.status)) {
    return NextResponse.json({ error: `Request is ${request.status}` }, { status: 409 });
  }

  await db.run(
    "UPDATE booking_requests SET status = 'cancelled', updated_at = now() WHERE id = ? AND status IN ('open', 'quoted')",
    [request.id]
  );

  return NextResponse.json({ success: true });
}

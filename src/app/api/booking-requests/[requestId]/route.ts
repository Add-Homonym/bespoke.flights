import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import type { BookingRequest, BookingLeg } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId } = await params;
  const db = getDb();
  const request = db.prepare('SELECT * FROM booking_requests WHERE id = ?').get(requestId) as BookingRequest | undefined;

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Customers can only see their own requests
  if (session.role === 'customer' && request.customer_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const legs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order').all(request.id) as BookingLeg[];
  const customer = db.prepare('SELECT name, email FROM users WHERE id = ?').get(request.customer_id) as { name: string; email: string };

  return NextResponse.json({ ...request, legs, customer });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId } = await params;
  const body = await req.json();
  const db = getDb();

  const request = db.prepare('SELECT * FROM booking_requests WHERE id = ?').get(requestId) as BookingRequest | undefined;
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (session.role === 'customer' && request.customer_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.status === 'cancelled') {
    db.prepare("UPDATE booking_requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(requestId);
  }

  return NextResponse.json({ success: true });
}

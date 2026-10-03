import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import type { Quote, BookingRequest } from '@/lib/types';

export async function PATCH(req: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { quoteId } = await params;
  const body = await req.json();
  const { status } = body as { status: 'rejected' };

  // Acceptance happens only through payment: POST /api/payments/checkout.
  if (status !== 'rejected') {
    return NextResponse.json({ error: 'Invalid status. Accept a quote by paying for it.' }, { status: 400 });
  }

  const db = getDb();
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as Quote | undefined;
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  const request = db.prepare('SELECT * FROM booking_requests WHERE id = ?').get(quote.request_id) as BookingRequest;
  const isOwner = session.role === 'customer' && request.customer_id === session.userId;
  if (!isOwner && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (quote.status !== 'pending') {
    return NextResponse.json({ error: `Quote is ${quote.status}` }, { status: 409 });
  }

  db.prepare("UPDATE quotes SET status = 'rejected' WHERE id = ?").run(quoteId);

  return NextResponse.json({ success: true });
}

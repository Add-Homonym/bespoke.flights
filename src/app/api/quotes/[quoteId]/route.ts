import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
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
  const quote = await db.one<Quote>('SELECT * FROM quotes WHERE id = ?', [toId(quoteId)]);
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  const request = (await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [quote.request_id]))!;
  const isOwner = session.role === 'customer' && request.customer_id === session.userId;
  if (!isOwner && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (quote.status !== 'pending') {
    return NextResponse.json({ error: `Quote is ${quote.status}` }, { status: 409 });
  }

  await db.run("UPDATE quotes SET status = 'rejected' WHERE id = ? AND status = 'pending'", [quote.id]);

  return NextResponse.json({ success: true });
}

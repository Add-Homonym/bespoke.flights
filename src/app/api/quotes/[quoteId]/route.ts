import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import type { Quote, BookingRequest } from '@/lib/types';

export async function PATCH(req: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { quoteId } = await params;
  const body = await req.json();
  const { status } = body as { status: 'accepted' | 'rejected' };

  if (!['accepted', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const db = getDb();
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as Quote | undefined;
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  const request = db.prepare('SELECT * FROM booking_requests WHERE id = ?').get(quote.request_id) as BookingRequest;
  if (session.role === 'customer' && request.customer_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (status === 'accepted') {
    const transaction = db.transaction(() => {
      // Accept this quote
      db.prepare("UPDATE quotes SET status = 'accepted' WHERE id = ?").run(quoteId);
      // Reject all other quotes for this request
      db.prepare("UPDATE quotes SET status = 'rejected' WHERE request_id = ? AND id != ?").run(quote.request_id, quoteId);
      // Mark request as booked
      db.prepare("UPDATE booking_requests SET status = 'booked', updated_at = datetime('now') WHERE id = ?").run(quote.request_id);
    });
    transaction();
  } else {
    db.prepare("UPDATE quotes SET status = 'rejected' WHERE id = ?").run(quoteId);
  }

  return NextResponse.json({ success: true });
}

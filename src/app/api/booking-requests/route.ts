import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { bookingRequestSchema } from '@/lib/validations';
import { createBookingRequest } from '@/lib/bookings/create';
import { DRAFT_COOKIE } from '@/lib/bookings/draft';
import { legsByRequest } from '@/lib/db/queries';
import type { BookingRequest } from '@/lib/types';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'customer') return NextResponse.json({ error: 'Only customers can create requests' }, { status: 403 });

  const body = await req.json();
  const parsed = bookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { id, outreach } = await createBookingRequest(getDb(), session.userId, parsed.data);

  // The itinerary is submitted; the browser no longer needs its draft.
  (await cookies()).delete(DRAFT_COOKIE);

  return NextResponse.json({
    id,
    outreach: {
      operatorsMatched: outreach.matched,
      rfqsDispatched: outreach.dispatched,
    },
  }, { status: 201 });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  let requests: BookingRequest[];

  if (session.role === 'admin') {
    requests = await db.query<BookingRequest>('SELECT * FROM booking_requests ORDER BY created_at DESC');
  } else if (session.role === 'customer') {
    requests = await db.query<BookingRequest>('SELECT * FROM booking_requests WHERE customer_id = ? ORDER BY created_at DESC', [session.userId]);
  } else {
    requests = await db.query<BookingRequest>("SELECT * FROM booking_requests WHERE status IN ('open', 'quoted') ORDER BY created_at DESC");
  }

  const legs = await legsByRequest(db, requests.map(r => r.id));
  const result = requests.map(r => ({ ...r, legs: legs.get(r.id) ?? [] }));

  return NextResponse.json(result);
}

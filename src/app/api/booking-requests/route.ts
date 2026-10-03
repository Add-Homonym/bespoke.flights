import { NextResponse, after } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { bookingRequestSchema } from '@/lib/validations';
import { dispatchOutreach } from '@/lib/outreach/engine';
import { legsByRequest } from '@/lib/db/queries';
import type { BookingRequest, BookingLeg } from '@/lib/types';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'customer') return NextResponse.json({ error: 'Only customers can create requests' }, { status: 403 });

  const body = await req.json();
  const parsed = bookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { passengerCount, notes, legs } = parsed.data;
  const db = getDb();

  const savedLegs: BookingLeg[] = [];

  const requestId = await db.transaction(async tx => {
    const { id: requestId } = (await tx.one<{ id: number }>(
      'INSERT INTO booking_requests (customer_id, passenger_count, notes) VALUES (?, ?, ?) RETURNING id',
      [session.userId, passengerCount, notes || null]
    ))!;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      await tx.run(
        'INSERT INTO booking_legs (request_id, leg_order, origin_code, origin_name, dest_code, dest_name, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          requestId, i + 1,
          leg.originCode, leg.originName || null,
          leg.destCode, leg.destName || null,
          leg.departureDate, leg.departureTime || null,
        ]
      );
      savedLegs.push({
        id: 0, request_id: requestId, leg_order: i + 1,
        origin_code: leg.originCode, origin_name: leg.originName || null,
        dest_code: leg.destCode, dest_name: leg.destName || null,
        departure_date: leg.departureDate, departure_time: leg.departureTime || null,
      });
    }

    return requestId;
  });

  // ── AUTOMATIC OUTREACH ──
  // Matches approved operators by market/fleet/safety, logs RFQs,
  // and delivers via Resend (email) or SMS stub.
  let outreach = { matched: 0, dispatched: 0 };
  try {
    const result = await dispatchOutreach(db, requestId, savedLegs, passengerCount, notes || null);
    outreach = result;
    // Keep the function alive until RFQ emails finish sending.
    after(() => result.deliveries);
  } catch (err) {
    console.error('Outreach dispatch error:', err);
    // Non-fatal: the request is still created even if outreach fails
  }

  return NextResponse.json({
    id: requestId,
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

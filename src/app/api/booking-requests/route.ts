import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { bookingRequestSchema } from '@/lib/validations';
import { dispatchOutreach } from '@/lib/outreach/engine';
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

  const insertRequest = db.prepare(
    'INSERT INTO booking_requests (customer_id, passenger_count, notes) VALUES (?, ?, ?)'
  );
  const insertLeg = db.prepare(
    'INSERT INTO booking_legs (request_id, leg_order, origin_code, origin_name, dest_code, dest_name, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  let requestId: number;
  const savedLegs: BookingLeg[] = [];

  const transaction = db.transaction(() => {
    const result = insertRequest.run(session.userId, passengerCount, notes || null);
    requestId = Number(result.lastInsertRowid);

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      insertLeg.run(
        requestId, i + 1,
        leg.originCode, leg.originName || null,
        leg.destCode, leg.destName || null,
        leg.departureDate, leg.departureTime || null
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

  requestId = transaction();

  // ── AUTOMATIC OUTREACH ──
  // Matches approved operators by market/fleet/safety, logs RFQs,
  // and delivers via Resend (email) or SMS stub.
  let outreach = { matched: 0, dispatched: 0 };
  try {
    outreach = await dispatchOutreach(db, requestId!, savedLegs, passengerCount, notes || null);
  } catch (err) {
    console.error('Outreach dispatch error:', err);
    // Non-fatal: the request is still created even if outreach fails
  }

  return NextResponse.json({
    id: requestId!,
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
    requests = db.prepare('SELECT * FROM booking_requests ORDER BY created_at DESC').all() as BookingRequest[];
  } else if (session.role === 'customer') {
    requests = db.prepare('SELECT * FROM booking_requests WHERE customer_id = ? ORDER BY created_at DESC').all(session.userId) as BookingRequest[];
  } else {
    requests = db.prepare("SELECT * FROM booking_requests WHERE status IN ('open', 'quoted') ORDER BY created_at DESC").all() as BookingRequest[];
  }

  const getLegs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order');
  const result = requests.map(r => ({
    ...r,
    legs: getLegs.all(r.id) as BookingLeg[],
  }));

  return NextResponse.json(result);
}

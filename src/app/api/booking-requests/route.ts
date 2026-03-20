import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { bookingRequestSchema } from '@/lib/validations';
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

  const transaction = db.transaction(() => {
    const result = insertRequest.run(session.userId, passengerCount, notes || null);
    const requestId = Number(result.lastInsertRowid);

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      insertLeg.run(requestId, i + 1, leg.originCode, leg.originName || null, leg.destCode, leg.destName || null, leg.departureDate, leg.departureTime || null);
    }

    return requestId;
  });

  const requestId = transaction();
  return NextResponse.json({ id: requestId }, { status: 201 });
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
    // Operators see open requests
    requests = db.prepare("SELECT * FROM booking_requests WHERE status IN ('open', 'quoted') ORDER BY created_at DESC").all() as BookingRequest[];
  }

  // Attach legs to each request
  const getLegs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order');
  const result = requests.map(r => ({
    ...r,
    legs: getLegs.all(r.id) as BookingLeg[],
  }));

  return NextResponse.json(result);
}

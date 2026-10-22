import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { requestAccess } from '@/lib/access';
import { appBaseUrl } from '@/lib/payments/config';
import { ChangeError, listChangeRequests, proposeChange, proposeChangeSchema, proposedLegs } from '@/lib/bookings/changes';
import type { BookingRequest } from '@/lib/types';

/** Change requests on a booking: the owner, admins, and operators involved in the request. */
export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { requestId } = await params;
  const db = getDb();
  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const access = await requestAccess(db, session, request);
  if (!access.canView || (access.operatorId && !access.canSeeCustomer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const rows = await listChangeRequests(db, request.id);
  return NextResponse.json(rows.map(cr => ({ ...cr, proposed_legs: proposedLegs(cr) })));
}

/** The owning traveler proposes a change to a booked trip. */
export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'customer') return NextResponse.json({ error: 'Only the traveler can propose a change' }, { status: 403 });

  const { requestId } = await params;
  const parsed = proposeChangeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationResponse(parsed.error);

  const db = getDb();
  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (request.customer_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const cr = await proposeChange(db, request, session.userId, parsed.data, appBaseUrl(req));
    return NextResponse.json({ ...cr, proposed_legs: proposedLegs(cr) }, { status: 201 });
  } catch (err) {
    if (err instanceof ChangeError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

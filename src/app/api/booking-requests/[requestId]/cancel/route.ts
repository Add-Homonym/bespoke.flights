import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { canManageRequest } from '@/lib/access';
import { cancelPaidBooking, previewCancellation } from '@/lib/bookings/cancellation';
import { appBaseUrl } from '@/lib/payments/config';
import { PaymentError } from '@/lib/payments/service';
import type { Db } from '@/lib/db';
import type { BookingRequest, SessionPayload } from '@/lib/types';

type Loaded =
  | { error: NextResponse; session?: undefined; db?: undefined; request?: undefined }
  | { error?: undefined; session: SessionPayload; db: Db; request: BookingRequest };

async function load(requestId: string): Promise<Loaded> {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = getDb();
  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canManageRequest(session, request)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session, db, request };
}

/** Preview: what cancelling now would refund. */
export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const ctx = await load(requestId);
  if (ctx.error) return ctx.error;
  if (ctx.request.status !== 'booked') {
    return NextResponse.json({ error: `Request is ${ctx.request.status}` }, { status: 409 });
  }
  const preview = await previewCancellation(ctx.db, ctx.request);
  if (!preview) return NextResponse.json({ error: 'No paid booking to cancel' }, { status: 409 });
  return NextResponse.json(preview);
}

/** Cancel a paid booking and refund per the operator's policy. */
export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const ctx = await load(requestId);
  if (ctx.error) return ctx.error;
  const { request, db, session } = ctx;

  if (request.status === 'cancelled') return NextResponse.json({ status: 'cancelled', refundCents: 0 });
  if (request.status !== 'booked') {
    return NextResponse.json({ error: `A ${request.status} request is not a paid booking. Use PATCH to cancel an unpaid request.` }, { status: 409 });
  }

  try {
    const result = await cancelPaidBooking(db, request, { initiatedBy: session.userId, baseUrl: appBaseUrl(req) });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

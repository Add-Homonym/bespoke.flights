import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { requestAccess } from '@/lib/access';
import { emptyLegsForRequest } from '@/lib/empty-legs/service';
import type { BookingRequest } from '@/lib/types';

/** Listed empty legs that fit this request (traveler, admin, or an operator who may see the request: only its own listings). */
export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { requestId } = await params;
  const db = getDb();
  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const access = await requestAccess(db, session, request);
  if (!access.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const legs = await emptyLegsForRequest(db, request.id);
  return NextResponse.json(access.operatorId ? legs.filter(l => l.operator_id === access.operatorId) : legs);
}

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { quoteSchema } from '@/lib/validations';
import { requestAccess } from '@/lib/access';
import { appBaseUrl } from '@/lib/payments/config';
import { QuoteError, submitQuote } from '@/lib/quotes/submit';
import type { Quote, Operator, BookingRequest } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId } = await params;
  const db = getDb();

  const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const access = await requestAccess(db, session, request);
  if (!access.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Operators see only their own quote; the customer and admins see every quote.
  const own = !access.canSeeAllQuotes;
  const quotes = await db.query<Quote & { company_name: string; aircraft_type?: string; aircraft_capacity?: number; tail_number?: string }>(`
    SELECT q.*, o.company_name, a.type as aircraft_type, a.capacity as aircraft_capacity, a.tail_number
    FROM quotes q
    JOIN operators o ON o.id = q.operator_id
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE q.request_id = ? ${own ? 'AND q.operator_id = ?' : ''}
    ORDER BY q.created_at DESC
  `, own ? [request.id, access.operatorId] : [request.id]);

  return NextResponse.json(quotes);
}

export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'operator') return NextResponse.json({ error: 'Only operators can submit quotes' }, { status: 403 });

  const { requestId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const db = getDb();
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
  if (!operator) return NextResponse.json({ error: 'Operator profile not found' }, { status: 404 });

  const { priceCents, currency, message, aircraftId, validUntil, worksheet } = parsed.data;
  try {
    const quoteId = await submitQuote(db, operator, {
      requestId: toId(requestId), priceCents, currency, message, aircraftId, validUntil, worksheet, source: 'app', submittedBy: session.userId,
    }, appBaseUrl(req));
    return NextResponse.json({ id: quoteId }, { status: 201 });
  } catch (err) {
    if (err instanceof QuoteError) {
      return NextResponse.json({ error: err.field ? { [err.field]: [err.message] } : err.message }, { status: err.status });
    }
    throw err;
  }
}

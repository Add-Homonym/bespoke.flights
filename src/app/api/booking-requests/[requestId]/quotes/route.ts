import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { quoteSchema } from '@/lib/validations';
import { requestAccess } from '@/lib/access';
import { appBaseUrl } from '@/lib/payments/config';
import { notifyNewQuote } from '@/lib/notify/traveler';
import { saveWorksheet } from '@/lib/quotes/worksheet-store';
import { learnFromQuote } from '@/lib/quotes/learning';
import { refreshDrafts } from '@/lib/quotes/autopilot';
import type { Quote, Operator, BookingRequest } from '@/lib/types';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

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
  if (operator.status !== 'approved') return NextResponse.json({ error: 'Operator not approved' }, { status: 403 });

  const request = await db.one<{ id: number; status: string }>('SELECT id, status FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (request.status !== 'open' && request.status !== 'quoted') {
    return NextResponse.json({ error: `This request is ${request.status} and no longer accepts quotes` }, { status: 409 });
  }

  const { priceCents, currency, message, aircraftId, validUntil, worksheet } = parsed.data;

  if (aircraftId) {
    const owned = await db.one('SELECT id FROM aircraft WHERE id = ? AND operator_id = ?', [aircraftId, operator.id]);
    if (!owned) return NextResponse.json({ error: { aircraftId: ['Aircraft not in your fleet'] } }, { status: 400 });
  }

  // Check for existing quote (the unique index on (request_id, operator_id) backs this up).
  const existingQuote = await db.one(
    "SELECT id FROM quotes WHERE request_id = ? AND operator_id = ? AND status IN ('pending','accepted')", [request.id, operator.id]);
  if (existingQuote) return NextResponse.json({ error: 'You have already quoted this request' }, { status: 409 });

  let quoteId: number;
  try {
    quoteId = await db.transaction(async tx => {
    // Insert quote
    const { id } = (await tx.one<{ id: number }>(
      'INSERT INTO quotes (request_id, operator_id, aircraft_id, price_cents, currency, message, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [request.id, operator.id, aircraftId || null, priceCents, currency, message || null, validUntil || null]
    ))!;

    // Update request status to 'quoted' if it was 'open'
    await tx.run("UPDATE booking_requests SET status = 'quoted', updated_at = now() WHERE id = ? AND status = 'open'", [request.id]);

    // Mark outreach log as responded (if this operator was auto-matched)
    await tx.run(
      "UPDATE outreach_log SET status = 'responded', responded_at = now() WHERE request_id = ? AND operator_id = ?",
      [request.id, operator.id]
    );

    // Private working for the price; never returned to the traveler.
    if (worksheet) await saveWorksheet(tx, id, operator.id, worksheet);

    // An Autopilot draft for this request has now been reviewed and sent.
    await tx.run(
      "UPDATE quote_drafts SET status = 'submitted', quote_id = ?, reviewed_by = ?, reviewed_at = now() WHERE request_id = ? AND operator_id = ? AND status = 'draft'",
      [id, session.userId, request.id, operator.id]);

    return id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: 'You have already quoted this request' }, { status: 409 });
    throw err;
  }

  // Every submitted worksheet teaches Autopilot how this operator prices.
  if (worksheet) {
    await learnFromQuote(db, operator.id, { ...worksheet, aircraftId: worksheet.aircraftId ?? aircraftId ?? null }, priceCents);
    await refreshDrafts(db, operator.id).catch(err => console.error('Autopilot redraft failed:', err));
  }

  await notifyNewQuote(db, quoteId, appBaseUrl(req));

  return NextResponse.json({ id: quoteId }, { status: 201 });
}

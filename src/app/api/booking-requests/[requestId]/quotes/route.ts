import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { quoteSchema } from '@/lib/validations';
import type { Quote, Operator } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId } = await params;
  const db = getDb();

  const quotes = await db.query<Quote & { company_name: string; aircraft_type?: string; aircraft_capacity?: number; tail_number?: string }>(`
    SELECT q.*, o.company_name, a.type as aircraft_type, a.capacity as aircraft_capacity, a.tail_number
    FROM quotes q
    JOIN operators o ON o.id = q.operator_id
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE q.request_id = ?
    ORDER BY q.created_at DESC
  `, [toId(requestId)]);

  return NextResponse.json(quotes);
}

export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'operator') return NextResponse.json({ error: 'Only operators can submit quotes' }, { status: 403 });

  const { requestId } = await params;
  const body = await req.json();
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const db = getDb();
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
  if (!operator) return NextResponse.json({ error: 'Operator profile not found' }, { status: 404 });
  if (operator.status !== 'approved') return NextResponse.json({ error: 'Operator not approved' }, { status: 403 });

  const request = await db.one<{ id: number }>('SELECT id FROM booking_requests WHERE id = ?', [toId(requestId)]);
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  // Check for existing quote
  const existingQuote = await db.one('SELECT id FROM quotes WHERE request_id = ? AND operator_id = ?', [request.id, operator.id]);
  if (existingQuote) return NextResponse.json({ error: 'You have already quoted this request' }, { status: 409 });

  const { priceCents, currency, message, aircraftId, validUntil } = parsed.data;

  const quoteId = await db.transaction(async tx => {
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

    return id;
  });

  return NextResponse.json({ id: quoteId }, { status: 201 });
}

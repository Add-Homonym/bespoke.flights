import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { quoteSchema } from '@/lib/validations';
import type { Quote, Operator } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { requestId } = await params;
  const db = getDb();

  const quotes = db.prepare(`
    SELECT q.*, o.company_name, a.type as aircraft_type, a.capacity as aircraft_capacity, a.tail_number
    FROM quotes q
    JOIN operators o ON o.id = q.operator_id
    LEFT JOIN aircraft a ON a.id = q.aircraft_id
    WHERE q.request_id = ?
    ORDER BY q.created_at DESC
  `).all(requestId) as (Quote & { company_name: string; aircraft_type?: string; aircraft_capacity?: number; tail_number?: string })[];

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
  const operator = db.prepare('SELECT * FROM operators WHERE user_id = ?').get(session.userId) as Operator | undefined;
  if (!operator) return NextResponse.json({ error: 'Operator profile not found' }, { status: 404 });
  if (operator.status !== 'approved') return NextResponse.json({ error: 'Operator not approved' }, { status: 403 });

  const request = db.prepare('SELECT * FROM booking_requests WHERE id = ?').get(requestId);
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  const { priceCents, currency, message, aircraftId, validUntil } = parsed.data;

  const result = db.prepare(
    'INSERT INTO quotes (request_id, operator_id, aircraft_id, price_cents, currency, message, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(requestId, operator.id, aircraftId || null, priceCents, currency, message || null, validUntil || null);

  // Update request status to 'quoted' if it was 'open'
  db.prepare("UPDATE booking_requests SET status = 'quoted', updated_at = datetime('now') WHERE id = ? AND status = 'open'").run(requestId);

  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

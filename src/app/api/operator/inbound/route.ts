import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import type { Operator } from '@/lib/types';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'operator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const operator = db.prepare('SELECT * FROM operators WHERE user_id = ?').get(session.userId) as Operator | undefined;
  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });

  // Get all outreach logs for this operator, joined with request and leg data
  const inbound = db.prepare(`
    SELECT
      ol.id as outreach_id,
      ol.request_id,
      ol.match_score,
      ol.rfq_subject,
      ol.rfq_body,
      ol.status as outreach_status,
      ol.sent_at,
      ol.responded_at,
      br.passenger_count,
      br.notes as request_notes,
      br.status as request_status,
      br.created_at as request_created_at,
      q.id as quote_id,
      q.price_cents as quote_price,
      q.status as quote_status
    FROM outreach_log ol
    JOIN booking_requests br ON br.id = ol.request_id
    LEFT JOIN quotes q ON q.request_id = ol.request_id AND q.operator_id = ol.operator_id
    WHERE ol.operator_id = ?
    ORDER BY ol.sent_at DESC
  `).all(operator.id) as Array<{
    outreach_id: number;
    request_id: number;
    match_score: number;
    rfq_subject: string;
    rfq_body: string;
    outreach_status: string;
    sent_at: string;
    responded_at: string | null;
    passenger_count: number;
    request_notes: string | null;
    request_status: string;
    request_created_at: string;
    quote_id: number | null;
    quote_price: number | null;
    quote_status: string | null;
  }>;

  // Attach legs to each
  const getLegs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order');

  const result = inbound.map(item => ({
    ...item,
    legs: getLegs.all(item.request_id),
  }));

  return NextResponse.json(result);
}

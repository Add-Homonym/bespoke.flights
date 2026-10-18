import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { legsByRequest } from '@/lib/db/queries';
import { parseAutopilot, type QuoteDraftRow } from '@/lib/quotes/autopilot';
import type { Operator } from '@/lib/types';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'operator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });

  // Get all outreach logs for this operator, joined with request and leg data
  const inbound = await db.query<{
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
  }>(`
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
  `, [operator.id]);

  // Attach legs to each
  const legs = await legsByRequest(db, inbound.map(i => i.request_id));
  // Autopilot drafts waiting for review.
  const drafts = new Map((await db.query<QuoteDraftRow>(
    "SELECT * FROM quote_drafts WHERE operator_id = ? AND status = 'draft'", [operator.id])).map(d => [d.request_id, d]));
  const result = inbound.map(item => {
    const d = drafts.get(item.request_id);
    return {
      ...item,
      legs: legs.get(item.request_id) ?? [],
      draft: d && !item.quote_id ? {
        id: d.id, aircraftId: d.aircraft_id, priceCents: Number(d.price_cents), message: d.message,
        validUntil: d.valid_until, worksheet: JSON.parse(d.worksheet), flags: JSON.parse(d.flags),
        notes: JSON.parse(d.notes ?? '[]'), createdAt: d.created_at,
      } : null,
    };
  });

  return NextResponse.json(result, { headers: { 'X-Autopilot': parseAutopilot(operator.autopilot).enabled ? 'on' : 'off' } });
}

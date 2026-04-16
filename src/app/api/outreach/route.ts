import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get('requestId');

  const db = getDb();

  if (requestId) {
    // Get outreach for a specific request
    const logs = db.prepare(`
      SELECT ol.*, o.company_name, o.contact_method, o.contact_email, o.contact_phone,
             q.id as quote_id, q.price_cents as quote_price, q.status as quote_status
      FROM outreach_log ol
      JOIN operators o ON o.id = ol.operator_id
      LEFT JOIN quotes q ON q.request_id = ol.request_id AND q.operator_id = ol.operator_id
      WHERE ol.request_id = ?
      ORDER BY ol.match_score DESC
    `).all(requestId);
    return NextResponse.json(logs);
  }

  // Get recent outreach activity (admin or customer's own)
  const logs = db.prepare(`
    SELECT ol.*, o.company_name, br.status as request_status
    FROM outreach_log ol
    JOIN operators o ON o.id = ol.operator_id
    JOIN booking_requests br ON br.id = ol.request_id
    ${session.role === 'customer' ? 'WHERE br.customer_id = ?' : ''}
    ORDER BY ol.sent_at DESC
    LIMIT 50
  `).all(session.role === 'customer' ? session.userId : undefined);

  return NextResponse.json(logs);
}

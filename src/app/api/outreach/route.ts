import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import type { BookingRequest } from '@/lib/types';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get('requestId');

  const db = getDb();

  // Operators have their own view at /api/operator/inbound.
  if (session.role !== 'customer' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Operator contact details are internal; customers only see who was asked and what came back.
  const contactColumns = session.role === 'admin' ? 'o.contact_email, o.contact_phone,' : '';

  if (requestId) {
    const request = await db.one<BookingRequest>('SELECT id, customer_id FROM booking_requests WHERE id = ?', [toId(requestId)]);
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (session.role === 'customer' && request.customer_id !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const logs = await db.query(`
      SELECT ol.*, o.company_name, o.contact_method, ${contactColumns}
             q.id as quote_id, q.price_cents as quote_price, q.status as quote_status
      FROM outreach_log ol
      JOIN operators o ON o.id = ol.operator_id
      LEFT JOIN quotes q ON q.request_id = ol.request_id AND q.operator_id = ol.operator_id
      WHERE ol.request_id = ?
      ORDER BY ol.match_score DESC
    `, [request.id]);
    return NextResponse.json(logs);
  }

  // Recent outreach activity: all of it for admins, the customer's own otherwise.
  const logs = await db.query(`
    SELECT ol.*, o.company_name, br.status as request_status
    FROM outreach_log ol
    JOIN operators o ON o.id = ol.operator_id
    JOIN booking_requests br ON br.id = ol.request_id
    ${session.role === 'customer' ? 'WHERE br.customer_id = ?' : ''}
    ORDER BY ol.sent_at DESC
    LIMIT 50
  `, session.role === 'customer' ? [session.userId] : []);

  return NextResponse.json(logs);
}

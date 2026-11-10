import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { requestAccess } from '@/lib/access';
import type { BookingRequest } from '@/lib/types';

/**
 * Outreach log.
 *
 * ?requestId=  — who was invited to quote a request. The owning customer and
 *                admins see every row; an operator sees only its own row.
 *                Operator contact details are included for admins only.
 * (no params)  — recent activity: admins see everything, customers their own
 *                requests, operators their own invitations.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get('requestId');
  const db = getDb();

  if (requestId) {
    const request = await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [toId(requestId)]);
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const access = await requestAccess(db, session, request);
    if (!access.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const contact = session.role === 'admin' ? 'o.contact_method, o.contact_email, o.contact_phone,' : '';
    const own = access.operatorId != null;
    // A traveler sees who was asked and how it stands: no score, channel, RFQ text or reply token.
    const columns = session.role === 'customer'
      ? 'ol.id, ol.request_id, ol.operator_id, ol.status, ol.sent_at, ol.responded_at,'
      : 'ol.*,';
    const logs = await db.query(`
      SELECT ${columns} o.company_name, ${contact}
             q.id as quote_id, q.price_cents as quote_price, q.status as quote_status
      FROM outreach_log ol
      JOIN operators o ON o.id = ol.operator_id
      LEFT JOIN quotes q ON q.request_id = ol.request_id AND q.operator_id = ol.operator_id
      WHERE ol.request_id = ? ${own ? 'AND ol.operator_id = ?' : ''}
      ORDER BY ${session.role === 'customer' ? 'ol.sent_at' : 'ol.match_score DESC'}
    `, own ? [request.id, access.operatorId] : [request.id]);
    return NextResponse.json(logs);
  }

  let where = '';
  let params: unknown[] = [];
  if (session.role === 'customer') {
    where = 'WHERE br.customer_id = ?';
    params = [session.userId];
  } else if (session.role === 'operator') {
    where = 'WHERE o.user_id = ?';
    params = [session.userId];
  }

  const logs = await db.query(`
    SELECT ${session.role === 'customer' ? 'ol.id, ol.request_id, ol.operator_id, ol.status, ol.sent_at, ol.responded_at,' : 'ol.*,'} o.company_name, br.status as request_status
    FROM outreach_log ol
    JOIN operators o ON o.id = ol.operator_id
    JOIN booking_requests br ON br.id = ol.request_id
    ${where}
    ORDER BY ol.sent_at DESC
    LIMIT 50
  `, params);

  return NextResponse.json(logs);
}

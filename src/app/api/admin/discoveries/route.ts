/**
 * Admin API: Discovered Operators
 *
 * GET  /api/admin/discoveries          — List all discovered operators (filterable)
 * PATCH /api/admin/discoveries         — Update a discovered operator (add email, change status, etc.)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');  // new, no_email, emailed, registered, opted_out, bounced
  const state = searchParams.get('state');
  const search = searchParams.get('q');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  const db = getDb();

  let where = 'WHERE 1=1';
  const params: (string | number)[] = [];

  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }
  if (state) {
    where += ' AND state = ?';
    params.push(state.toUpperCase());
  }
  if (search) {
    where += ' AND (company_name LIKE ? OR dba_name LIKE ? OR certificate_number LIKE ?)';
    const term = '%' + search + '%';
    params.push(term, term, term);
  }

  const total = (db.prepare(
    `SELECT COUNT(*) as count FROM discovered_operators ${where}`
  ).get(...params) as { count: number }).count;

  const rows = db.prepare(
    `SELECT * FROM discovered_operators ${where} ORDER BY discovered_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  // Summary stats
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
      SUM(CASE WHEN status = 'no_email' THEN 1 ELSE 0 END) as no_email_count,
      SUM(CASE WHEN status = 'emailed' THEN 1 ELSE 0 END) as emailed_count,
      SUM(CASE WHEN status = 'registered' THEN 1 ELSE 0 END) as registered_count,
      SUM(CASE WHEN status = 'opted_out' THEN 1 ELSE 0 END) as opted_out_count,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced_count
    FROM discovered_operators
  `).get();

  return NextResponse.json({
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    stats,
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { id, contact_email, phone, status, notes } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const db = getDb();

  const existing = db.prepare('SELECT * FROM discovered_operators WHERE id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // If adding an email to a no_email operator, upgrade status to 'new' so it gets emailed
  let newStatus = status;
  if (contact_email && !status) {
    const current = (existing as { status: string }).status;
    if (current === 'no_email') {
      newStatus = 'new';
    }
  }

  db.prepare(`
    UPDATE discovered_operators SET
      contact_email = COALESCE(?, contact_email),
      phone = COALESCE(?, phone),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    contact_email || null,
    phone || null,
    newStatus || null,
    notes || null,
    id,
  );

  const updated = db.prepare('SELECT * FROM discovered_operators WHERE id = ?').get(id);
  return NextResponse.json(updated);
}

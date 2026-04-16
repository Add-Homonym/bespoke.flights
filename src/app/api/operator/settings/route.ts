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

  const user = db.prepare('SELECT email, phone FROM users WHERE id = ?').get(session.userId) as { email: string; phone: string | null };

  return NextResponse.json({
    ...operator,
    fleet_types: operator.fleet_types ? JSON.parse(operator.fleet_types) : [],
    markets: operator.markets ? JSON.parse(operator.markets) : [],
    user_email: user.email,
    user_phone: user.phone,
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'operator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const db = getDb();

  const operator = db.prepare('SELECT * FROM operators WHERE user_id = ?').get(session.userId) as Operator | undefined;
  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });

  const {
    contact_method,
    contact_email,
    contact_phone,
    safety_rating,
    fleet_types,
    markets,
    range_max_nm,
    hi_capable,
    transoceanic,
    certificate,
    notes,
  } = body;

  db.prepare(`
    UPDATE operators SET
      contact_method = COALESCE(?, contact_method),
      contact_email = COALESCE(?, contact_email),
      contact_phone = COALESCE(?, contact_phone),
      safety_rating = COALESCE(?, safety_rating),
      fleet_types = COALESCE(?, fleet_types),
      markets = COALESCE(?, markets),
      range_max_nm = COALESCE(?, range_max_nm),
      hi_capable = COALESCE(?, hi_capable),
      transoceanic = COALESCE(?, transoceanic),
      certificate = COALESCE(?, certificate),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(
    contact_method || null,
    contact_email || null,
    contact_phone || null,
    safety_rating || null,
    fleet_types ? JSON.stringify(fleet_types) : null,
    markets ? JSON.stringify(markets) : null,
    range_max_nm ?? null,
    hi_capable ?? null,
    transoceanic ?? null,
    certificate || null,
    notes || null,
    operator.id,
  );

  const updated = db.prepare('SELECT * FROM operators WHERE id = ?').get(operator.id) as Operator;
  return NextResponse.json({
    ...updated,
    fleet_types: updated.fleet_types ? JSON.parse(updated.fleet_types) : [],
    markets: updated.markets ? JSON.parse(updated.markets) : [],
  });
}

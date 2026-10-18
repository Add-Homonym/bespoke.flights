import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { operatorSettingsSchema } from '@/lib/validations';
import { parsePolicy } from '@/lib/bookings/cancellation';
import type { Operator } from '@/lib/types';

function present(operator: Operator & { cancellation_policy?: string | null }) {
  return {
    ...operator,
    fleet_types: operator.fleet_types ? JSON.parse(operator.fleet_types) : [],
    markets: operator.markets ? JSON.parse(operator.markets) : [],
    cancellation_policy: parsePolicy(operator.cancellation_policy),
    cancellation_policy_custom: !!operator.cancellation_policy,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'operator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });

  const user = (await db.one<{ email: string; phone: string | null }>('SELECT email, phone FROM users WHERE id = ?', [session.userId]))!;

  return NextResponse.json({
    ...present(operator),
    user_email: user.email,
    user_phone: user.phone,
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'operator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = operatorSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const db = getDb();

  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
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
    cancellation_policy,
  } = parsed.data;

  await db.run(`
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
      notes = COALESCE(?, notes),
      cancellation_policy = COALESCE(?, cancellation_policy)
    WHERE id = ?
  `, [
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
    cancellation_policy ? JSON.stringify(cancellation_policy) : null,
    operator.id,
  ]);

  const updated = (await db.one<Operator>('SELECT * FROM operators WHERE id = ?', [operator.id]))!;
  return NextResponse.json(present(updated));
}

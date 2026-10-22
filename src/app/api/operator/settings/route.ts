import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { operatorSettingsSchema } from '@/lib/validations';
import { parsePolicy } from '@/lib/bookings/cancellation';
import { draftQuote, parseAutopilot } from '@/lib/quotes/autopilot';
import { loadLearned } from '@/lib/quotes/learning';
import type { Operator } from '@/lib/types';

function present(operator: Operator & { cancellation_policy?: string | null }) {
  return {
    ...operator,
    fleet_types: operator.fleet_types ? JSON.parse(operator.fleet_types) : [],
    markets: operator.markets ? JSON.parse(operator.markets) : [],
    cancellation_policy: parsePolicy(operator.cancellation_policy),
    cancellation_policy_custom: !!operator.cancellation_policy,
    autopilot: parseAutopilot(operator.autopilot),
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
    autopilot_learned: await loadLearned(db, operator.id),
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
    return validationResponse(parsed.error);
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
    autopilot,
  } = parsed.data;

  // Certificate and safety rating are what admins checked at approval and what
  // travelers see next to every quote; after approval only an admin changes them.
  if (operator.status === 'approved') {
    const locked: Record<string, string[]> = {};
    if (certificate && certificate !== operator.certificate) locked.certificate = ['Contact bespoke.flights to change your certificate after approval.'];
    if (safety_rating && safety_rating !== operator.safety_rating) locked.safety_rating = ['Contact bespoke.flights to change your safety rating after approval.'];
    if (Object.keys(locked).length) {
      return NextResponse.json({ error: 'Check the highlighted fields.', fieldErrors: locked }, { status: 400 });
    }
  }

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
      cancellation_policy = COALESCE(?, cancellation_policy),
      autopilot = COALESCE(?, autopilot)
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
    autopilot ? JSON.stringify(autopilot) : null,
    operator.id,
  ]);

  // Turning Autopilot on drafts quotes for requests already waiting.
  if (autopilot?.enabled && !parseAutopilot(operator.autopilot).enabled) {
    const waiting = await db.query<{ request_id: number }>(`
      SELECT ol.request_id FROM outreach_log ol JOIN booking_requests br ON br.id = ol.request_id
      WHERE ol.operator_id = ? AND br.status IN ('open','quoted')
        AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = ol.request_id AND q.operator_id = ol.operator_id AND q.status IN ('pending','accepted'))
      ORDER BY ol.sent_at DESC LIMIT 25`, [operator.id]);
    for (const w of waiting) await draftQuote(db, w.request_id, operator.id);
  }

  const updated = (await db.one<Operator>('SELECT * FROM operators WHERE id = ?', [operator.id]))!;
  return NextResponse.json({ ...present(updated), autopilot_learned: await loadLearned(db, operator.id) });
}

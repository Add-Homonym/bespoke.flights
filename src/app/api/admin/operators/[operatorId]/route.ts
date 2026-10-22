import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { adminOperatorPatchSchema } from '@/lib/validations';
import { requireAdmin } from '@/lib/admin/guard';
import type { Operator } from '@/lib/types';

const JSON_FIELDS = new Set(['fleet_types', 'markets']);

/** Edit an operator: status and any company profile field. */
export async function PATCH(req: Request, { params }: { params: Promise<{ operatorId: string }> }) {
  const me = await requireAdmin();
  if ('error' in me) return me.error;

  const parsed = adminOperatorPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationResponse(parsed.error);

  const db = getDb();
  const id = toId((await params).operatorId);
  if (!(await db.one('SELECT id FROM operators WHERE id = ?', [id]))) return NextResponse.json({ error: 'Operator not found' }, { status: 404 });

  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  // Column names come from the schema's keys, never from the request.
  const sets = entries.map(([k]) => `${k} = ?`);
  const values = entries.map(([k, v]) => (JSON_FIELDS.has(k) ? JSON.stringify(v) : v === '' ? null : v));
  await db.run(`UPDATE operators SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);

  return NextResponse.json(await db.one<Operator>('SELECT * FROM operators WHERE id = ?', [id]));
}

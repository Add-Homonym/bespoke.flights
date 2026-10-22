import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getDb } from '@/lib/db';
import { adminCreateOperatorSchema } from '@/lib/validations';
import { adminErrorResponse, requireAdmin } from '@/lib/admin/guard';
import { createAccount } from '@/lib/admin/users';

/** Add an operator: a new operator account and its company profile. */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  const parsed = adminCreateOperatorSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationResponse(parsed.error);
  const d = parsed.data;
  const db = getDb();
  try {
    const result = await createAccount(db, {
      email: d.email, name: d.name, phone: d.phone, role: 'operator', companyName: d.companyName,
      operatorStatus: d.status, password: d.password || null,
    });
    if (d.certificate) await db.run('UPDATE operators SET certificate = ? WHERE id = ?', [d.certificate, result.operatorId]);
    return NextResponse.json({ id: result.operatorId, userId: result.userId, password: result.password },
      { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

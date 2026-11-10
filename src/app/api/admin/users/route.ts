import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getDb } from '@/lib/db';
import { adminCreateUserSchema } from '@/lib/validations';
import { adminErrorResponse, requireAdmin } from '@/lib/admin/guard';
import { createAccount } from '@/lib/admin/users';

export async function GET() {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  const users = await getDb().query(`
    SELECT u.id, u.email, u.phone, u.name, u.role, u.created_at, o.id AS operator_id, o.company_name
    FROM users u LEFT JOIN operators o ON o.user_id = u.id
    ORDER BY u.created_at DESC`);
  return NextResponse.json(users);
}

/** Add a user. Returns the temporary password once; it is not stored in plain text. */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  const parsed = adminCreateUserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationResponse(parsed.error);
  try {
    const result = await createAccount(getDb(), { ...parsed.data, password: parsed.data.password || null });
    return NextResponse.json({ id: result.userId, operatorId: result.operatorId, password: result.password },
      { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

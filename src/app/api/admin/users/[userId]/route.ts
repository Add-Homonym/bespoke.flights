import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { adminUpdateUserSchema } from '@/lib/validations';
import { adminErrorResponse, requireAdmin } from '@/lib/admin/guard';
import { updateAccount } from '@/lib/admin/users';

/** Change a user's name, phone or role. */
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const me = await requireAdmin();
  if ('error' in me) return me.error;
  const parsed = adminUpdateUserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationResponse(parsed.error);
  const db = getDb();
  const userId = toId((await params).userId);
  try {
    await updateAccount(db, me.adminId, userId, parsed.data);
  } catch (err) {
    return adminErrorResponse(err);
  }
  return NextResponse.json(await db.one(`
    SELECT u.id, u.email, u.phone, u.name, u.role, u.created_at, o.id AS operator_id, o.company_name
    FROM users u LEFT JOIN operators o ON o.user_id = u.id WHERE u.id = ?`, [userId]));
}

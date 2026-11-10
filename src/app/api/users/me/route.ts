import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getSession } from '@/lib/auth';
import { neonAuthEnabled } from '@/lib/neon-auth';
import { getDb } from '@/lib/db';
import { profileSchema } from '@/lib/validations';
import type { User } from '@/lib/types';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const user = await db.one<Omit<User, 'password_hash' | 'updated_at'>>('SELECT id, email, phone, name, role, created_at FROM users WHERE id = ?', [session.userId]);

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return validationResponse(parsed.error);
  }

  if (parsed.data.email && neonAuthEnabled()) {
    // The sign-in email lives in Neon Auth; changing only our copy would lock the user out.
    return NextResponse.json({ error: { email: ['Email cannot be changed here'] } }, { status: 400 });
  }

  const db = getDb();
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (parsed.data.name) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.email) { updates.push('email = ?'); values.push(parsed.data.email); }
  if (parsed.data.phone) { updates.push('phone = ?'); values.push(parsed.data.phone); }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  updates.push('updated_at = now()');
  values.push(session.userId);

  try {
    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: { email: ['Email already in use'] } }, { status: 409 });
    }
    throw err;
  }

  const user = await db.one('SELECT id, email, phone, name, role, created_at FROM users WHERE id = ?', [session.userId]);
  return NextResponse.json(user);
}

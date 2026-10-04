import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
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

  const body = await req.json();
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const db = getDb();
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (parsed.data.name) { updates.push('name = ?'); values.push(parsed.data.name); }
  if (parsed.data.email) {
    const taken = await db.one('SELECT id FROM users WHERE email = ? AND id != ?', [parsed.data.email, session.userId]);
    if (taken) return NextResponse.json({ error: { email: ['Email already in use'] } }, { status: 409 });
    updates.push('email = ?'); values.push(parsed.data.email);
  }
  if (parsed.data.phone) { updates.push('phone = ?'); values.push(parsed.data.phone); }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  updates.push('updated_at = now()');
  values.push(session.userId);

  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

  const user = await db.one('SELECT id, email, phone, name, role, created_at FROM users WHERE id = ?', [session.userId]);
  return NextResponse.json(user);
}

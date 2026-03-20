import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { profileSchema } from '@/lib/validations';
import type { User } from '@/lib/types';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const user = db.prepare('SELECT id, email, phone, name, role, created_at FROM users WHERE id = ?').get(session.userId) as Omit<User, 'password_hash' | 'updated_at'> | undefined;

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
  if (parsed.data.email) { updates.push('email = ?'); values.push(parsed.data.email); }
  if (parsed.data.phone) { updates.push('phone = ?'); values.push(parsed.data.phone); }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  updates.push("updated_at = datetime('now')");
  values.push(session.userId);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const user = db.prepare('SELECT id, email, phone, name, role, created_at FROM users WHERE id = ?').get(session.userId);
  return NextResponse.json(user);
}

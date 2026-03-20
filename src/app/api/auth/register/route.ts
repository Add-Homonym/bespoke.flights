import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import { registerSchema } from '@/lib/validations';
import { setSessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { email, phone, password, name, role, companyName } = parsed.data;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return NextResponse.json({ error: { email: ['Email already registered'] } }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const insertUser = db.prepare(
      'INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
    );
    const result = insertUser.run(email, phone || null, passwordHash, name, role);
    const userId = Number(result.lastInsertRowid);

    if (role === 'operator' && companyName) {
      db.prepare('INSERT INTO operators (user_id, company_name) VALUES (?, ?)').run(userId, companyName);
    }

    await setSessionCookie({ userId, role });

    return NextResponse.json({ id: userId, email, name, role }, { status: 201 });
  } catch (err) {
    console.error('Registration error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { registerSchema } from '@/lib/validations';
import { setSessionCookie } from '@/lib/auth';
import { claimBookingDraft } from '@/lib/bookings/create';

export async function POST(req: Request) {
  const limited = rateLimit(`register:${clientIp(req)}`, 5, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, {
      status: 429, headers: { 'Retry-After': String(limited.retryAfter) },
    });
  }

  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { email, phone, password, name, role, companyName } = parsed.data;
    const db = getDb();

    const existing = await db.one('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return NextResponse.json({ error: { email: ['Email already registered'] } }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const userId = await db.transaction(async tx => {
      const { id } = (await tx.one<{ id: number }>(
        'INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?) RETURNING id',
        [email, phone || null, passwordHash, name, role]
      ))!;
      if (role === 'operator' && companyName) {
        await tx.run('INSERT INTO operators (user_id, company_name) VALUES (?, ?)', [id, companyName]);
      }
      return id;
    });

    await setSessionCookie({ userId, role });

    // A traveler who built a trip before signing up: submit it now.
    const requestId = role === 'customer' ? await claimBookingDraft(db, userId) : null;

    return NextResponse.json({
      id: userId, email, name, role,
      redirectTo: requestId ? `/requests/${requestId}?submitted=1` : null,
    }, { status: 201 });
  } catch (err) {
    console.error('Registration error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

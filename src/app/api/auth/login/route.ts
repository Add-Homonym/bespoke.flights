import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { loginSchema } from '@/lib/validations';
import { setSessionCookie } from '@/lib/auth';
import { claimBookingDraft } from '@/lib/bookings/create';
import type { User } from '@/lib/types';

export async function POST(req: Request) {
  const limited = rateLimit(`login:${clientIp(req)}`, 10, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, {
      status: 429, headers: { 'Retry-After': String(limited.retryAfter) },
    });
  }

  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
    }

    const { email, password } = parsed.data;

    // Per-account brake as well, so a distributed guess at one password is slowed.
    const perAccount = rateLimit(`login-account:${email.toLowerCase()}`, 20, 15 * 60 * 1000);
    if (!perAccount.ok) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, {
        status: 429, headers: { 'Retry-After': String(perAccount.retryAfter) },
      });
    }

    const db = getDb();

    const user = await db.one<User>('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await setSessionCookie({ userId: user.id, role: user.role });

    // A traveler who built a trip before signing in: submit it now.
    const requestId = user.role === 'customer' ? await claimBookingDraft(db, user.id) : null;

    return NextResponse.json({
      id: user.id, email: user.email, name: user.name, role: user.role,
      redirectTo: requestId ? `/requests/${requestId}?submitted=1` : null,
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

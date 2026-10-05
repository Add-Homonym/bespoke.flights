import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { loginSchema } from '@/lib/validations';
import { authenticate } from '@/lib/auth';
import { claimBookingDraft } from '@/lib/bookings/create';
import { appBaseUrl } from '@/lib/payments/config';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const db = getDb();

    const user = await authenticate(db, email, password);
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // A traveler who built a trip before signing in: submit it now.
    const requestId = user.role === 'customer' ? await claimBookingDraft(db, user.id, appBaseUrl(req)) : null;

    return NextResponse.json({
      id: user.id, email: user.email, name: user.name, role: user.role,
      redirectTo: requestId ? `/requests/${requestId}?submitted=1` : null,
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

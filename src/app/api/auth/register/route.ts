import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { registerSchema } from '@/lib/validations';
import { registerUser } from '@/lib/auth';
import { claimBookingDraft } from '@/lib/bookings/create';
import { appBaseUrl } from '@/lib/payments/config';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { email, phone, password, name, role, companyName } = parsed.data;
    const db = getDb();

    const userId = await registerUser(db, { email, phone, password, name, role, companyName });
    if (userId === null) {
      return NextResponse.json({ error: { email: ['Email already registered'] } }, { status: 409 });
    }

    // A traveler who built a trip before signing up: submit it now.
    const requestId = role === 'customer' ? await claimBookingDraft(db, userId, appBaseUrl(req)) : null;

    return NextResponse.json({
      id: userId, email, name, role,
      redirectTo: requestId ? `/requests/${requestId}?submitted=1` : null,
    }, { status: 201 });
  } catch (err) {
    console.error('Registration error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

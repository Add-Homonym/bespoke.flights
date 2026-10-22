import { NextResponse } from 'next/server';
import { validationResponse } from '@/lib/api/validation';
import { getDb } from '@/lib/db';
import { registerSchema } from '@/lib/validations';
import { registerUser } from '@/lib/auth';
import { claimBookingDraft } from '@/lib/bookings/create';
import { claimEmptyLegCookie } from '@/lib/empty-legs/service';
import { appBaseUrl } from '@/lib/payments/config';
import { clientIp, rateLimited } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const limited = await rateLimited('auth', clientIp(req));
    if (limited) return limited;
    const body = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return validationResponse(parsed.error);
    }

    const { email, phone, password, name, role, companyName } = parsed.data;
    const db = getDb();

    const userId = await registerUser(db, { email, phone, password, name, role, companyName });
    if (userId === null) {
      return NextResponse.json({ error: 'Check the highlighted fields.', fieldErrors: { email: ['That email is already registered. Sign in instead.'] } }, { status: 409 });
    }

    // A traveler who built a trip before signing up: submit it now.
    const requestId = role === 'customer'
      ? (await claimBookingDraft(db, userId, appBaseUrl(req))) ?? (await claimEmptyLegCookie(db, userId)) : null;

    return NextResponse.json({
      id: userId, email, name, role,
      redirectTo: requestId ? `/requests/${requestId}?submitted=1` : null,
    }, { status: 201 });
  } catch (err) {
    console.error('Registration error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

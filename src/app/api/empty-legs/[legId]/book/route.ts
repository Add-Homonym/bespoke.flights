import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { emptyLegBookSchema } from '@/lib/validations';
import { bookEmptyLeg, EmptyLegError } from '@/lib/empty-legs/service';
import { rateLimited } from '@/lib/rate-limit';

/** A signed-in traveler takes an empty leg: returns the request to pay from. */
export async function POST(req: Request, { params }: { params: Promise<{ legId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'customer') return NextResponse.json({ error: 'Only travelers can book a flight' }, { status: 403 });

  const parsed = emptyLegBookSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const limited = await rateLimited('bookingCreate', session.userId);
  if (limited) return limited;

  const { legId } = await params;
  try {
    const result = await bookEmptyLeg(getDb(), toId(legId), session.userId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof EmptyLegError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

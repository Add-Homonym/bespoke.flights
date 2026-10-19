import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { AdminError } from './users';

/** The signed-in admin's user id, or the 403 response to send. */
export async function requireAdmin(): Promise<{ adminId: number } | { error: NextResponse }> {
  const session = await getSession();
  if (!session || session.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { adminId: session.userId };
}

export function adminErrorResponse(err: unknown): NextResponse {
  if (err instanceof AdminError) {
    return NextResponse.json({ error: err.field ? { [err.field]: [err.message] } : err.message, message: err.message }, { status: err.status });
  }
  throw err;
}

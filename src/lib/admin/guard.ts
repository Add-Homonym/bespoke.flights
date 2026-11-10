import { NextResponse } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AdminError } from './users';
import type { SessionPayload } from '@/lib/types';

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

/**
 * For admin server pages. The (admin) layout redirects non-admins, but a
 * layout does not gate its pages' RSC payloads, so each page checks too.
 */
export async function requireAdminPage(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') notFound();
  return session;
}

/**
 * Authorization for Vercel Cron routes. Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; every call is refused while
 * CRON_SECRET is unset. Admins may also trigger a run with their session.
 */

import { getSession } from '@/lib/auth';
import { bearerMatches } from '@/lib/bearer';
import type { SessionPayload } from '@/lib/types';

export function bearerOk(req: Request): boolean {
  return bearerMatches(req, process.env.CRON_SECRET);
}

/** The signed-in admin's session, or null. */
export async function adminSession(): Promise<SessionPayload | null> {
  try {
    const session = await getSession();
    return session?.role === 'admin' ? session : null;
  } catch {
    return null;
  }
}

export async function adminOk(): Promise<boolean> {
  return (await adminSession()) !== null;
}

/**
 * Authorization for Vercel Cron routes. Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; every call is refused while
 * CRON_SECRET is unset. Admins may also trigger a run with their session.
 */

import { getSession } from '@/lib/auth';

export function bearerOk(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  return timingSafeEqual(header, `Bearer ${secret}`);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function adminOk(): Promise<boolean> {
  try {
    return (await getSession())?.role === 'admin';
  } catch {
    return false;
  }
}

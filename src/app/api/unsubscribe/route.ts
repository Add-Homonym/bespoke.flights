import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { unsubscribeDiscovered } from '@/lib/discovery/unsubscribe';

/**
 * POST — opt out of operator outreach. Takes the token as `t` in the query
 * string (RFC 8058 one-click) or in a form body (the /unsubscribe page).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get('t') ?? '';
  if (!token && req.headers.get('content-type')?.includes('form')) {
    token = String((await req.formData().catch(() => null))?.get('t') ?? '');
  }
  const ok = await unsubscribeDiscovered(getDb(), token);
  if (!ok) return NextResponse.json({ error: 'Unknown link' }, { status: 404 });
  if (req.headers.get('accept')?.includes('text/html')) {
    return NextResponse.redirect(new URL('/unsubscribe?done=1', url), 303);
  }
  return NextResponse.json({ ok: true });
}

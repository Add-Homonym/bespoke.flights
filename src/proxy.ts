import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

const PUBLIC_PATHS = ['/', '/login', '/register', '/book', '/api/auth', '/api/webhooks', '/api/cron'];
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Cross-site request check for cookie-authenticated API calls. Browsers send
 * Origin on every cross-origin request (and on same-origin mutations); a
 * mismatch with the request's own host is rejected. Requests without an
 * Origin header (server-to-server, curl, Stripe) pass; those routes carry
 * their own secret or signature.
 */
function crossSiteMutation(req: NextRequest): boolean {
  if (!MUTATING.has(req.method)) return false;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/') && crossSiteMutation(req)) {
    return NextResponse.json({ error: 'Cross-site request rejected' }, { status: 403 });
  }

  // Public routes. Stripe webhooks authenticate by signature; cron by CRON_SECRET.
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const session = await getSessionFromRequest(req);

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (pathname.startsWith('/operator') && session.role !== 'operator') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  if (pathname.startsWith('/admin') && session.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasSessionCookie } from '@/lib/session-cookie';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes that don't need auth. Stripe webhooks authenticate by signature.
  const publicPaths = ['/', '/login', '/register', '/book', '/trip', '/board', '/api/board', '/api/auth', '/api/webhooks'];
  if (publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Protected routes require a session. Role checks (operator, admin) happen in the
  // route-group layouts and API handlers, which verify the session against the database.
  if (!(await hasSessionCookie(req))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

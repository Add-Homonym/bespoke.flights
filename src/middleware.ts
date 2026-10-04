import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes that don't need auth. Stripe webhooks authenticate by signature.
  const publicPaths = ['/', '/login', '/register', '/book', '/trip', '/api/auth', '/api/webhooks'];
  if (publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const session = await getSessionFromRequest(req);

  // Protected routes require authentication
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Operator routes
  if (pathname.startsWith('/operator')) {
    if (session.role !== 'operator') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  // Admin routes
  if (pathname.startsWith('/admin')) {
    if (session.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

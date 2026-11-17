import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasSessionCookie } from '@/lib/session-cookie';
import { ATTR_COOKIE, ATTR_MAX_AGE_SECONDS, attributionFromUrl, encodeAttribution } from '@/lib/ads/attribution';

// Callers that authenticate by signature or bearer secret, not by cookie.
const NO_ORIGIN_CHECK = ['/api/webhooks', '/api/cron', '/api/admin/stripe/webhooks'];

/**
 * Refuse cross-site writes to cookie-authenticated API routes. SameSite=Lax
 * already keeps session cookies off most cross-site POSTs; this also covers
 * sibling subdomains and older browsers. Requests without an Origin header
 * (server-to-server, some mail clients' one-click unsubscribe) pass.
 */
function crossSiteWrite(req: NextRequest): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return false;
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/api/')) return false;
  if (NO_ORIGIN_CHECK.some(p => pathname === p || pathname.startsWith(p + '/'))) return false;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== (req.headers.get('host') ?? req.nextUrl.host);
  } catch {
    return true;
  }
}

/** Remember the paid click (bfv, gclid, utm_*) that brought this visitor, for the ads loop. */
function rememberClick(req: NextRequest, res: NextResponse): NextResponse {
  if (req.method !== 'GET' || req.nextUrl.pathname.startsWith('/api/')) return res;
  const click = attributionFromUrl(req.nextUrl);
  if (click) {
    res.cookies.set(ATTR_COOKIE, encodeAttribution(click), {
      httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', path: '/', maxAge: ATTR_MAX_AGE_SECONDS,
    });
  }
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (crossSiteWrite(req)) {
    return NextResponse.json({ error: 'Cross-site request refused' }, { status: 403 });
  }

  // Public routes that don't need a session. Stripe webhooks authenticate by
  // signature; cron routes by CRON_SECRET (or an admin session, checked in the handler).
  const publicPaths = ['/', '/login', '/register', '/book', '/empty-legs', '/api/empty-legs', '/operators', '/trip', '/board', '/api/board', '/api/auth', '/api/webhooks', '/api/cron', '/api/aircraft-photos', '/unsubscribe', '/api/unsubscribe'];
  if (publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return rememberClick(req, NextResponse.next());
  }

  // Protected routes require a session. Role checks (operator, admin) happen in the
  // route-group layouts and API handlers, which verify the session against the database.
  if (!(await hasSessionCookie(req))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return rememberClick(req, NextResponse.redirect(new URL('/login', req.url)));
  }

  return rememberClick(req, NextResponse.next());
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|airports/).*)',
  ],
};

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';

type NavUser = { name: string; role: string } | null | undefined;

const navLink =
  'inline-flex min-h-11 items-center text-label text-ink-muted transition-colors duration-200 ease-out hover:text-ink';

/** Where operators learn about the platform and sign up. */
const OPERATORS_LINK = { href: '/register?role=operator', label: 'Operators' };

const links = {
  guest: [
    { href: '/book', label: 'Request quotes' },
    OPERATORS_LINK,
    { href: '/login', label: 'Sign in' },
  ],
  customer: [
    { href: '/book', label: 'Request quotes' },
    { href: '/requests', label: 'My requests' },
    OPERATORS_LINK,
  ],
  operator: [
    { href: '/operator/board', label: 'Board' },
    { href: '/operator/inbound', label: 'Inbound' },
    { href: '/operator/requests', label: 'All demand' },
    { href: '/operator/quotes', label: 'My quotes' },
    { href: '/operator/fleet', label: 'Fleet' },
    { href: '/operator/team', label: 'Team' },
    { href: '/operator/settings', label: 'Settings' },
  ],
  admin: [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/operators', label: 'Operators' },
    { href: '/admin/requests', label: 'Requests' },
    { href: '/admin/payments', label: 'Payments' },
    { href: '/admin/discoveries', label: 'Discoveries' },
  ],
} as const;

/** The site navigation. Rendered in the header and repeated in the footer. */
export function SiteNav({ user, id, label }: { user: NavUser; id: string; label: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  };

  const roleLinks = user ? (links[user.role as keyof typeof links] ?? []) : links.guest;

  return (
    <nav id={id} aria-label={label} className="flex flex-wrap items-center gap-x-5">
      {roleLinks.map(link => (
        <Link key={link.href} href={link.href} className={navLink}>{link.label}</Link>
      ))}
      {user ? (
        <>
          <Link href="/account" className={navLink}>Account</Link>
          <button type="button" onClick={handleLogout} className={`${navLink} cursor-pointer`}>Sign out</button>
        </>
      ) : (
        <ButtonLink href="/register" size="sm">Create account</ButtonLink>
      )}
    </nav>
  );
}

export function Header({ user }: { user?: NavUser }) {
  return (
    <header id="site-header" className="border-b border-hairline bg-surface print:hidden">
      <div id="site-header-inner" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 px-4 py-2 sm:px-6">
        <Link id="site-logo" href="/" className="inline-flex min-h-11 items-center">
          <Logo />
        </Link>
        <SiteNav user={user} id="main-nav" label="Main" />
      </div>
    </header>
  );
}

/** Footer: logo, the same navigation as the header, and the copyright line. */
export function Footer({ user }: { user?: NavUser }) {
  return (
    <footer id="site-footer" className="mt-auto border-t border-hairline bg-surface print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 py-8 sm:px-6">
        <Link id="footer-logo" href="/" className="inline-flex min-h-11 items-center">
          <Logo />
        </Link>
        <SiteNav user={user} id="footer-nav" label="Footer" />
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <span className="text-label text-ink-muted">&copy; {new Date().getFullYear()} All rights reserved.</span>
      </div>
    </footer>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';

const navLink =
  'inline-flex min-h-11 items-center text-label text-ink-muted transition-colors duration-200 ease-out hover:text-ink';

const links = {
  guest: [
    { href: '/book', label: 'Request quotes' },
    { href: '/login', label: 'Sign in' },
  ],
  customer: [
    { href: '/book', label: 'Request quotes' },
    { href: '/requests', label: 'My requests' },
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

export function Header({ user }: { user?: { name: string; role: string } | null }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  };

  const roleLinks = user ? (links[user.role as keyof typeof links] ?? []) : links.guest;

  return (
    <header className="border-b border-hairline bg-surface print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 px-4 py-2 sm:px-6">
        <Link href="/" className="inline-flex min-h-11 items-center">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5">
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
      </div>
    </header>
  );
}

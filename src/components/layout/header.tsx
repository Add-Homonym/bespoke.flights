'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
    { href: '/operator/dashboard', label: 'Dashboard' },
    { href: '/operator/inbound', label: 'Inbound' },
    { href: '/operator/requests', label: 'All demand' },
    { href: '/operator/quotes', label: 'My quotes' },
    { href: '/operator/fleet', label: 'Fleet' },
    { href: '/operator/autopilot', label: 'Autopilot' },
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

/** Role menus: signed-in operators and admins get their tools under one labelled menu. */
const roleMenus: Record<string, { label: string; items: readonly { href: string; label: string }[] }> = {
  operator: { label: 'Operator', items: links.operator },
  admin: { label: 'Admin', items: links.admin },
};

const PANEL_WIDTH = 240;

/** "Operator ▾" in the header: a disclosure menu listing the role's tools. */
function RoleMenu({ id, label, items }: { id: string; label: string; items: readonly { href: string; label: string }[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /** Open towards the side with room: from the button's left edge, or its right edge near the screen edge. */
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = items.find(i => pathname === i.href || pathname.startsWith(i.href + '/'));

  // Close on outside click and on Escape (returning focus to the button).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        id={`${id}-button`}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => {
          const r = buttonRef.current?.getBoundingClientRect();
          if (r) setAlignRight(r.left + PANEL_WIDTH > window.innerWidth - 16);
          setOpen(o => !o);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-royal px-4 text-label text-ink transition-colors duration-200 ease-out hover:bg-surface-sunken cursor-pointer"
      >
        <span className="text-overline text-royal">{label}</span>
        {current && <span className="hidden text-ink-muted sm:inline">{current.label}</span>}
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={`${id}-panel`}
          style={{ width: PANEL_WIDTH }}
          className={`absolute z-50 mt-2 max-w-[calc(100vw-2rem)] rounded-md border border-hairline bg-surface-raised p-2 shadow-float ${alignRight ? 'right-0' : 'left-0'}`}
        >
          <p className="px-3 pb-1 pt-2 text-overline text-ink-muted">{label} tools</p>
          <ul>
            {items.map(item => {
              const active = item === current;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center rounded-sm px-3 text-label transition-colors duration-200 ease-out hover:bg-surface-sunken ${active ? 'text-royal' : 'text-ink'}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The site navigation. Rendered in the header (role tools as a menu) and repeated in the footer (role tools as a labelled list). */
export function SiteNav({ user, id, label, variant = 'header' }: { user: NavUser; id: string; label: string; variant?: 'header' | 'footer' }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  };

  const menu = user ? roleMenus[user.role] : undefined;
  const roleLinks = menu ? [] : user ? (links[user.role as keyof typeof links] ?? []) : links.guest;

  return (
    <nav id={id} aria-label={label} className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {menu && variant === 'header' && <RoleMenu id={`${id}-${user!.role}`} label={menu.label} items={menu.items} />}
      {menu && variant === 'footer' && (
        <div className="flex flex-wrap items-center gap-x-5">
          <span className="text-overline text-royal">{menu.label}</span>
          {menu.items.map(link => <Link key={link.href} href={link.href} className={navLink}>{link.label}</Link>)}
        </div>
      )}
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
        <SiteNav user={user} id="footer-nav" label="Footer" variant="footer" />
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <span className="text-label text-ink-muted">&copy; {new Date().getFullYear()} All rights reserved.</span>
      </div>
    </footer>
  );
}

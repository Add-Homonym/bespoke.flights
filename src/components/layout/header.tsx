'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function Header({ user }: { user?: { name: string; role: string } | null }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  };

  return (
    <header className="border-b border-brand-border bg-brand-dark/80 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-gold to-brand-accent flex items-center justify-center text-brand-dark font-bold text-sm">B</div>
          <span className="font-display text-xl text-brand-cream">bespoke<span className="text-brand-gold">.flights</span></span>
        </Link>
        <nav className="flex items-center gap-6">
          {user ? (
            <>
              {user.role === 'customer' && (
                <>
                  <Link href="/book" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Book Flight</Link>
                  <Link href="/requests" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">My Requests</Link>
                </>
              )}
              {user.role === 'operator' && (
                <>
                  <Link href="/operator/inbound" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Inbound</Link>
                  <Link href="/operator/requests" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">All Demand</Link>
                  <Link href="/operator/quotes" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">My Quotes</Link>
                  <Link href="/operator/fleet" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Fleet</Link>
                  <Link href="/operator/settings" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Settings</Link>
                </>
              )}
              {user.role === 'admin' && (
                <>
                  <Link href="/admin/dashboard" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Dashboard</Link>
                  <Link href="/admin/users" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Users</Link>
                  <Link href="/admin/operators" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Operators</Link>
                  <Link href="/admin/requests" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Requests</Link>
                  <Link href="/admin/payments" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Payments</Link>
                  <Link href="/admin/discoveries" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Discoveries</Link>
                </>
              )}
              <Link href="/account" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Account</Link>
              <button onClick={handleLogout} className="text-sm text-brand-muted hover:text-brand-error transition-colors cursor-pointer">Sign Out</button>
            </>
          ) : (
            <>
              <Link href="/book" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Book a Flight</Link>
              <Link href="/login" className="text-sm text-brand-muted hover:text-brand-cream transition-colors">Sign In</Link>
              <Link href="/register" className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-accent transition-colors">Get Started</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

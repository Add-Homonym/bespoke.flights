'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarLink {
  href: string;
  label: string;
  icon: string;
}

export function Sidebar({ links, title }: { links: SidebarLink[]; title: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-brand-border bg-brand-dark min-h-[calc(100vh-65px)] p-4">
      <h2 className="px-3 mb-6 text-xs font-semibold uppercase tracking-wider text-brand-muted">{title}</h2>
      <nav className="space-y-1">
        {links.map(link => {
          const active = pathname === link.href || pathname.startsWith(link.href + '/');
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-brand-gold/10 text-brand-gold font-medium'
                  : 'text-brand-muted hover:text-brand-cream hover:bg-brand-slate'
              }`}
            >
              <span className="text-lg">{link.icon}</span>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

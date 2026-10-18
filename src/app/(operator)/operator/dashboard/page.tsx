import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Armchair, ArrowRight, BadgeCheck, Banknote, Camera, CircleAlert, CircleCheck, FileWarning, Handshake, Inbox, Mail,
  MessageSquare, Plane, Send, Settings, SlidersHorizontal, Trophy, Users, Bot,
} from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { buildDashboard } from '@/lib/operator/dashboard';
import { formatMoney as money } from '@/lib/payments/config';
import { CompanyBoard } from '@/components/board/company-board';
import { Notice } from '@/components/ui/notice';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Operator } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Whole dollars when there are no cents. */
const formatMoney = (cents: number) => money(cents).replace(/\.00$/, '');

type Icon = typeof Inbox;

/** One dashboard box: icon title, rows, and a link to the section. */
function Tile({ id, title, icon: TitleIcon, href, action, children }: {
  id: string; title: string; icon: Icon; href: string; action: string; children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}
      className="group relative flex flex-col rounded-lg border border-hairline bg-surface-raised p-6 shadow-raised transition-colors duration-200 ease-out hover:border-border-control focus-within:border-royal">
      <h2 id={`${id}-title`} className="flex items-center gap-3 text-heading text-ink">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-sunken text-royal">
          <TitleIcon size={20} strokeWidth={1.5} aria-hidden="true" />
        </span>
        {title}
      </h2>
      <ul className="mt-5 flex-1 divide-y divide-hairline">{children}</ul>
      <Link href={href}
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-label text-royal after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none">
        {action} <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}

const TONES = { ink: 'text-ink', danger: 'text-danger', confirmed: 'text-confirmed', muted: 'text-ink-muted' } as const;

function Stat({ icon: StatIcon, label, value, tone = 'ink' }: { icon: Icon; label: string; value: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <StatIcon size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ink-muted" />
      <span className="text-body text-ink-muted">{label}</span>
      <span className={`ml-auto text-heading tabular-nums ${TONES[tone]}`}>{value}</span>
    </li>
  );
}

function Check({ good, yes, no }: { good: boolean; yes: string; no: string }) {
  const I = good ? CircleCheck : CircleAlert;
  return <span className="inline-flex items-center gap-1.5"><I size={16} strokeWidth={1.5} aria-hidden="true" />{good ? yes : no}</span>;
}

export default async function OperatorDashboardPage() {
  const session = await getSession();
  const db = getDb();
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session!.userId]);
  if (!operator) return <Notice tone="danger">No operator company is linked to this account.</Notice>;

  const { deals, fleet, team, settings } = await buildDashboard(db, operator);

  return (
    <div id="operator-dashboard" className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-overline text-ink-muted">Dashboard</p>
          <h1 className="mt-1 text-display text-ink">{operator.company_name}</h1>
        </div>
        <StatusBadge variant={operator.status === 'approved' ? 'confirmed' : operator.status === 'pending' ? 'warning' : 'danger'}>
          {operator.status}
        </StatusBadge>
      </div>

      {operator.status === 'pending' && (
        <Notice tone="warning">Your account is pending approval. Requests start arriving once it is approved.</Notice>
      )}

      <div id="dashboard-tiles" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tile id="tile-deals" title="Deals" icon={Handshake} href="/operator/inbound"
          action={deals.awaiting ? `${deals.awaiting} awaiting your quote` : 'Inbound requests'}>
          <Stat icon={Inbox} label="Inbound requests" value={deals.inbound} />
          <Stat icon={Send} label="Quotes submitted" value={deals.submitted} />
          <Stat icon={BadgeCheck} label="Quotes accepted" value={deals.accepted} />
          <Stat icon={Trophy} label="Total value won" value={formatMoney(deals.wonCents)} tone={deals.wonCents ? 'confirmed' : 'ink'} />
          {deals.drafts > 0 && <Stat icon={Bot} label="Autopilot drafts to review" value={deals.drafts} tone="danger" />}
        </Tile>

        <Tile id="tile-fleet" title="Fleet" icon={Plane} href="/operator/fleet" action="Fleet management">
          <Stat icon={Plane} label="Aircraft" value={fleet.count} />
          <Stat icon={Armchair} label="Seats" value={fleet.seats} />
          {fleet.withoutPhotos > 0 && <Stat icon={Camera} label="Without photos" value={fleet.withoutPhotos} tone="muted" />}
          {fleet.registryFlags > 0 && <Stat icon={FileWarning} label="Registrations to check" value={fleet.registryFlags} tone="danger" />}
        </Tile>

        <Tile id="tile-team" title="Team" icon={Users} href="/operator/team" action="Team and alerts">
          <Stat icon={Users} label="Staff on alerts" value={team.active} />
          <Stat icon={Mail} label="By email" value={team.emailAlerts} />
          <Stat icon={MessageSquare} label="By text" value={team.smsAlerts} />
        </Tile>

        <Tile id="tile-settings" title="Settings" icon={Settings} href="/operator/settings" action="Settings">
          <Stat icon={SlidersHorizontal} label="Routing profile" tone={settings.profileComplete ? 'confirmed' : 'danger'}
            value={<Check good={settings.profileComplete} yes="Set" no="Incomplete" />} />
          <Stat icon={Banknote} label="Payouts" tone={settings.payoutsReady ? 'confirmed' : 'danger'}
            value={<Check good={settings.payoutsReady} yes="Ready" no="Not set up" />} />
        </Tile>
      </div>

      <section id="dashboard-board" aria-labelledby="dashboard-board-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="dashboard-board-title" className="text-title text-ink">Charters</h2>
          <Link href="/operator/team" className="inline-flex min-h-11 items-center text-label text-royal hover:underline underline-offset-4">Staff board link</Link>
        </div>
        <CompanyBoard source="/api/operator/board" linkTrips />
      </section>
    </div>
  );
}

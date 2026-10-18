import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Camera, FileWarning, Inbox, Mail, MessageSquare, Plane, Receipt, Users, Wallet } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { buildDashboard } from '@/lib/operator/dashboard';
import { formatMoney as money } from '@/lib/payments/config';

/** Whole dollars when there are no cents. */
const formatMoney = (cents: number) => money(cents).replace(/\.00$/, '');
import { CompanyBoard } from '@/components/board/company-board';
import { Bars, Donut, SplitBar } from '@/components/operator/mini-charts';
import { Notice } from '@/components/ui/notice';
import { StatusBadge } from '@/components/ui/status-badge';
import { ButtonLink } from '@/components/ui/button';
import type { Operator } from '@/lib/types';

export const dynamic = 'force-dynamic';

const COLORS = {
  royal: 'var(--royal)',
  confirmed: 'var(--confirmed)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  muted: 'var(--ink-subtle)',
};

const monthLabel = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/** A summary box linking to its section. */
function Tile({ id, href, title, icon: Icon, action, children, className = '' }: {
  id: string; href: string; title: string; icon: typeof Inbox; action: string; children: ReactNode; className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}
      className={`group relative flex flex-col gap-5 rounded-lg border border-hairline bg-surface-raised p-6 shadow-raised transition-colors duration-200 ease-out hover:border-border-control focus-within:border-royal ${className}`}>
      <header className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="inline-flex items-center gap-2 text-overline text-ink-muted">
          <Icon size={16} strokeWidth={1.5} aria-hidden="true" className="text-royal" /> {title}
        </h2>
        <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-label text-royal after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none">
          {action} <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </header>
      {children}
    </section>
  );
}

function Figure({ value, label, tone = 'ink' }: { value: string | number; label: string; tone?: 'ink' | 'royal' | 'danger' }) {
  return (
    <div>
      <p className={`text-figure tabular-nums ${tone === 'royal' ? 'text-royal' : tone === 'danger' ? 'text-danger' : 'text-ink'}`}>{value}</p>
      <p className="text-label text-ink-muted">{label}</p>
    </div>
  );
}

export default async function OperatorDashboardPage() {
  const session = await getSession();
  const db = getDb();
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session!.userId]);

  if (!operator) {
    return <Notice tone="danger">No operator company is linked to this account.</Notice>;
  }

  const d = await buildDashboard(db, operator.id);
  const profileComplete = operator.markets && operator.fleet_types && (operator.contact_email || operator.contact_phone);
  const { inbound, quotes, earnings, team, fleet } = d;
  const weekLabels = inbound.weekly.map((_, i) => (i === inbound.weekly.length - 1 ? 'This week' : `${inbound.weekly.length - 1 - i}w ago`));

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
      {!profileComplete && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-warning bg-warning-tint px-4 py-3">
          <p className="text-body text-warning">Add your markets, aircraft types and contact method so requests are routed to you.</p>
          <ButtonLink href="/operator/settings" size="sm">Settings</ButtonLink>
        </div>
      )}

      <div id="dashboard-tiles" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Tile id="tile-inbound" href="/operator/inbound" title="Inbound requests" icon={Inbox} action="Inbound" className="xl:col-span-3">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <Figure value={inbound.awaiting} label="awaiting your quote" tone={inbound.awaiting ? 'royal' : 'ink'} />
            <Figure value={inbound.total} label="matched to you" />
          </div>
          <Bars values={inbound.weekly} labels={[weekLabels[0]!, weekLabels[weekLabels.length - 1]!]}
            label={`Requests matched per week, last ${inbound.weekly.length} weeks: ${inbound.weekly.join(', ')}`} />
          <SplitBar label={`${inbound.awaiting} awaiting, ${inbound.quoted} quoted, ${inbound.missed} closed without a quote`}
            segments={[
              { label: 'Awaiting', value: inbound.awaiting, color: COLORS.royal },
              { label: 'Quoted', value: inbound.quoted, color: COLORS.confirmed },
              { label: 'Missed', value: inbound.missed, color: COLORS.muted },
            ]} />
        </Tile>

        <Tile id="tile-quotes" href="/operator/quotes" title="All quotes" icon={Receipt} action="Quotes" className="xl:col-span-3">
          <div className="flex flex-wrap items-center gap-6">
            <Donut
              label={`${quotes.total} quotes: ${quotes.pending} pending, ${quotes.accepted} accepted, ${quotes.rejected} declined, ${quotes.withdrawn} withdrawn`}
              center={quotes.winRate === null ? String(quotes.total) : `${Math.round(quotes.winRate * 100)}%`}
              caption={quotes.winRate === null ? 'quotes' : 'won'}
              segments={[
                { label: 'Pending', value: quotes.pending, color: COLORS.warning },
                { label: 'Accepted', value: quotes.accepted, color: COLORS.confirmed },
                { label: 'Declined', value: quotes.rejected, color: COLORS.danger },
                { label: 'Withdrawn', value: quotes.withdrawn, color: COLORS.muted },
              ]} />
            <ul className="grid min-w-40 flex-1 grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {([['Pending', quotes.pending, COLORS.warning], ['Accepted', quotes.accepted, COLORS.confirmed], ['Declined', quotes.rejected, COLORS.danger], ['Withdrawn', quotes.withdrawn, COLORS.muted]] as const).map(([l, v, c]) => (
                <li key={l} className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                  <span className="text-label text-ink-muted">{l}</span>
                  <span className="ml-auto text-heading tabular-nums text-ink">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </Tile>

        <Tile id="tile-earnings" href="/operator/settings#payouts" title="Business earned" icon={Wallet} action="Payouts" className="xl:col-span-2">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <Figure value={formatMoney(earnings.payoutCents)} label={`${earnings.paidBookings} paid booking${earnings.paidBookings === 1 ? '' : 's'}`} />
          </div>
          <Bars values={earnings.monthly.map(m => m.cents)}
            labels={[monthLabel(earnings.monthly[0]!.month), monthLabel(earnings.monthly[earnings.monthly.length - 1]!.month)]}
            label={`Payouts by month: ${earnings.monthly.map(m => `${monthLabel(m.month)} ${formatMoney(m.cents)}`).join(', ')}`} />
          {earnings.refundedCents > 0 && (
            <p className="text-label text-ink-muted">{formatMoney(earnings.refundedCents)} refunded to travelers</p>
          )}
        </Tile>

        <Tile id="tile-team" href="/operator/team" title="Team" icon={Users} action="Team" className="xl:col-span-2">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <Figure value={team.active} label={`staff on alerts${team.inactive ? ` · ${team.inactive} paused` : ''}`} />
          </div>
          {team.members.length > 0 ? (
            <ul aria-label="Staff" className="flex -space-x-2">
              {team.members.map((m, i) => (
                <li key={i} title={m.role ? `${m.name}, ${m.role}` : m.name}
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-surface-raised bg-surface-sunken text-label text-ink">
                  <span aria-hidden="true">{initials(m.name)}</span><span className="sr-only">{m.name}</span>
                </li>
              ))}
              {team.active > team.members.length && (
                <li className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-surface-raised bg-surface-sunken text-label text-ink-muted">
                  +{team.active - team.members.length}
                </li>
              )}
            </ul>
          ) : (
            <p className="text-body text-ink-muted">No staff yet. Add dispatch and crew to alert them about charters.</p>
          )}
          <div className="mt-auto flex gap-6 text-label text-ink-muted">
            <span className="inline-flex items-center gap-1.5"><Mail size={14} strokeWidth={1.5} aria-hidden="true" /> {team.emailAlerts} by email</span>
            <span className="inline-flex items-center gap-1.5"><MessageSquare size={14} strokeWidth={1.5} aria-hidden="true" /> {team.smsAlerts} by text</span>
          </div>
        </Tile>

        <Tile id="tile-fleet" href="/operator/fleet" title="Aircraft" icon={Plane} action="Fleet" className="xl:col-span-2">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <Figure value={fleet.count} label="aircraft" />
            <Figure value={fleet.seats} label="seats" />
          </div>
          {fleet.aircraft.length > 0 ? (
            <ul className="grid grid-cols-4 gap-2">
              {fleet.aircraft.map(a => (
                <li key={a.id} className="space-y-1">
                  <div className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded-sm bg-surface-sunken">
                    {a.coverPhotoId ? (
                      // eslint-disable-next-line @next/next/no-img-element -- own route, immutable cache
                      <img src={`/api/aircraft-photos/${a.coverPhotoId}?size=thumb`} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Plane size={16} strokeWidth={1.5} aria-hidden="true" className="text-ink-subtle" />
                    )}
                  </div>
                  <p className="truncate font-mono text-overline text-ink-muted">{a.tail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-ink-muted">No aircraft yet.</p>
          )}
          {(fleet.registryFlags > 0 || (fleet.count > 0 && fleet.withPhotos < fleet.count)) && (
            <div className="mt-auto flex flex-wrap gap-x-6 gap-y-1 text-label">
              {fleet.registryFlags > 0 && (
                <span className="inline-flex items-center gap-1.5 text-danger"><FileWarning size={14} strokeWidth={1.5} aria-hidden="true" /> {fleet.registryFlags} registration{fleet.registryFlags === 1 ? '' : 's'} to check</span>
              )}
              {fleet.withPhotos < fleet.count && (
                <span className="inline-flex items-center gap-1.5 text-ink-muted"><Camera size={14} strokeWidth={1.5} aria-hidden="true" /> {fleet.count - fleet.withPhotos} without photos</span>
              )}
            </div>
          )}
        </Tile>
      </div>

      <section id="dashboard-board" aria-labelledby="dashboard-board-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="dashboard-board-title" className="text-title text-ink">Charters</h2>
            <p className="mt-1 text-body text-ink-muted">Live. Updates automatically.</p>
          </div>
          <Link href="/operator/team" className="inline-flex min-h-11 items-center text-label text-royal hover:underline underline-offset-4">Staff board link</Link>
        </div>
        <CompanyBoard source="/api/operator/board" linkTrips />
      </section>
    </div>
  );
}

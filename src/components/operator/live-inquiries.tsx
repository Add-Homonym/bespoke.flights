'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, CircleAlert, CircleCheck, Inbox, Plane, Users } from 'lucide-react';
import { airportLabel } from '@/lib/airports';
import { formatTripDate } from '@/lib/trip-format';

interface Inquiry {
  outreach_id: number;
  request_id: number;
  sent_at: string;
  passenger_count: number;
  request_notes: string | null;
  request_status: string;
  quote_id: number | null;
  quote_price: number | null;
  quote_status: string | null;
  legs: { origin_code: string; dest_code: string; departure_date: string; departure_time: string | null }[];
  draft: { priceCents: number; message: string | null; flags: string[]; aircraftLabel: string | null } | null;
}

const POLL_MS = 8000;
const SHOW = 5;
const money = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;

function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

const city = (code: string) => airportLabel(code).split(' · ')[0] || code;

/** The traveler's side of the pair. */
function InquiryCard({ r, now }: { r: Inquiry; now: number }) {
  const first = r.legs[0];
  const stops = r.legs.length ? [r.legs[0]!.origin_code, ...r.legs.map(l => l.dest_code)] : [];
  return (
    <div className="min-w-0 space-y-2 p-4">
      <p className="flex items-center justify-between gap-2 text-overline text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><Inbox size={14} strokeWidth={1.5} aria-hidden="true" /> Inquiry #{r.request_id}</span>
        <span className="normal-case tracking-normal">{ago(r.sent_at, now)}</span>
      </p>
      <p className="font-mono text-heading text-ink">{stops.join(' → ') || '—'}</p>
      <p className="text-label text-ink-muted">
        {stops.length ? `${city(stops[0]!)} to ${city(stops[stops.length - 1] === stops[0] && stops.length > 2 ? stops[stops.length - 2]! : stops[stops.length - 1]!)}` : ''}
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-label text-ink">
        {first && <span>{formatTripDate(first.departure_date)}{r.legs.length > 1 ? ` + ${r.legs.length - 1} leg${r.legs.length > 2 ? 's' : ''}` : ''}</span>}
        <span className="inline-flex items-center gap-1"><Users size={14} strokeWidth={1.5} aria-hidden="true" /> {r.passenger_count}</span>
      </p>
      {r.request_notes && <p className="line-clamp-2 text-label text-ink-muted">“{r.request_notes}”</p>}
    </div>
  );
}

/** Autopilot's side of the pair: the drafted response, or its status. */
function ResponseCard({ r, engaged }: { r: Inquiry; engaged: boolean }) {
  const open = ['open', 'quoted'].includes(r.request_status);
  const review = `/operator/inbound?review=${r.request_id}`;

  if (r.quote_id) {
    return (
      <div className="flex h-full flex-col justify-center gap-1 p-4">
        <p className="inline-flex items-center gap-1.5 text-overline text-confirmed"><CircleCheck size={14} strokeWidth={1.5} aria-hidden="true" /> Sent</p>
        <p className="text-figure tabular-nums text-ink">{money(r.quote_price ?? 0)}</p>
        <p className="text-label text-ink-muted capitalize">Quote {r.quote_status}</p>
      </div>
    );
  }
  if (!open) {
    return <div className="flex h-full items-center p-4 text-label capitalize text-ink-muted">Request {r.request_status}</div>;
  }
  if (r.draft) {
    const flagged = r.draft.flags.length > 0;
    return (
      <div className="flex h-full flex-col gap-2 p-4">
        <p className="flex items-center justify-between gap-2 text-overline text-royal">
          <span className="inline-flex items-center gap-1.5"><Bot size={14} strokeWidth={1.5} aria-hidden="true" /> Autopilot draft</span>
          {flagged && (
            <span className="inline-flex items-center gap-1 normal-case tracking-normal text-warning">
              <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" /> {r.draft.flags.length} to check
            </span>
          )}
        </p>
        <p className="text-figure tabular-nums text-ink">{money(r.draft.priceCents)}</p>
        {r.draft.aircraftLabel && (
          <p className="inline-flex items-center gap-1.5 text-label text-ink"><Plane size={14} strokeWidth={1.5} aria-hidden="true" /> {r.draft.aircraftLabel}</p>
        )}
        {r.draft.message && <p className="line-clamp-2 text-label text-ink-muted">{r.draft.message}</p>}
        <Link href={review} className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start text-label text-royal hover:underline underline-offset-4">
          Review and send <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-4">
      {engaged ? (
        <p className="typing inline-flex items-center gap-1.5 text-label text-royal">
          <Bot size={14} strokeWidth={1.5} aria-hidden="true" /> Autopilot drafting<span aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
        </p>
      ) : (
        <p className="inline-flex items-center gap-1.5 text-label text-ink-muted"><Bot size={14} strokeWidth={1.5} aria-hidden="true" /> Autopilot is off</p>
      )}
      <Link href={review} className="inline-flex min-h-11 items-center gap-1.5 self-start text-label text-royal hover:underline underline-offset-4">
        Quote now <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * Newest inquiries matched to this operator, each paired with Autopilot's
 * drafted response. Refreshes every few seconds while the tab is visible.
 */
export function LiveInquiries() {
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<number> | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch('/api/operator/inbound', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    setEngaged(res.headers.get('X-Autopilot') === 'on');
    const list = ((await res.json()) as Inquiry[])
      .sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at) || b.request_id - a.request_id);
    if (seen.current) setFresh(new Set(list.filter(i => !seen.current!.has(i.outreach_id)).map(i => i.outreach_id)));
    seen.current = new Set(list.map(i => i.outreach_id));
    setItems(list);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    const first = setTimeout(() => { void poll(); }, 0);
    const t = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, POLL_MS);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [poll]);

  const shown = items?.slice(0, SHOW) ?? [];
  const waiting = items?.filter(i => !i.quote_id && ['open', 'quoted'].includes(i.request_status)).length ?? 0;

  return (
    <section id="live-inquiries" aria-labelledby="live-inquiries-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="live-inquiries-title" className="inline-flex items-center gap-2 text-title text-ink">
            New inquiries
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-2 py-0.5 text-overline text-ink-muted">
              <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-confirmed" /> Live
            </span>
          </h2>
          <p className="mt-1 text-body text-ink-muted">
            Each request beside the response Autopilot drafted. {waiting > 0 ? `${waiting} waiting.` : ''}
          </p>
        </div>
        <span className="flex gap-4">
          <Link href="/operator/autopilot" className="inline-flex min-h-11 items-center gap-1.5 text-label text-royal hover:underline underline-offset-4">
            <Bot size={14} strokeWidth={1.5} aria-hidden="true" /> Autopilot {engaged ? 'on' : 'off'}
          </Link>
          <Link href="/operator/inbound" className="inline-flex min-h-11 items-center text-label text-royal hover:underline underline-offset-4">All inquiries</Link>
        </span>
      </div>

      {items === null ? (
        <p role="status" className="text-body text-ink-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-control px-6 py-8 text-center text-body text-ink-muted">
          No inquiries yet. New requests appear here as travelers send them.
        </p>
      ) : (
        <ol aria-live="polite" className="space-y-3">
          {shown.map(r => (
            <li key={r.outreach_id}
              className={`grid grid-cols-1 overflow-hidden rounded-lg border border-hairline bg-surface-raised shadow-raised md:grid-cols-[1fr_auto_1fr] ${fresh.has(r.outreach_id) ? 'inquiry-new' : ''}`}>
              <InquiryCard r={r} now={now} />
              <div aria-hidden="true" className="flex items-center justify-center border-t border-dashed border-hairline text-ink-subtle md:border-l md:border-t-0">
                <ArrowRight size={18} strokeWidth={1.5} className="m-1 rotate-90 md:rotate-0" />
              </div>
              <div className="bg-surface-sunken/60 md:border-l md:border-hairline"><ResponseCard r={r} engaged={engaged} /></div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

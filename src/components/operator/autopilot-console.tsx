'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { displayCode } from '@/lib/airports';
import { AirportField } from '@/components/ui/route-field';
import type { AutopilotSettings } from '@/lib/quotes/autopilot';
import type { Learned } from '@/lib/quotes/learning';

type NumKey = 'marginPct' | 'fuelSurchargePct' | 'minDailyHours' | 'crewOvernight' | 'landingPerLeg' | 'cateringPerPaxLeg' | 'fetPct' | 'segmentFeePerPax' | 'validDays';

const INSTRUMENTS: { key: NumKey; label: string; unit: string; step: number; prefix?: string }[] = [
  { key: 'marginPct', label: 'Margin', unit: '%', step: 0.5 },
  { key: 'fuelSurchargePct', label: 'Fuel surch', unit: '%', step: 0.5 },
  { key: 'minDailyHours', label: 'Daily min', unit: 'H/DAY', step: 0.5 },
  { key: 'crewOvernight', label: 'Crew o/n', unit: '/NIGHT', step: 50, prefix: '$' },
  { key: 'landingPerLeg', label: 'Land + handle', unit: '/LEG', step: 50, prefix: '$' },
  { key: 'cateringPerPaxLeg', label: 'Catering', unit: '/PAX/LEG', step: 5, prefix: '$' },
  { key: 'fetPct', label: 'Excise tax', unit: '%', step: 0.1 },
  { key: 'segmentFeePerPax', label: 'Segment fee', unit: '/PAX/LEG', step: 0.1, prefix: '$' },
  { key: 'validDays', label: 'Quote valid', unit: 'DAYS', step: 1 },
];

interface FeedItem {
  outreach_id: number;
  request_id: number;
  sent_at: string;
  passenger_count: number;
  request_status: string;
  quote_id: number | null;
  quote_price: number | null;
  quote_status: string | null;
  legs: { origin_code: string; dest_code: string; departure_date: string }[];
  draft: { priceCents: number; flags: string[] } | null;
}

const money = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
const POLL_MS = 8000;

function Module({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`console-module px-3 pb-3 pt-4 ${className}`}>
      <p className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-on-night-muted">{label}</p>
      {children}
    </div>
  );
}

/** One instrument: LCD readout with knob buttons either side. */
function Instrument({ id, label, unit, prefix, step, value, onChange, learned }: {
  id: string; label: string; unit: string; prefix?: string; step: number; value: number; onChange: (n: number) => void;
  /** Value Autopilot has learned from submitted quotes, when learning is on. */
  learned?: number | null;
}) {
  const nudge = (d: number) => onChange(Math.max(0, Math.round((value + d) * 100) / 100));
  return (
    <Module label={label}>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => nudge(-step)} className="console-knob inline-flex size-11 shrink-0 items-center justify-center rounded-full cursor-pointer">
          <Minus size={14} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="lcd flex h-11 min-w-0 flex-1 items-center justify-end gap-1 px-2">
          {prefix && <span aria-hidden="true" className="text-[15px]">{prefix}</span>}
          <label htmlFor={id} className="sr-only">{label} ({unit.toLowerCase()})</label>
          <input id={id} type="number" inputMode="decimal" min={0} step={step} value={value}
            onChange={e => onChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
            className="w-full min-w-0 bg-transparent text-right text-[20px] tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
        </div>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => nudge(step)} className="console-knob inline-flex size-11 shrink-0 items-center justify-center rounded-full cursor-pointer">
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 flex justify-between gap-2 font-mono text-[10px] tracking-[0.14em] text-on-night-muted">
        <span className="text-[var(--annun-amber)]">{learned != null ? `LRN ${prefix ?? ''}${Math.round(learned * 100) / 100}` : ''}</span>
        <span aria-hidden="true">{unit}</span>
      </p>
    </Module>
  );
}

function feedState(r: FeedItem, engaged: boolean): { text: string; lit: 'green' | 'amber' | 'off'; href?: string } {
  if (r.quote_id) return { text: `QUOTED ${money(r.quote_price ?? 0)}`, lit: 'off' };
  if (!['open', 'quoted'].includes(r.request_status)) return { text: r.request_status.toUpperCase(), lit: 'off' };
  if (r.draft) return { text: `DRAFT ${money(r.draft.priceCents)} · REVIEW`, lit: r.draft.flags.length ? 'amber' : 'green', href: `/operator/inbound?review=${r.request_id}` };
  return { text: engaged ? 'DRAFTING…' : 'AWAITING QUOTE', lit: 'amber', href: `/operator/inbound?review=${r.request_id}` };
}

/**
 * The Autopilot console: engage switch, pricing instruments, and a live feed
 * of incoming requests with their drafted quotes.
 */
export function AutopilotConsole() {
  const [value, setValue] = useState<AutopilotSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fault, setFault] = useState('');
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [updated, setUpdated] = useState<string>('');
  const [learned, setLearned] = useState<Learned | null>(null);

  useEffect(() => {
    fetch('/api/operator/settings').then(r => r.json()).then(d => { setValue(d.autopilot); setLearned(d.autopilot_learned); })
      .catch(() => setFault('SETTINGS UNAVAILABLE'));
  }, []);

  const resetLearning = async () => {
    const res = await fetch('/api/operator/autopilot/learning', { method: 'DELETE' }).catch(() => null);
    if (res?.ok) setLearned({ samples: 0, fields: {}, aircraft: {} });
  };

  const poll = useCallback(async () => {
    const res = await fetch('/api/operator/inbound', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const items = (await res.json()) as FeedItem[];
    const ids = new Set(items.map(i => i.outreach_id));
    // Highlight requests that arrived since the last poll (not on first load).
    if (seen.current) setFresh(new Set(items.filter(i => !seen.current!.has(i.outreach_id)).map(i => i.outreach_id)));
    seen.current = ids;
    setFeed(items);
    setUpdated(new Date().toISOString());
  }, []);

  useEffect(() => {
    void poll();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  const save = async (next: AutopilotSettings) => {
    setSaving(true);
    setFault('');
    const res = await fetch('/api/operator/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autopilot: { ...next, baseAirport: next.baseAirport || null, validDays: Math.max(1, Math.round(next.validDays)) } }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) { setFault('SAVE FAILED · CHECK VALUES'); return; }
    const body = await res.json();
    setValue(body.autopilot);
    setLearned(body.autopilot_learned);
    setDirty(false);
    void poll(); // engaging drafts waiting requests
  };

  if (!value) return <p className="text-body text-ink-muted" role="status">{fault || 'Loading…'}</p>;
  const engaged = value.enabled;
  const change = (patch: Partial<AutopilotSettings>) => { setValue({ ...value, ...patch }); setDirty(true); };
  const drafts = feed?.filter(f => f.draft && !f.quote_id).length ?? 0;
  const awaiting = feed?.filter(f => !f.quote_id && ['open', 'quoted'].includes(f.request_status)).length ?? 0;

  return (
    <div id="autopilot-console" className="console rounded-xl p-4 sm:p-6">
      {/* Top strip: engage switch and annunciators */}
      <div className="flex flex-wrap items-center gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <button type="button" role="switch" aria-checked={engaged} aria-label="Autopilot" disabled={saving}
            onClick={() => { const next = { ...value, enabled: !engaged }; setValue(next); void save(next); }}
            className="engage-switch relative h-16 w-10 shrink-0 overflow-hidden rounded-md cursor-pointer disabled:cursor-wait">
            <span aria-hidden="true" className="engage-lever absolute inset-x-1 bottom-1 h-[calc(50%-4px)] rounded-sm" />
          </button>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-on-night-muted">A/P</p>
            <p className="font-mono text-[15px] uppercase tracking-[0.12em] text-on-night">{engaged ? 'Engaged' : 'Disengaged'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" aria-live="polite">
          <span className="annunciator px-3 py-1.5 text-[11px]" data-lit={engaged ? 'green' : 'off'}>AP ENGD</span>
          <span className="annunciator px-3 py-1.5 text-[11px]" data-lit={!engaged ? 'amber' : 'off'}>MANUAL</span>
          <span className="annunciator px-3 py-1.5 text-[11px]" data-lit={drafts ? 'green' : 'off'}>{drafts} DRAFT{drafts === 1 ? '' : 'S'}</span>
          <span className="annunciator px-3 py-1.5 text-[11px]" data-lit={dirty ? 'amber' : 'off'}>UNSAVED</span>
          <button type="button" role="switch" aria-checked={value.learn} aria-label="Learn from submitted quotes" disabled={saving}
            onClick={() => { const next = { ...value, learn: !value.learn }; setValue(next); void save(next); }}
            className="annunciator min-h-11 px-3 text-[11px] cursor-pointer" data-lit={value.learn ? 'green' : 'off'}>
            LEARN{value.learn && learned?.samples ? ` · ${learned.samples} QUOTE${learned.samples === 1 ? '' : 'S'}` : ''}
          </button>
          {fault && <span className="annunciator px-3 py-1.5 text-[11px]" data-lit="amber" role="alert">{fault}</span>}
        </div>
        <p className="w-full font-mono text-[12px] leading-[18px] text-on-night-muted sm:ml-auto sm:w-auto sm:max-w-xs sm:text-right">
          Drafts are held for review. Nothing reaches a traveler until a staffer submits it.
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
        {/* Instruments */}
        <div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Module label="Home base">
              <div className="lcd px-1">
                <AirportField id="autopilot-base" label="Home base for positioning" value={value.baseAirport ?? ''} onChange={v => change({ baseAirport: v })}
                  labelClass="sr-only" cellClass="px-1 py-0" inputClass="h-11 text-right text-[20px] uppercase !text-[var(--lcd)] font-mono" placeholder="ICAO"
                  listClass="right-0 w-72 text-ink" />
              </div>
              <p aria-hidden="true" className="mt-1 text-right font-mono text-[10px] tracking-[0.14em] text-on-night-muted">POSITIONING</p>
            </Module>
            {INSTRUMENTS.map(i => (
              <Instrument key={i.key} id={`autopilot-${i.key}`} label={i.label} unit={i.unit} prefix={i.prefix} step={i.step}
                value={value[i.key]} onChange={n => change({ [i.key]: n } as Partial<AutopilotSettings>)}
                learned={value.learn && i.key !== 'validDays' ? learned?.fields[i.key]?.v ?? null : null} />
            ))}
          </div>

          <Module label="Message to traveler" className="mt-3">
            <label htmlFor="autopilot-message" className="sr-only">Message to the traveler</label>
            <textarea id="autopilot-message" rows={2} maxLength={2000} value={value.message ?? ''} onChange={e => change({ message: e.target.value })}
              className="lcd block w-full resize-y px-3 py-2 text-[14px] leading-[20px]" />
            <p className="mt-1 font-mono text-[10px] tracking-[0.12em] text-on-night-muted">{'{AIRCRAFT}'} {'{SEATS}'} FILLED IN · RATE + CRUISE PER AIRCRAFT IN <Link href="/operator/fleet" className="underline underline-offset-2 hover:text-on-night">FLEET</Link></p>
          </Module>

          <p className="mt-3 font-mono text-[11px] leading-[16px] text-on-night-muted">
            {value.learn
              ? learned?.samples
                ? <>LRN = LEARNED FROM {learned.samples} SUBMITTED QUOTE{learned.samples === 1 ? '' : 'S'}. DRAFTS USE LRN VALUES, RATES AND FLIGHT TIMES; SETPOINTS APPLY UNTIL A VALUE IS LEARNED. <button type="button" onClick={resetLearning} className="underline underline-offset-2 hover:text-on-night cursor-pointer">RESET</button></>
                : 'LEARNING: EACH QUOTE STAFF SUBMIT WITH THE WORKSHEET ADJUSTS THESE VALUES.'
              : 'LEARNING OFF: DRAFTS USE THE SETPOINTS ONLY.'}
          </p>

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => save(value)} disabled={saving || !dirty}
              className="annunciator min-h-11 px-5 text-[12px] uppercase cursor-pointer disabled:cursor-not-allowed" data-lit={dirty ? 'green' : 'off'}>
              {saving ? 'Saving…' : 'Set parameters'}
            </button>
          </div>
        </div>

        {/* Live feed of incoming requests */}
        <section aria-labelledby="feed-title" className="console-module flex min-h-80 flex-col p-4 pt-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="feed-title" className="font-mono text-[11px] uppercase tracking-[0.18em] text-on-night-muted">Incoming requests</h2>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-on-night-muted">
              <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-[var(--lcd)]" /> LIVE{updated ? ` ${clock(updated)}` : ''}
            </span>
          </div>
          <div className="lcd flex-1 overflow-hidden p-2">
            {feed === null ? (
              <p className="p-2 text-[13px]">CONNECTING…</p>
            ) : feed.length === 0 ? (
              <p className="p-2 text-[13px]">NO REQUESTS YET · STANDING BY</p>
            ) : (
              <ol aria-live="polite" className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
                {feed.slice(0, 30).map(r => {
                  const st = feedState(r, engaged);
                  const route = r.legs.length ? [r.legs[0]!.origin_code, ...r.legs.map(l => l.dest_code)].map(displayCode).join('›') : '—';
                  const row = (
                    <>
                      <span className="flex justify-between gap-2 text-[12px] opacity-70">
                        <span>{clock(r.sent_at)} · #{r.request_id}</span>
                        <span>{r.legs[0]?.departure_date ?? ''} · {r.passenger_count} PAX</span>
                      </span>
                      <span className="block truncate text-[14px]">{route}</span>
                      <span className={`block text-[12px] ${st.lit === 'amber' ? 'text-[var(--annun-amber)]' : st.lit === 'off' ? 'opacity-50' : ''}`}>{st.text}</span>
                    </>
                  );
                  return (
                    <li key={r.outreach_id} className={`feed-row rounded-sm ${fresh.has(r.outreach_id) ? 'feed-row-new' : ''}`}>
                      {st.href
                        ? <Link href={st.href} className="block rounded-sm px-2 py-1.5 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[var(--lcd)]">{row}</Link>
                        : <div className="px-2 py-1.5">{row}</div>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <p className="mt-2 font-mono text-[10px] tracking-[0.12em] text-on-night-muted">{awaiting} AWAITING · {drafts} READY FOR REVIEW</p>
        </section>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Minus, Pencil, Plane, Plus, X } from 'lucide-react';
import { AirportField } from '@/components/ui/route-field';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { AccountStep } from '@/components/booking/account-step';
import { AutoRequestBar, useAutoRequest } from '@/components/booking/auto-request';
import { legIsComplete } from '@/components/booking/leg-card';
import { RequestsField } from '@/components/booking/trip-extras';
import { MAX_GUESTS, ONE_AIRCRAFT_GUESTS } from '@/components/booking/trip-extras';
import { combineRequests, type RequestTagId } from '@/lib/bookings/request-tags';
import { draftHasContent, draftToRequest, emptyDraft, emptyLeg, writeDraftCookie, type BookingDraft, type DraftLeg } from '@/lib/bookings/draft';
import { bookingRequestSchema } from '@/lib/validations';
import { findAirport } from '@/lib/airports';
import { formatLandUnits, formatNm, legDistance } from '@/lib/distance';
import { formatTripDate, fromDraftLegs } from '@/lib/trip-format';

type Viewer = 'customer' | 'operator' | 'admin' | null;

const MAX_LEGS = 10;

/** Shimmering bar for a detail that arrives with the quotes. */
function Pending({ width, label }: { width: string; label: string }) {
  return (
    <>
      <span aria-hidden="true" className="ticket-pending" style={{ width }} />
      <span className="sr-only">{label}</span>
    </>
  );
}

const fieldInput = 'block w-full bg-transparent font-mono uppercase text-ink placeholder:normal-case placeholder:font-sans placeholder:text-ink-subtle';
// The big airport codes need a smaller placeholder so "City or code" fits a half-width cell at 390px.
const airportInput = `${fieldInput} text-ellipsis placeholder:text-[16px] placeholder:font-normal text-[28px] leading-[36px] font-semibold`;

const noopSubscribe = () => () => {};
/** False while the server HTML is on screen, true once React owns the page. */
function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** One leg as a paper ticket with the fields printed into it. */
/**
 * Special requests on the ticket: a printed line with the current requests,
 * and a pop-up with the chips to add or change them.
 */
function RequestsPopup({ tags, custom, onTags, onCustom }: {
  tags: RequestTagId[]; custom: string[]; onTags: (t: RequestTagId[]) => void; onCustom: (c: string[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const summary = combineRequests(tags, custom);
  const count = tags.length + custom.length;
  return (
    <div className="border-t border-dashed border-hairline pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-overline text-ink-muted">Special requests</p>
          <p className="mt-1 text-[14px] leading-[20px] text-ink">{summary || <span className="text-ink-subtle">None</span>}</p>
        </div>
        <button id="requests-open" type="button" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill border border-border-control px-4 text-label text-ink transition-colors duration-200 ease-out hover:border-royal hover:text-royal cursor-pointer">
          {count ? <Pencil size={14} strokeWidth={1.5} aria-hidden="true" /> : <Plus size={14} strokeWidth={1.5} aria-hidden="true" />}
          {count ? 'Edit' : 'Add'}
        </button>
      </div>
      <dialog ref={dialog} id="requests-dialog" aria-labelledby="requests-dialog-title"
        onClick={e => { if (e.target === dialog.current) dialog.current?.close(); }}
        className="requests-dialog ticket m-auto w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-hairline p-0 text-ink shadow-float backdrop:bg-black/40">
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
            <h2 id="requests-dialog-title" className="text-overline text-royal">Special requests · optional</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close"
              className="-my-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink cursor-pointer">
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
          <RequestsField tags={tags} onTagsChange={onTags} custom={custom} onCustomChange={onCustom} />
          <div className="flex justify-end">
            <button type="button" onClick={() => dialog.current?.close()}
              className="inline-flex h-10 items-center rounded-md bg-royal px-5 text-[13px] font-semibold text-on-royal hover:opacity-90 cursor-pointer">Done</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function LegTicket({ index, count, leg, passengers, onChange, onPassengers, onRemove, extra }: {
  /** Trip-wide fields printed on the first ticket. */
  extra?: React.ReactNode;
  index: number;
  count: number;
  leg: DraftLeg;
  passengers: number;
  onChange: (patch: Partial<DraftLeg>) => void;
  onPassengers: (n: number) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const base = `ticket-${n}`;
  const d = legDistance(leg.originCode, leg.destCode);
  const from = findAirport(leg.originCode);
  const to = findAirport(leg.destCode);
  const flight = from && to ? `${from.iata || from.icao}–${to.iata || to.icao}` : '';
  const clampPax = (v: number) => Math.min(MAX_GUESTS, Math.max(1, Math.round(v) || 1));
  const same = leg.originCode && leg.originCode === leg.destCode;

  return (
    <article id={base} aria-labelledby={`${base}-title`} className="ticket rounded-lg border border-hairline shadow-raised">
      <div className="flex flex-col sm:flex-row">
        <div className="min-w-0 flex-1 space-y-4 p-5 sm:p-6">
          <header className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
            <p className="text-overline text-royal">Bespoke Flights · Private charter</p>
            <div className="flex items-center gap-2">
              <h2 id={`${base}-title`} className="text-overline text-ink-muted">Leg {String(n).padStart(2, '0')} of {String(count).padStart(2, '0')}</h2>
              {count > 1 && (
                <button type="button" onClick={onRemove} aria-label={`Remove leg ${n}`}
                  className="-my-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-200 ease-out hover:bg-surface-sunken hover:text-danger cursor-pointer">
                  <X size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              )}
            </div>
          </header>

          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
            <AirportField id={`${base}-from`} label="From" value={leg.originCode} onChange={v => onChange({ originCode: v })} required
              listClass="left-0 w-[min(18rem,calc(100vw-3rem))]"
              placeholder="City or code" labelClass="text-overline" cellClass="rounded-md px-2 py-2 -mx-2"
              inputClass={airportInput} />
            <div aria-hidden="true" className="flex items-center gap-1 pt-9 text-royal">
              <span className="hidden h-px w-6 border-t border-dashed border-ink-subtle sm:block" />
              <Plane size={20} strokeWidth={1.5} />
              <span className="hidden h-px w-6 border-t border-dashed border-ink-subtle sm:block" />
            </div>
            <AirportField id={`${base}-to`} label="To" value={leg.destCode} onChange={v => onChange({ destCode: v })} required
              listClass="right-0 w-[min(18rem,calc(100vw-3rem))]"
              placeholder="City or code" labelClass="text-overline" cellClass="rounded-md px-2 py-2 -mx-2"
              inputClass={airportInput} />
          </div>
          {same && <p className="text-label text-danger">Origin and destination are the same airport.</p>}

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-dashed border-hairline pt-3 sm:grid-cols-3">
            <div className="field-cell -mx-2 rounded-md px-2 py-1">
              <label htmlFor={`${base}-date`} className="block text-overline text-ink-muted">Date</label>
              <input id={`${base}-date`} type="date" required value={leg.departureDate} data-empty={!leg.departureDate}
                onChange={e => onChange({ departureDate: e.target.value })}
                className={`schedule-input ${fieldInput} text-[15px] leading-[28px]`} />
            </div>
            <div className="field-cell -mx-2 rounded-md px-2 py-1">
              <label htmlFor={`${base}-time`} className="block text-overline text-ink-muted">Departs</label>
              <input id={`${base}-time`} type="time" value={leg.departureTime} data-empty={!leg.departureTime}
                onChange={e => onChange({ departureTime: e.target.value })}
                className={`schedule-input ${fieldInput} text-[15px] leading-[28px]`} />
            </div>
            {index === 0 ? (
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor={`${base}-guests`} className="block text-overline text-ink-muted">Guests</label>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Remove a passenger" disabled={passengers <= 1} onClick={() => onPassengers(clampPax(passengers - 1))}
                  className="inline-flex size-11 items-center justify-center rounded-pill text-ink hover:bg-surface-sunken cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  <Minus size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <input id={`${base}-guests`} type="number" inputMode="numeric" min={1} value={passengers}
                  onChange={e => onPassengers(clampPax(Number(e.target.value)))}
                  className={`${fieldInput} w-14 text-center text-[15px] leading-[28px] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`} />
                <button type="button" aria-label="Add a passenger" onClick={() => onPassengers(clampPax(passengers + 1))}
                  className="inline-flex size-11 items-center justify-center rounded-pill text-ink hover:bg-surface-sunken cursor-pointer">
                  <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </div>
            ) : (
              <div>
                <p className="text-overline text-ink-muted">Guests</p>
                <p className="font-mono text-[15px] leading-[28px] text-ink tabular-nums">{passengers}</p>
              </div>
            )}
          </div>
          {index === 0 && passengers > ONE_AIRCRAFT_GUESTS && (
            <p className="text-label text-ink-muted">Operators can split a large group across aircraft.</p>
          )}
          <p className="text-label tabular-nums text-ink-muted" aria-live="polite">
            {d ? <><span className="text-ink">{formatNm(d)}</span> · {formatLandUnits(d)}</> : ' '}
          </p>
          {extra}
        </div>

        <aside aria-label={`Leg ${n} stub`} className="ticket-perf grid shrink-0 grid-cols-[1fr_auto] items-end gap-4 p-5 sm:flex sm:w-48 sm:flex-col sm:items-stretch sm:justify-between sm:p-6">
          <div className="space-y-4">
            <div>
              <p className="text-overline text-ink-muted">Fare</p>
              <p className="ticket-dots mt-1 font-mono text-[14px] text-ink-muted">Quotes on the way<span aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p>
            </div>
            <div>
              <p className="text-overline text-ink-muted">Operator</p>
              <p className="mt-1"><Pending width="7rem" label="Assigned when you choose a quote" /></p>
            </div>
            <div>
              <p className="text-overline text-ink-muted">Flight</p>
              <p className="mt-1 font-mono text-[14px] uppercase text-ink">{flight || '———'}</p>
              <p className="font-mono text-[13px] uppercase text-ink-muted">{formatTripDate(leg.departureDate) || ' '}</p>
            </div>
          </div>
          <div aria-hidden="true" className="ticket-barcode h-10 w-20 rounded-sm sm:w-full" />
        </aside>
      </div>
    </article>
  );
}

/**
 * Booking as paper tickets: one ticket per leg, fields printed into it.
 * Adding a leg issues another ticket. Quotes are requested automatically.
 */
export function TicketBookingForm({ initialDraft, viewerRole }: { initialDraft: BookingDraft | null; viewerRole: Viewer }) {
  const start = initialDraft ?? emptyDraft();
  const [legs, setLegs] = useState<DraftLeg[]>(start.legs);
  const [passengerCount, setPassengerCount] = useState(start.passengerCount);
  const [tags, setTags] = useState<RequestTagId[]>(start.tags);
  const [custom, setCustom] = useState<string[]>(start.custom);
  const [restored, setRestored] = useState(initialDraft !== null && draftHasContent(initialDraft));
  const [attempted, setAttempted] = useState(false);
  // The saved trip is in the first render. Until React takes over, the fields are locked so
  // anything typed into the server HTML cannot mix with the restored values.
  const hydrated = useHydrated();

  const draft: BookingDraft = { legs, passengerCount, tags, custom, variant: 'ticket' };
  useEffect(() => {
    writeDraftCookie({ legs, passengerCount, tags, custom, variant: 'ticket' });
  }, [legs, passengerCount, tags, custom]);

  const payload = draftToRequest(draft);
  const ready = legs.every(legIsComplete) && bookingRequestSchema.safeParse(payload).success;
  const auto = useAutoRequest({ payload, ready, viewerRole, startOnHold: restored });

  const submit = () => {
    if (!ready) { setAttempted(true); return; }
    if (viewerRole === 'customer') void auto.send();
    else document.getElementById('account-step')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const patchLeg = (i: number, patch: Partial<DraftLeg>) =>
    setLegs(prev => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLeg = () => {
    setLegs(prev => [...prev, { ...emptyLeg(), originCode: prev[prev.length - 1]?.destCode ?? '' }]);
    // Focus the new ticket's destination once it renders.
    setTimeout(() => document.getElementById(`ticket-${legs.length + 1}-to`)?.focus(), 0);
  };
  const removeLeg = (i: number) => setLegs(prev => prev.filter((_, j) => j !== i));
  const startOver = () => {
    const fresh = emptyDraft();
    setLegs(fresh.legs); setPassengerCount(1); setTags([]); setCustom([]); setRestored(false); auto.setHold(false);
  };

  return (
    <div id="ticket-booking" className="space-y-6 pb-4">
      {restored && (
        <div id="restored-draft-notice" role="status" className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-sunken px-4 py-3 text-body">
          <span className="text-ink">Your unfinished trip is restored.</span>
          <span className="flex items-center gap-1">
            <button type="button" onClick={startOver} className="inline-flex min-h-11 items-center px-3 text-label text-royal hover:underline underline-offset-4 cursor-pointer">Start over</button>
            <button id="restored-draft-close" type="button" onClick={() => setRestored(false)} aria-label="Close"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised hover:text-ink cursor-pointer">
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </span>
        </div>
      )}

      {auto.error && <Notice tone="danger">{auto.error}</Notice>}

      <form id="booking-form" noValidate onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-6">
        <fieldset disabled={!hydrated} className="contents">
        <ol className="space-y-6" aria-label="Tickets">
          {legs.map((leg, i) => (
            <li key={i}>
              <LegTicket index={i} count={legs.length} leg={leg} passengers={passengerCount}
                onChange={p => patchLeg(i, p)} onPassengers={setPassengerCount} onRemove={() => removeLeg(i)}
                extra={i === 0 ? <RequestsPopup tags={tags} custom={custom} onTags={setTags} onCustom={setCustom} /> : undefined} />
            </li>
          ))}
        </ol>

        {legs.length < MAX_LEGS && (
          <button id="add-leg" type="button" onClick={addLeg}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-control text-label text-ink-muted transition-colors duration-200 ease-out hover:border-royal hover:text-royal cursor-pointer">
            <Plus size={18} strokeWidth={1.5} aria-hidden="true" /> Add a leg
          </button>
        )}

        </fieldset>

        <div id="submit-section" aria-live="polite" className="space-y-3">
          <AutoRequestBar state={auto} ready={ready} viewerRole={viewerRole} />
          {attempted && !ready && (
            <p role="alert" className="text-label text-danger">Choose where from, where to and a date for every leg, then request quotes.</p>
          )}
          <Button id="request-quotes" type="submit" block disabled={auto.loading || !hydrated} aria-busy={auto.loading}>
            {auto.loading ? 'Sending…' : 'Request quotes'}
          </Button>
        </div>
      </form>

      {ready && viewerRole === null && (
        <AccountStep inline legs={fromDraftLegs(legs)} passengerCount={passengerCount} notes={combineRequests(tags, custom)} />
      )}

      <p className="text-center text-label text-ink-muted">
        Prefer a step-by-step form? <Link href="/book/classic" className="text-royal underline underline-offset-4">Use the classic form</Link>
      </p>
    </div>
  );
}

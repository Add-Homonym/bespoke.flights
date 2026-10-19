'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { AutoRequestBar, useAutoRequest } from '@/components/booking/auto-request';
import { Notice } from '@/components/ui/notice';
import { Button } from '@/components/ui/button';
import { AccountStep } from '@/components/booking/account-step';
import { LegCard, legIsComplete } from '@/components/booking/leg-card';
import { NextSteps } from '@/components/booking/next-steps';
import { GuestsField, RequestsField } from '@/components/booking/trip-extras';
import { combineRequests, type RequestTagId } from '@/lib/bookings/request-tags';
import { formatLandUnits, formatNm, tripDistance } from '@/lib/distance';
import { TripTicket } from '@/components/booking/trip-ticket';
import { fromDraftLegs } from '@/lib/trip-format';
import { bookingRequestSchema } from '@/lib/validations';
import {
  type BookingDraft,
  type DraftLeg,
  emptyDraft,
  emptyLeg,
  draftHasContent,
  draftToRequest,
  writeDraftCookie,
} from '@/lib/bookings/draft';

type LegInput = DraftLeg;

/** One leg in the form: its fields plus UI state. `key` is stable across reorders. */
interface LegState {
  key: number;
  leg: LegInput;
  editing: boolean;
  /** The leg as last set, restored by "Discard changes". Null for a leg never set. */
  saved: LegInput | null;
}

/** Each leg departs where the previous one lands. */
function rechain(states: LegState[]): LegState[] {
  return states.map((s, i) =>
    i === 0 || s.leg.originCode === states[i - 1].leg.destCode
      ? s
      : { ...s, leg: { ...s.leg, originCode: states[i - 1].leg.destCode } });
}

/** React keys for leg cards; unique for the page's lifetime. */
let keySeq = 0;
const newKey = () => keySeq++;

export function MultiLegForm({
  initialDraft,
  viewerRole,
}: {
  initialDraft: BookingDraft | null;
  viewerRole: 'customer' | 'operator' | 'admin' | null;
}) {
  const start = initialDraft ?? emptyDraft();
  const toState = (leg: LegInput): LegState => {
    const complete = legIsComplete(leg);
    return { key: newKey(), leg, editing: !complete, saved: complete ? leg : null };
  };
  const [legStates, setLegStates] = useState<LegState[]>(() => start.legs.map(toState));
  const [removed, setRemoved] = useState<{ index: number; state: LegState } | null>(null);
  const legs = useMemo(() => legStates.map(s => s.leg), [legStates]);
  const distance = useMemo(() => tripDistance(legs), [legs]);
  const [passengerCount, setPassengerCount] = useState(start.passengerCount);
  const [custom, setCustom] = useState<string[]>(start.custom);
  const [tags, setTags] = useState<RequestTagId[]>(start.tags);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(initialDraft !== null && draftHasContent(initialDraft));

  // Remember the itinerary in a cookie on every change, so a reload or a later
  // visit restores it and it survives the sign-up step.
  useEffect(() => {
    writeDraftCookie({ legs, passengerCount, tags, custom, variant: 'classic' });
  }, [legs, passengerCount, tags, custom]);

  const startOver = () => {
    const fresh = emptyDraft();
    setLegStates(fresh.legs.map(toState));
    setRemoved(null);
    setPassengerCount(fresh.passengerCount);
    setCustom(fresh.custom);
    setTags(fresh.tags);
    setHold(false);
    setError('');
    setRestored(false);
  };

  const patch = (index: number, fn: (s: LegState) => LegState) =>
    setLegStates(prev => rechain(prev.map((s, i) => (i === index ? fn(s) : s))));

  const updateLeg = (index: number, field: keyof LegInput, value: string) =>
    patch(index, s => ({ ...s, leg: { ...s.leg, [field]: value } }));

  // Swap a leg's endpoints. The next leg keeps departing from where this one lands.
  const swapLeg = (index: number) =>
    patch(index, s => ({ ...s, leg: { ...s.leg, originCode: s.leg.destCode, destCode: s.leg.originCode } }));

  /** Close the fields and show the leg as a summary. */
  const setLeg = (index: number) =>
    patch(index, s => (legIsComplete(s.leg) ? { ...s, editing: false, saved: s.leg } : s));

  const editLeg = (index: number) => patch(index, s => ({ ...s, editing: true }));

  /** Put the leg back as it was last set. */
  const discardLeg = (index: number) =>
    patch(index, s => (s.saved ? { ...s, leg: s.saved, editing: false } : s));

  const addLeg = () => {
    setRemoved(null);
    setLegStates(prev => {
      // A finished leg collapses to its summary as the next one opens.
      const settled = prev.map(s => (s.editing && legIsComplete(s.leg) ? { ...s, editing: false, saved: s.leg } : s));
      const last = settled[settled.length - 1].leg;
      return [...settled, { key: newKey(), leg: { ...emptyLeg(), originCode: last.destCode }, editing: true, saved: null }];
    });
  };

  /** Remove a leg (undoable), or clear the only leg. */
  const cancelLeg = (index: number) => {
    if (legStates.length <= 1) {
      setRemoved(null);
      setLegStates([{ key: newKey(), leg: emptyLeg(), editing: true, saved: null }]);
      return;
    }
    setRemoved({ index, state: legStates[index] });
    setLegStates(prev => rechain(prev.filter((_, i) => i !== index)));
  };

  const undoRemove = () => {
    if (!removed) return;
    setLegStates(prev => {
      const next = [...prev];
      next.splice(Math.min(removed.index, next.length), 0, removed.state);
      // The restored leg's landing becomes the next leg's departure again.
      return rechain(next);
    });
    setRemoved(null);
  };

  const payload = draftToRequest({ legs, passengerCount, tags, custom, variant: 'classic' });
  /** Every leg complete and closed: the trip can go to operators. */
  const ready = legStates.every(st => !st.editing && legIsComplete(st.leg)) && bookingRequestSchema.safeParse(payload).success;
  const auto = useAutoRequest({ payload, ready, viewerRole, startOnHold: restored });
  const { setHold } = auto;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void auto.send();
  };

  return (
    <div id="booking" className="space-y-8 pb-4">
    <form id="booking-form" onSubmit={handleSubmit} className="space-y-8">
      {restored && (
        <div id="restored-draft-notice" role="status" className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-sunken px-4 py-3 text-body">
          <span className="text-ink">Your unfinished trip is restored.</span>
          <span className="flex items-center gap-1">
            <Button type="button" variant="quiet" size="sm" onClick={startOver}>Start over</Button>
            <button id="restored-draft-close" type="button" onClick={() => setRestored(false)} aria-label="Close"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-200 ease-out hover:bg-surface-raised hover:text-ink cursor-pointer">
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </span>
        </div>
      )}

      {(error || auto.error) && <div id="booking-error"><Notice tone="danger">{error || auto.error}</Notice></div>}

      {/* Flight legs */}
      <section id="route-section" aria-labelledby="legs-heading" className="space-y-4">
        <div id="route-header" className="flex items-baseline justify-between gap-3">
          <h2 id="legs-heading" className="text-title text-ink">Your route</h2>
          <span id="route-totals" className="text-right text-label text-ink-muted tabular-nums">
            {legs.length} {legs.length === 1 ? 'leg' : 'legs'}
            {distance.measured > 0 && (
              <>
                {' · '}<span className="text-ink">{formatNm(distance.total)}</span>
                {!distance.complete && ' so far'}
              </>
            )}
          </span>
        </div>

        {removed && (
          <div id="leg-removed-notice" role="status" className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-raised px-4 py-2">
            <span className="text-body text-ink">Leg {removed.index + 1} cancelled.</span>
            <Button id="undo-leg-cancel" type="button" variant="quiet" size="sm" onClick={undoRemove}>Undo</Button>
          </div>
        )}

        <div id="leg-list" className="space-y-4">
          {legStates.map((s, i) => (
            <LegCard
              key={s.key}
              index={i}
              leg={s.leg}
              editing={s.editing}
              wasSet={s.saved !== null}
              legCount={legStates.length}
              isLast={i === legStates.length - 1}
              onChange={(field, value) => updateLeg(i, field, value)}
              onSwap={() => swapLeg(i)}
              onDone={() => setLeg(i)}
              onEdit={() => editLeg(i)}
              onCancel={() => cancelLeg(i)}
              onDiscard={() => discardLeg(i)}
              onAddLeg={addLeg}
            />
          ))}
        </div>

        {legs.length > 1 && distance.measured > 0 && (
          <p id="trip-distance" className="text-right text-label text-ink-muted tabular-nums">
            Total {distance.complete ? '' : 'so far '}
            <span className="text-ink">{formatNm(distance.total)}</span> · {formatLandUnits(distance.total)}
          </p>
        )}
      </section>

      {/* Guests */}
      <section id="guests-section" aria-labelledby="guests-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="guests-heading" className="text-title text-ink">Guests</h2>
          <span className="text-label text-ink-muted tabular-nums">{passengerCount} {passengerCount === 1 ? 'guest' : 'guests'}</span>
        </div>
        <div id="guests-card" className="form-part rounded-lg border border-hairline bg-surface-sunken p-4">
          <GuestsField value={passengerCount} onChange={setPassengerCount} />
        </div>
      </section>

      {/* Special requests */}
      <section id="requests-section" aria-labelledby="requests-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="requests-heading" className="text-title text-ink">Special requests</h2>
          <span className="text-label text-ink-muted">Optional</span>
        </div>
        <div id="requests-card" className="form-part rounded-lg border border-hairline bg-surface-sunken p-4">
          <RequestsField tags={tags} onTagsChange={setTags} custom={custom} onCustomChange={setCustom} />
        </div>
      </section>

      {/* The trip as a ticket: every detail entered so far */}
      {draftHasContent({ legs, passengerCount, tags, custom }) && (
        <TripTicket legs={fromDraftLegs(legs)} passengerCount={passengerCount} notes={combineRequests(tags, custom)} />
      )}

      <div id="submit-section" aria-live="polite">
        <AutoRequestBar state={auto} ready={ready} viewerRole={viewerRole} />
      </div>

    </form>

    {/* Visitors: the account form appears as soon as the route is set (its own form, so outside the booking form). */}
    {ready && viewerRole === null && (
      <AccountStep inline legs={fromDraftLegs(legs)} passengerCount={passengerCount} notes={combineRequests(tags, custom)} />
    )}

    <NextSteps routeReady={legs.every(legIsComplete)} />
    </div>
  );
}

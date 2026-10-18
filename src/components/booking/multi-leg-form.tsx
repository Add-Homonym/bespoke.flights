'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Notice } from '@/components/ui/notice';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AccountStep } from '@/components/booking/account-step';
import { LegCard, legIsComplete } from '@/components/booking/leg-card';
import { NextSteps } from '@/components/booking/next-steps';
import { formatLandUnits, formatNm, tripDistance } from '@/lib/distance';
import { TripDetails } from '@/components/booking/trip-details';
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

export function MultiLegForm({
  initialDraft,
  viewerRole,
}: {
  initialDraft: BookingDraft | null;
  viewerRole: 'customer' | 'operator' | 'admin' | null;
}) {
  const router = useRouter();
  const start = initialDraft ?? emptyDraft();
  const nextKey = useRef(0);
  const toState = (leg: LegInput): LegState => {
    const complete = legIsComplete(leg);
    return { key: nextKey.current++, leg, editing: !complete, saved: complete ? leg : null };
  };
  const [legStates, setLegStates] = useState<LegState[]>(() => start.legs.map(toState));
  const [removed, setRemoved] = useState<{ index: number; state: LegState } | null>(null);
  const legs = useMemo(() => legStates.map(s => s.leg), [legStates]);
  const distance = useMemo(() => tripDistance(legs), [legs]);
  const [passengerCount, setPassengerCount] = useState(start.passengerCount);
  const [notes, setNotes] = useState(start.notes);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsAccount, setNeedsAccount] = useState(false);
  const [restored, setRestored] = useState(initialDraft !== null && draftHasContent(initialDraft));

  // Remember the itinerary in a cookie on every change, so a reload or a later
  // visit restores it and it survives the sign-up step.
  useEffect(() => {
    writeDraftCookie({ legs, passengerCount, notes });
  }, [legs, passengerCount, notes]);

  const startOver = () => {
    const fresh = emptyDraft();
    setLegStates(fresh.legs.map(toState));
    setRemoved(null);
    setPassengerCount(fresh.passengerCount);
    setNotes(fresh.notes);
    setNeedsAccount(false);
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
      return [...settled, { key: nextKey.current++, leg: { ...emptyLeg(), originCode: last.destCode }, editing: true, saved: null }];
    });
  };

  /** Remove a leg (undoable), or clear the only leg. */
  const cancelLeg = (index: number) => {
    if (legStates.length <= 1) {
      setRemoved(null);
      setLegStates([{ key: nextKey.current++, leg: emptyLeg(), editing: true, saved: null }]);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload = draftToRequest({ legs, passengerCount, notes });
    if (!bookingRequestSchema.safeParse(payload).success || !legs.every(legIsComplete)) {
      setError('Choose an origin, destination and date for every leg.');
      return;
    }

    if (viewerRole === null) {
      // Not signed in: collect an account next. The draft cookie carries the
      // itinerary; the server submits it once the account exists.
      setNeedsAccount(true);
      window.scrollTo({ top: 0 }); // the account step starts with the trip summary
      return;
    }
    if (viewerRole !== 'customer') {
      setError('You are signed in as an operator or admin. Sign in with a traveler account to request quotes.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === 'string' ? data.error : 'Fill in all required fields.');
        return;
      }

      const { id } = await res.json();
      router.push(`/requests/${id}?submitted=1`);
      router.refresh();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (needsAccount) {
    return (
      <AccountStep
        legs={fromDraftLegs(legs)}
        passengerCount={passengerCount}
        notes={notes}
        onBack={() => setNeedsAccount(false)}
      />
    );
  }

  return (
    <form id="booking-form" onSubmit={handleSubmit} className="space-y-8 pb-4">
      {restored && (
        <div id="restored-draft-notice" role="status" className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-sunken px-4 py-3 text-body">
          <span className="text-ink">Your unfinished trip is restored.</span>
          <Button type="button" variant="quiet" size="sm" onClick={startOver}>Start over</Button>
        </div>
      )}

      {error && <div id="booking-error"><Notice tone="danger">{error}</Notice></div>}

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

      {/* Passengers and notes */}
      <section id="guests-section" aria-labelledby="guests-heading" className="space-y-4">
        <h2 id="guests-heading" className="text-title text-ink">Guests</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
          <Input
            label="Guests"
            type="number"
            min={1}
            max={19}
            value={passengerCount}
            onChange={e => setPassengerCount(Number(e.target.value))}
          />
          <Input
            label="Special requests"
            placeholder="Pets, luggage, catering"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </section>

      {/* Trip summary: every detail entered so far */}
      {draftHasContent({ legs, passengerCount, notes }) && (
        <div id="trip-summary" className="rounded-lg border border-hairline bg-surface-raised px-6 py-4 shadow-raised">
          <TripDetails title="Trip summary" legs={fromDraftLegs(legs)} passengerCount={passengerCount} notes={notes} />
        </div>
      )}

      <div id="submit-section" className="space-y-3">
        <Button id="request-quotes" type="submit" disabled={loading} block>
          {loading ? 'Requesting quotes…' : viewerRole === null ? 'Continue to account' : 'Request quotes'}
        </Button>
        {viewerRole === null && (
          <p className="text-center text-label text-ink-muted">
            Next: create an account or sign in so operators can send you quotes.
          </p>
        )}
      </div>

      <NextSteps routeReady={legs.every(legIsComplete)} />
    </form>
  );
}

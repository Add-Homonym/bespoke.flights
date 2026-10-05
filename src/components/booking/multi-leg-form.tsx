'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Notice } from '@/components/ui/notice';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RouteField } from '@/components/ui/route-field';
import { AccountStep } from '@/components/booking/account-step';
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

export function MultiLegForm({
  initialDraft,
  viewerRole,
}: {
  initialDraft: BookingDraft | null;
  viewerRole: 'customer' | 'operator' | 'admin' | null;
}) {
  const router = useRouter();
  const start = initialDraft ?? emptyDraft();
  const [legs, setLegs] = useState<LegInput[]>(start.legs);
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
    setLegs(fresh.legs);
    setPassengerCount(fresh.passengerCount);
    setNotes(fresh.notes);
    setNeedsAccount(false);
    setError('');
    setRestored(false);
  };

  const updateLeg = (index: number, field: keyof LegInput, value: string) => {
    setLegs(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // Auto-chain: when destination changes, update next leg's origin
      if (field === 'destCode' && index < updated.length - 1) {
        updated[index + 1] = { ...updated[index + 1], originCode: value };
      }

      return updated;
    });
  };

  // Swap a leg's endpoints. The next leg keeps departing from where this one lands.
  const swapLeg = (index: number) => {
    setLegs(prev => {
      const updated = [...prev];
      const { originCode, destCode } = updated[index];
      updated[index] = { ...updated[index], originCode: destCode, destCode: originCode };
      if (index < updated.length - 1) {
        updated[index + 1] = { ...updated[index + 1], originCode: originCode };
      }
      return updated;
    });
  };

  const addLeg = () => {
    const lastLeg = legs[legs.length - 1];
    setLegs(prev => [...prev, { ...emptyLeg(), originCode: lastLeg.destCode }]);
  };

  const removeLeg = (index: number) => {
    if (legs.length <= 1) return;
    setLegs(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Re-chain origins
      for (let i = 1; i < updated.length; i++) {
        updated[i].originCode = updated[i - 1].destCode;
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload = draftToRequest({ legs, passengerCount, notes });
    if (!bookingRequestSchema.safeParse(payload).success) {
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
    <form onSubmit={handleSubmit} className="space-y-8 pb-4">
      {restored && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-sunken px-4 py-3 text-body">
          <span className="text-ink">Your unfinished trip is restored.</span>
          <Button type="button" variant="quiet" size="sm" onClick={startOver}>Start over</Button>
        </div>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      {/* Flight legs */}
      <section aria-labelledby="legs-heading" className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 id="legs-heading" className="text-title text-ink">Your route</h2>
          <span className="text-label text-ink-muted">{legs.length} {legs.length === 1 ? 'leg' : 'legs'}</span>
        </div>

        {legs.map((leg, i) => (
          <div key={i} className="space-y-4 rounded-lg border border-hairline bg-surface-sunken p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-heading text-ink">Leg {i + 1}</h3>
              {legs.length > 1 && (
                <Button type="button" variant="quiet" size="sm" onClick={() => removeLeg(i)} aria-label={`Remove leg ${i + 1}`}>
                  Remove leg
                </Button>
              )}
            </div>

            <RouteField
              origin={leg.originCode}
              destination={leg.destCode}
              onOriginChange={val => updateLeg(i, 'originCode', val)}
              onDestinationChange={val => updateLeg(i, 'destCode', val)}
              onSwap={() => swapLeg(i)}
              originLocked={i > 0}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Date"
                type="date"
                value={leg.departureDate}
                onChange={e => updateLeg(i, 'departureDate', e.target.value)}
                required
              />
              <Input
                label="Departure time (local)"
                type="time"
                value={leg.departureTime}
                onChange={e => updateLeg(i, 'departureTime', e.target.value)}
              />
            </div>
          </div>
        ))}

        <Button type="button" variant="secondary" block onClick={addLeg}>
          <Plus size={24} strokeWidth={1.5} aria-hidden="true" />
          Add a leg
        </Button>
      </section>

      {/* Passengers and notes */}
      <section aria-labelledby="guests-heading" className="space-y-4">
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
        <div className="rounded-lg border border-hairline bg-surface-raised px-6 py-4 shadow-raised">
          <TripDetails title="Trip summary" legs={fromDraftLegs(legs)} passengerCount={passengerCount} notes={notes} />
        </div>
      )}

      <div className="space-y-3">
        <Button type="submit" disabled={loading} block>
          {loading ? 'Requesting quotes…' : viewerRole === null ? 'Continue to account' : 'Request quotes'}
        </Button>
        {viewerRole === null && (
          <p className="text-center text-label text-ink-muted">
            Next: create an account or sign in so operators can send you quotes.
          </p>
        )}
      </div>
    </form>
  );
}

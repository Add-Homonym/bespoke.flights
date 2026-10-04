'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AirportInput } from '@/components/ui/airport-input';
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
      setError('Please choose an origin, destination and date for every leg.');
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
        setError(typeof data.error === 'string' ? data.error : 'Please fill in all required fields');
        return;
      }

      const { id } = await res.json();
      router.push(`/requests/${id}?submitted=1`);
      router.refresh();
    } catch {
      setError('Something went wrong');
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
    <form onSubmit={handleSubmit} className="space-y-8">
      {restored && (
        <div className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-navy/40 px-4 py-3 text-sm">
          <span className="text-brand-cream">We saved the trip you started.</span>
          <button type="button" onClick={startOver} className="text-brand-muted hover:text-brand-cream cursor-pointer">
            Start over
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-brand-error/10 border border-brand-error/30 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      {/* Passenger count */}
      <div className="flex items-end gap-6">
        <div className="w-32">
          <Input
            label="Passengers"
            type="number"
            min={1}
            max={19}
            value={passengerCount}
            onChange={e => setPassengerCount(Number(e.target.value))}
          />
        </div>
        <div className="flex-1">
          <Input
            label="Special Requests"
            placeholder="Pets, luggage, catering preferences..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Flight legs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand-cream uppercase tracking-wider">Flight Legs</h3>
          <span className="text-xs text-brand-muted">{legs.length} leg{legs.length !== 1 ? 's' : ''}</span>
        </div>

        {legs.map((leg, i) => (
          <div key={i} className="rounded-xl border border-brand-border bg-brand-navy/30 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-brand-gold/20 flex items-center justify-center text-brand-gold text-xs font-bold">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-brand-cream">
                  Leg {i + 1}
                </span>
              </div>
              {legs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLeg(i)}
                  className="text-xs text-brand-muted hover:text-brand-error transition-colors cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <AirportInput
                label="From"
                placeholder="Search airport..."
                value={leg.originCode}
                onChange={val => updateLeg(i, 'originCode', val)}
                required
                readOnly={i > 0}
              />
              <AirportInput
                label="To"
                placeholder="Search airport..."
                value={leg.destCode}
                onChange={val => updateLeg(i, 'destCode', val)}
                required
              />
              <Input
                label="Date"
                type="date"
                value={leg.departureDate}
                onChange={e => updateLeg(i, 'departureDate', e.target.value)}
                required
              />
              <Input
                label="Preferred Time"
                type="time"
                value={leg.departureTime}
                onChange={e => updateLeg(i, 'departureTime', e.target.value)}
              />
            </div>

            {/* Route chain indicator */}
            {i < legs.length - 1 && (
              <div className="flex justify-center mt-4 -mb-8 relative z-10">
                <div className="w-px h-6 bg-brand-gold/30" />
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addLeg}
          className="w-full rounded-lg border border-dashed border-brand-border py-3 text-sm text-brand-muted hover:text-brand-gold hover:border-brand-gold/50 transition-colors cursor-pointer"
        >
          + Add Another Leg
        </button>
      </div>

      {/* Trip summary: every detail entered so far */}
      {draftHasContent({ legs, passengerCount, notes }) && (
        <div className="rounded-lg bg-brand-navy/50 border border-brand-border px-5 py-4">
          <TripDetails title="Trip summary" legs={fromDraftLegs(legs)} passengerCount={passengerCount} notes={notes} />
        </div>
      )}

      <Button type="submit" disabled={loading} size="lg" className="w-full">
        {loading ? 'Submitting Request...' : viewerRole === null ? 'Continue' : 'Submit Flight Request'}
      </Button>
      {viewerRole === null && (
        <p className="text-center text-xs text-brand-muted">
          Next: create an account or sign in so operators can send you quotes.
        </p>
      )}
    </form>
  );
}


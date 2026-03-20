'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AirportInput } from '@/components/ui/airport-input';

interface LegInput {
  originCode: string;
  destCode: string;
  departureDate: string;
  departureTime: string;
}

const emptyLeg = (): LegInput => ({
  originCode: '',
  destCode: '',
  departureDate: '',
  departureTime: '',
});

export function MultiLegForm() {
  const router = useRouter();
  const [legs, setLegs] = useState<LegInput[]>([emptyLeg()]);
  const [passengerCount, setPassengerCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    setLoading(true);

    try {
      const res = await fetch('/api/booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passengerCount,
          notes: notes || undefined,
          legs: legs.map(l => ({
            originCode: l.originCode.toUpperCase(),
            destCode: l.destCode.toUpperCase(),
            departureDate: l.departureDate,
            departureTime: l.departureTime || undefined,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === 'string' ? data.error : 'Please fill in all required fields');
        return;
      }

      router.push('/requests');
      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
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
            label="Special Notes"
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

      {/* Route summary */}
      {legs.some(l => l.originCode && l.destCode) && (
        <div className="rounded-lg bg-brand-navy/50 border border-brand-border px-5 py-4">
          <p className="text-xs text-brand-muted mb-2 uppercase tracking-wider">Route Summary</p>
          <p className="text-brand-cream font-mono text-lg tracking-wider">
            {legs
              .filter(l => l.originCode)
              .map((l, i, arr) => (
                <span key={i}>
                  <span className="text-brand-gold">{l.originCode.toUpperCase()}</span>
                  {(l.destCode || i < arr.length - 1) && <span className="text-brand-muted mx-2">&rarr;</span>}
                </span>
              ))}
            {legs[legs.length - 1].destCode && (
              <span className="text-brand-gold">{legs[legs.length - 1].destCode.toUpperCase()}</span>
            )}
          </p>
        </div>
      )}

      <Button type="submit" disabled={loading} size="lg" className="w-full">
        {loading ? 'Submitting Request...' : 'Submit Flight Request'}
      </Button>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Aircraft } from '@/lib/types';

export function SubmitQuoteForm({ requestId, aircraft }: { requestId: number; aircraft: Aircraft[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const priceStr = formData.get('price') as string;
    const price = parseFloat(priceStr);

    if (isNaN(price) || price <= 0) {
      setError('Please enter a valid price');
      setLoading(false);
      return;
    }

    const body = {
      priceCents: Math.round(price * 100),
      aircraftId: formData.get('aircraftId') ? Number(formData.get('aircraftId')) : undefined,
      message: formData.get('message') || undefined,
      validUntil: formData.get('validUntil') || undefined,
    };

    try {
      const res = await fetch(`/api/booking-requests/${requestId}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === 'string' ? data.error : 'Failed to submit quote');
        return;
      }

      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-brand-error/10 border border-brand-error/30 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      {aircraft.length > 0 && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-brand-muted">Aircraft</label>
          <select
            name="aircraftId"
            className="w-full rounded-lg border border-brand-border bg-brand-navy px-4 py-2.5 text-brand-cream focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold transition-colors"
          >
            <option value="">Select aircraft (optional)</option>
            {aircraft.map(a => (
              <option key={a.id} value={a.id}>{a.type} — {a.tail_number} ({a.capacity} seats)</option>
            ))}
          </select>
        </div>
      )}

      <Input name="price" label="Total Price (USD)" type="number" step="0.01" min="0" placeholder="25000.00" required />

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-brand-muted">Message to Client</label>
        <textarea
          name="message"
          rows={3}
          placeholder="Describe your offer, included amenities, etc."
          className="w-full rounded-lg border border-brand-border bg-brand-navy px-4 py-2.5 text-brand-cream placeholder:text-brand-muted/50 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold transition-colors resize-none"
        />
      </div>

      <Input name="validUntil" label="Quote Valid Until" type="date" />

      <Button type="submit" disabled={loading} size="lg" className="w-full">
        {loading ? 'Submitting...' : 'Submit Quote'}
      </Button>
    </form>
  );
}

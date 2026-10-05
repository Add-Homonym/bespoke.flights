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
        <div className="rounded-md bg-danger-tint border border-danger px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {aircraft.length > 0 && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-ink-muted">Aircraft</label>
          <select
            name="aircraftId"
            className="w-full rounded-md border border-hairline bg-surface-raised px-4 py-2.5 text-ink transition-colors"
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
        <label className="block text-sm font-medium text-ink-muted">Message to Client</label>
        <textarea
          name="message"
          rows={3}
          placeholder="Describe your offer, included amenities, etc."
          className="w-full rounded-md border border-hairline bg-surface-raised px-4 py-2.5 text-ink placeholder:text-ink-subtle transition-colors resize-none"
        />
      </div>

      <Input name="validUntil" label="Quote Valid Until" type="date" />

      <Button type="submit" disabled={loading} block>
        {loading ? 'Submitting...' : 'Submit Quote'}
      </Button>
    </form>
  );
}

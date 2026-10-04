'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function QuoteActions({
  quoteId,
  amountLabel,
  payable = true,
  unavailableReason,
}: {
  quoteId: number;
  amountLabel: string;
  payable?: boolean;
  unavailableReason?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const acceptAndPay = async () => {
    setLoading(true);
    setError('');
    const res = await fetch('/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      setError(data.error || 'Could not start checkout');
      setLoading(false);
      return;
    }
    window.location.assign(data.url);
  };

  const decline = async () => {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not decline quote');
    }
    setLoading(false);
    router.refresh();
  };

  return (
    <div className="mt-4 pt-4 border-t border-brand-border">
      <div className="flex gap-3 items-center">
        <Button onClick={acceptAndPay} disabled={loading || !payable} size="sm">
          Accept &amp; Pay {amountLabel}
        </Button>
        <Button onClick={decline} disabled={loading} variant="ghost" size="sm">
          Decline
        </Button>
        {!payable && unavailableReason && (
          <span className="text-brand-muted text-xs">{unavailableReason}</span>
        )}
      </div>
      {error && <p className="text-brand-error text-sm mt-2">{error}</p>}
    </div>
  );
}

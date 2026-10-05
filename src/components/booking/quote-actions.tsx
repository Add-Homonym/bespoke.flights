'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function QuoteActions({
  quoteId,
  payable = true,
  unavailableReason,
}: {
  quoteId: number;
  payable?: boolean;
  unavailableReason?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [declined, setDeclined] = useState(false);

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
      setError(data.error || 'Could not start checkout.');
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
      setError(data.error || 'Could not decline quote.');
    } else {
      setDeclined(true);
    }
    setLoading(false);
    router.refresh();
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex items-center gap-2">
        <Button onClick={acceptAndPay} disabled={loading || !payable} size="sm">
          Book this jet
        </Button>
        <Button onClick={decline} disabled={loading} variant="quiet" size="sm">
          Decline quote
        </Button>
      </div>
      {!payable && unavailableReason && <p className="text-label text-ink-muted">{unavailableReason}</p>}
      {error && <p role="alert" className="text-label text-danger">Error: {error}</p>}
      {declined && <p role="status" className="text-label text-ink-muted">Quote declined.</p>}
    </div>
  );
}

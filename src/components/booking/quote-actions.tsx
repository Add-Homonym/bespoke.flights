'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function QuoteActions({ quoteId }: { quoteId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleAction = async (status: 'accepted' | 'rejected') => {
    setLoading(true);
    await fetch(`/api/quotes/${quoteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  };

  return (
    <div className="flex gap-3 mt-4 pt-4 border-t border-brand-border">
      <Button onClick={() => handleAction('accepted')} disabled={loading} size="sm">
        Accept Quote
      </Button>
      <Button onClick={() => handleAction('rejected')} disabled={loading} variant="ghost" size="sm">
        Decline
      </Button>
    </div>
  );
}

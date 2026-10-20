'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EMPTY_LEG_COOKIE } from '@/lib/empty-legs/service';

/**
 * "Book this flight" on an empty-leg card. A signed-in traveler gets a
 * request with the price ready to pay; a visitor's choice is kept in a cookie
 * and booked right after they sign in or sign up.
 */
export function BookEmptyLeg({ legId, seats, viewerRole }: { legId: number; seats: number; viewerRole: string | null }) {
  const router = useRouter();
  const paxId = useId();
  const [pax, setPax] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (viewerRole && viewerRole !== 'customer') return null;

  const book = async () => {
    setLoading(true);
    setError('');
    if (!viewerRole) {
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${EMPTY_LEG_COOKIE}=${encodeURIComponent(JSON.stringify({ id: legId, passengerCount: pax }))}; Path=/; Max-Age=86400; SameSite=Lax${secure}`;
      router.push('/register');
      return;
    }
    const res = await fetch(`/api/empty-legs/${legId}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passengerCount: pax }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not book this flight.');
      setLoading(false);
      return;
    }
    router.push(`/requests/${data.requestId}?submitted=empty-leg`);
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex items-center gap-3">
        <label htmlFor={paxId} className="text-label text-ink-muted">Guests</label>
        <input
          id={paxId} type="number" min={1} max={seats} value={pax} inputMode="numeric"
          onChange={e => setPax(Math.min(seats, Math.max(1, Number(e.target.value) || 1)))}
          className="h-11 w-20 rounded-md border border-border-control bg-surface-raised px-3 text-body text-ink tabular-nums"
        />
        <Button size="sm" onClick={book} disabled={loading}>{viewerRole ? 'Book this flight' : 'Sign in to book'}</Button>
      </div>
      {error && <p role="alert" className="text-label text-danger">Error: {error}</p>}
    </div>
  );
}

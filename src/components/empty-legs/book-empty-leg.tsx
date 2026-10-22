'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { readApiFailure } from '@/lib/api/form-errors';
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
  const [notes, setNotes] = useState('');
  const notesId = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (viewerRole && viewerRole !== 'customer') return null;

  const book = async () => {
    setLoading(true);
    setError('');
    if (!viewerRole) {
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${EMPTY_LEG_COOKIE}=${encodeURIComponent(JSON.stringify({ id: legId, passengerCount: pax, notes: notes.trim().slice(0, 300) || undefined }))}; Path=/; Max-Age=86400; SameSite=Lax${secure}`;
      router.push('/register');
      return;
    }
    const res = await fetch(`/api/empty-legs/${legId}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passengerCount: pax, notes: notes.trim() || undefined }),
    });
    if (!res.ok) {
      const failure = await readApiFailure(res, 'Could not book this flight.');
      setError(failure.fields.passengerCount ?? failure.message);
      setLoading(false);
      return;
    }
    const data = await res.json();
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
      <div className="w-full sm:w-72">
        <label htmlFor={notesId} className="sr-only">Special requests (optional)</label>
        <input
          id={notesId} value={notes} onChange={e => setNotes(e.target.value)} maxLength={300}
          placeholder="Special requests (optional)"
          className="h-11 w-full rounded-md border border-border-control bg-surface-raised px-3 text-body text-ink placeholder:text-ink-subtle"
        />
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

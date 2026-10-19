'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';

/** Pause between the route being set (or any later change) and the request going out. */
export const AUTO_SEND_MS = 5000;

type Viewer = 'customer' | 'operator' | 'admin' | null;

/**
 * Signed-in travelers: once the trip is ready, the request is sent
 * automatically after AUTO_SEND_MS. Any change to the payload restarts the
 * wait; "Wait" pauses it. Visitors and staff never auto-send.
 */
export function useAutoRequest({ payload, ready, viewerRole, startOnHold }: {
  payload: unknown;
  ready: boolean;
  viewerRole: Viewer;
  /** A restored draft waits for the traveler instead of sending on page load. */
  startOnHold: boolean;
}) {
  const router = useRouter();
  const signature = JSON.stringify(payload);
  const [hold, setHold] = useState(startOnHold);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submitted = useRef(false);

  const send = async () => {
    if (submitted.current || !ready || viewerRole !== 'customer') return;
    submitted.current = true;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: signature,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : 'Check the trip details.');
      }
      const { id } = await res.json();
      router.push(`/requests/${id}?submitted=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      submitted.current = false;
      setHold(true);
    } finally {
      setLoading(false);
    }
  };

  const auto = viewerRole === 'customer' && ready && !hold && !loading;
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => { void send(); }, AUTO_SEND_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature captures every input
  }, [auto, signature]);

  return { signature, hold, setHold, loading, error, setError, send };
}

/** Status strip for the automatic request: countdown, Wait, Send now. */
export function AutoRequestBar({ state, ready, viewerRole }: {
  state: ReturnType<typeof useAutoRequest>;
  ready: boolean;
  viewerRole: Viewer;
}) {
  const { loading, hold, setHold, send, signature } = state;
  if (!ready || viewerRole === null) return null;
  if (viewerRole !== 'customer') {
    return <Notice tone="warning">You are signed in as an operator or admin. Sign in with a traveler account to request quotes.</Notice>;
  }
  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-md border border-royal bg-surface-raised px-4 py-3 text-body text-ink">
        <Send size={16} strokeWidth={1.5} aria-hidden="true" className="text-royal" /> Sending your trip to operators…
      </p>
    );
  }
  if (hold) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-surface-raised px-4 py-3">
        <span className="text-body text-ink-muted">Paused. Edit anything, then send.</span>
        <Button id="request-quotes" type="button" size="sm" onClick={() => void send()}>Request quotes now</Button>
      </div>
    );
  }
  return (
    <div id="auto-request" className="overflow-hidden rounded-md border border-royal bg-surface-raised">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-body text-ink">
          <Send size={16} strokeWidth={1.5} aria-hidden="true" className="text-royal" />
          Requesting quotes in a moment. Changes restart the timer.
        </span>
        <span className="flex items-center gap-1">
          <Button type="button" variant="quiet" size="sm" onClick={() => setHold(true)}>Wait</Button>
          <Button id="request-quotes" type="button" size="sm" onClick={() => void send()}>Send now</Button>
        </span>
      </div>
      <div aria-hidden="true" className="h-1 bg-surface-sunken">
        <div key={signature} className="countdown-bar h-full bg-royal" style={{ ['--countdown' as string]: `${AUTO_SEND_MS}ms` }} />
      </div>
    </div>
  );
}

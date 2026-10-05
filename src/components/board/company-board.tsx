'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { TripDetails } from '@/components/booking/trip-details';
import { formatTripDate } from '@/lib/trip-format';
import type { Board, BoardTrip } from '@/lib/board/data';

const REFRESH_MS = 15_000;

type SectionKey = 'upcoming' | 'toQuote' | 'awaitingClient' | 'cancelled';

const SECTIONS: { key: SectionKey; title: string; empty: string }[] = [
  { key: 'upcoming', title: 'Upcoming charters', empty: 'No booked charters coming up.' },
  { key: 'toQuote', title: 'New requests to quote', empty: 'No new requests waiting for a quote.' },
  { key: 'awaitingClient', title: 'Quoted, awaiting client', empty: 'No quotes waiting on a client.' },
  { key: 'cancelled', title: 'Recently cancelled', empty: 'No cancellations in the last 14 days.' },
];

const tripKey = (section: SectionKey, t: BoardTrip) => `${section}:${t.requestId}:${t.updatedAt}`;

/**
 * Live company board. Polls `source` every 15 s (paused while the tab is
 * hidden, refreshed as soon as it is visible again) and marks charters that
 * appeared or changed since the page was opened.
 */
export function CompanyBoard({ source, linkTrips }: { source: string; linkTrips: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch(source, { cache: 'no-store' });
      if (!res.ok) {
        setError(res.status === 404 ? 'This board link is no longer active.' : 'Could not refresh the board.');
        return;
      }
      const data = (await res.json()) as Board;
      const keys = SECTIONS.flatMap(s => data[s.key].map(t => tripKey(s.key, t)));
      if (seen.current) {
        const added = keys.filter(k => !seen.current!.has(k));
        if (added.length) setFresh(prev => new Set([...prev, ...added]));
      }
      seen.current = new Set([...(seen.current ?? []), ...keys]);
      setBoard(data);
      setError('');
    } catch {
      setError('Could not refresh the board. Retrying.');
    }
  }, [source]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    const clock = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    const count = fresh.size;
    document.title = count ? `(${count}) Company board` : 'Company board';
  }, [fresh]);

  if (!board) {
    return <p className="text-ink-muted">{error || 'Loading board…'}</p>;
  }

  const ago = Math.max(0, Math.round((now - new Date(board.generatedAt).getTime()) / 1000));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(s => (
            <a key={s.key} href={`#${s.key}`} className="rounded-full border border-hairline px-3 py-1 text-xs text-ink hover:border-border-control">
              {s.title} <span className="text-brass-ink">{board[s.key].length}</span>
            </a>
          ))}
        </div>
        <p className="text-xs text-ink-muted" aria-live="polite">
          {error ? <span className="text-danger">{error}</span> : <>Live · updated {ago < 5 ? 'just now' : `${ago}s ago`}</>}
          {fresh.size > 0 && (
            <button type="button" onClick={() => setFresh(new Set())} className="ml-3 text-brass-ink hover:underline cursor-pointer">
              Mark {fresh.size} as seen
            </button>
          )}
        </p>
      </div>

      <div className="space-y-10">
        {SECTIONS.map(s => (
          <section key={s.key} id={s.key} aria-labelledby={`${s.key}-title`}>
            <h2 id={`${s.key}-title`} className="font-display text-xl text-ink mb-4">
              {s.title} <span className="text-ink-muted text-sm font-normal">({board[s.key].length})</span>
            </h2>
            {board[s.key].length === 0 ? (
              <p className="text-ink-muted text-sm">{s.empty}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {board[s.key].map(trip => {
                  const isNew = fresh.has(tripKey(s.key, trip));
                  const departsToday = trip.legs.some(l => l.date === today);
                  const card = (
                    <div className={`h-full rounded-lg border bg-surface-raised p-5 ${isNew ? 'border-brass' : 'border-hairline'} ${linkTrips ? 'hover:border-border-control transition-colors' : ''}`}>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-xs text-ink-muted">#{trip.requestId}</span>
                        <div className="flex gap-1.5">
                          {isNew && <Badge variant="gold">{s.key === 'upcoming' || s.key === 'cancelled' ? 'Updated' : 'New'}</Badge>}
                          {departsToday && s.key === 'upcoming' && <Badge variant="warning">Departs today</Badge>}
                          {s.key === 'cancelled' && <Badge variant="error">Cancelled</Badge>}
                        </div>
                      </div>
                      <TripDetails compact legs={trip.legs} passengerCount={trip.passengerCount} notes={trip.specialRequests} />
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm mt-2">
                        {trip.aircraft && (<><dt className="text-ink-muted">Aircraft</dt><dd className="text-ink">{trip.aircraft}</dd></>)}
                        {trip.quoteCents != null && (<><dt className="text-ink-muted">Quote</dt><dd className="text-ink">${(trip.quoteCents / 100).toLocaleString()}</dd></>)}
                        {trip.leadPassenger && (
                          <>
                            <dt className="text-ink-muted">Lead passenger</dt>
                            <dd className="text-ink">
                              {trip.leadPassenger.name}
                              {trip.leadPassenger.phone && <> · <a href={`tel:${trip.leadPassenger.phone}`} className="hover:text-brass-ink">{trip.leadPassenger.phone}</a></>}
                            </dd>
                          </>
                        )}
                      </dl>
                      {s.key === 'cancelled' && (
                        <p className="text-xs text-ink-muted mt-2">Cancelled {formatTripDate(trip.updatedAt.slice(0, 10))}</p>
                      )}
                    </div>
                  );
                  return linkTrips
                    ? <Link key={trip.requestId} href={`/operator/requests/${trip.requestId}`} className="block">{card}</Link>
                    : <div key={trip.requestId}>{card}</div>;
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { SubmitQuoteForm, type QuoteDraft } from '@/components/booking/submit-quote-form';
import { Bot } from 'lucide-react';
import { displayCode } from '@/lib/airports';
import type { BookingLeg, Aircraft } from '@/lib/types';

interface InboundRFQ {
  outreach_id: number;
  request_id: number;
  match_score: number;
  rfq_subject: string;
  rfq_body: string;
  outreach_status: string;
  sent_at: string;
  responded_at: string | null;
  passenger_count: number;
  request_notes: string | null;
  request_status: string;
  request_created_at: string;
  quote_id: number | null;
  quote_price: number | null;
  quote_status: string | null;
  legs: BookingLeg[];
  /** Autopilot draft waiting for review. */
  draft: QuoteDraft | null;
  /** The operator's own listed empty legs that fit this request. */
  empty_legs: { id: number; price_cents: number; departure_date: string; aircraft_type: string | null }[];
}

export default function OperatorInboundPage() {
  const router = useRouter();
  const [rfqs, setRfqs] = useState<InboundRFQ[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/operator/inbound').then(r => r.json()),
      fetch('/api/fleet').then(r => r.json()),
    ]).then(([rfqData, fleetData]) => {
      setRfqs(rfqData);
      setAircraft(fleetData);
      setLoading(false);
      // ?review=<requestId> (from the Autopilot console) opens that request's form.
      const review = Number(new URLSearchParams(window.location.search).get('review'));
      if (review) {
        setExpandedId(review);
        setTimeout(() => document.getElementById(`rfq-${review}`)?.scrollIntoView({ block: 'start' }), 50);
      }
    });
  }, []);

  const refresh = async () => {
    setRfqs(await fetch('/api/operator/inbound').then(r => r.json()));
    setExpandedId(null);
  };

  const pending = rfqs.filter(r => !r.quote_id && r.request_status !== 'booked' && r.request_status !== 'cancelled');
  const quoted = rfqs.filter(r => r.quote_id);

  if (loading) return <div className="text-ink-muted p-10">Loading inbound requests...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl text-ink mb-2">Inbound Requests</h1>
          <p className="text-ink-muted">
            Charter requests matched to your operator profile. {pending.length > 0 && (
              <span className="text-royal">{pending.length} awaiting your quote.</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge variant="brass">{pending.length} new</StatusBadge>
          <StatusBadge variant="neutral">{quoted.length} quoted</StatusBadge>
        </div>
      </div>

      {rfqs.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-ink-muted mb-4">No inbound requests yet.</p>
            <p className="text-ink-muted text-sm">
              Make sure your <a href="/operator/settings" className="text-royal hover:underline">operator profile</a> is configured with your markets and fleet types so the matching engine can route requests to you.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Pending quotes first */}
          {pending.length > 0 && (
            <>
              <h2 className="text-xs font-semibold text-royal uppercase tracking-wider mt-6 mb-3">Awaiting Your Quote</h2>
              {pending.map(rfq => (
                <RFQCard
                  key={rfq.outreach_id}
                  rfq={rfq}
                  aircraft={aircraft}
                  expanded={expandedId === rfq.request_id}
                  onToggle={() => setExpandedId(expandedId === rfq.request_id ? null : rfq.request_id)}
                  onSubmitted={refresh}
                  onViewDetails={() => router.push(`/operator/requests/${rfq.request_id}`)}
                />
              ))}
            </>
          )}

          {/* Already quoted */}
          {quoted.length > 0 && (
            <>
              <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mt-8 mb-3">Quoted</h2>
              {quoted.map(rfq => (
                <RFQCard
                  key={rfq.outreach_id}
                  rfq={rfq}
                  aircraft={aircraft}
                  expanded={false}
                  onToggle={() => {}}
                  onSubmitted={() => {}}
                  onViewDetails={() => router.push(`/operator/requests/${rfq.request_id}`)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RFQCard({
  rfq,
  aircraft,
  expanded,
  onToggle,
  onSubmitted,
  onViewDetails,
}: {
  rfq: InboundRFQ;
  aircraft: Aircraft[];
  expanded: boolean;
  onToggle: () => void;
  onSubmitted: () => void;
  onViewDetails: () => void;
}) {
  const legs = rfq.legs as BookingLeg[];
  const route = legs.map(l => l.origin_code).concat(legs[legs.length - 1]?.dest_code).filter(Boolean).map(displayCode).join(' → ');
  const dateRange = legs.length > 0
    ? `${legs[0].departure_date}${legs.length > 1 ? ` — ${legs[legs.length - 1].departure_date}` : ''}`
    : '';
  const timeAgo = getTimeAgo(rfq.sent_at);
  const hasQuote = !!rfq.quote_id;
  const [legError, setLegError] = useState('');
  const [legBusy, setLegBusy] = useState(false);

  const quoteWithListing = async (legId: number) => {
    setLegBusy(true);
    setLegError('');
    const res = await fetch(`/api/operator/empty-legs/${legId}/quote`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: rfq.request_id }),
    });
    if (res.ok) onSubmitted();
    else setLegError((await res.json().catch(() => ({}))).error ?? 'Could not quote with this listing');
    setLegBusy(false);
  };

  const quoteBadge: Record<string, 'confirmed' | 'warning' | 'danger' | 'neutral'> = {
    pending: 'warning',
    accepted: 'confirmed',
    rejected: 'danger',
    withdrawn: 'neutral',
    expired: 'neutral',
  };

  return (
    <Card id={`rfq-${rfq.request_id}`} className={`scroll-mt-6 ${!hasQuote ? 'border-brass' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-ink font-mono tracking-wide text-lg">{route}</span>
            <span className="text-ink-subtle text-xs bg-surface-raised rounded px-2 py-0.5">
              Score: {rfq.match_score}
            </span>
          </div>
          <p className="text-ink-muted text-xs">
            {legs.length} leg{legs.length !== 1 ? 's' : ''} · {rfq.passenger_count} pax · {dateRange}
          </p>
          {rfq.request_notes && (
            <p className="text-ink-muted text-xs mt-1 italic">{rfq.request_notes}</p>
          )}
          <p className="text-ink-subtle text-xs mt-1">Received {timeAgo}</p>
        </div>

        <div className="flex items-center gap-3">
          {hasQuote ? (
            <div className="text-right">
              <p className="text-royal font-display text-lg">${((rfq.quote_price || 0) / 100).toLocaleString()}</p>
              <StatusBadge variant={quoteBadge[rfq.quote_status || 'pending'] ?? 'neutral'}>
                {rfq.quote_status}
              </StatusBadge>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {rfq.draft && !expanded && (
                <span className="inline-flex items-center gap-1.5 text-label text-royal">
                  <Bot size={14} strokeWidth={1.5} aria-hidden="true" /> Draft ${Math.round(rfq.draft.priceCents / 100).toLocaleString()}
                </span>
              )}
              <Button onClick={onToggle} size="sm">
                {expanded ? 'Cancel' : rfq.draft ? 'Review draft' : 'Quote Now'}
              </Button>
            </div>
          )}
          <button
            onClick={onViewDetails}
            className="text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            Details →
          </button>
        </div>
      </div>

      {/* Leg details */}
      <div className="mt-3 flex flex-wrap gap-2">
        {legs.map((leg, i) => (
          <span key={i} className="text-xs rounded bg-surface-sunken px-2 py-1 text-ink-muted font-mono">
            {displayCode(leg.origin_code)}→{displayCode(leg.dest_code)} {leg.departure_date}{leg.departure_time ? ` @${leg.departure_time}` : ''}
          </span>
        ))}
      </div>

      {/* A listed empty leg fits this request: quote it at the listed price in one click. */}
      {!hasQuote && rfq.empty_legs.length > 0 && (
        <div className="mt-4 rounded-md border border-brass bg-surface-sunken px-4 py-3">
          <p className="text-label text-ink">You have an empty leg on this route.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {rfq.empty_legs.map(l => (
              <li key={l.id}>
                <Button size="sm" variant="secondary" disabled={legBusy} onClick={() => quoteWithListing(l.id)}>
                  Quote ${Math.round(l.price_cents / 100).toLocaleString()} · {l.departure_date}{l.aircraft_type ? ` · ${l.aircraft_type}` : ''}
                </Button>
              </li>
            ))}
          </ul>
          {legError && <p role="alert" className="mt-2 text-label text-danger">Error: {legError}</p>}
        </div>
      )}

      {/* Inline quote form, with the private price worksheet */}
      {expanded && !hasQuote && (
        <div className="mt-5 border-t border-hairline pt-5">
          <SubmitQuoteForm requestId={rfq.request_id} aircraft={aircraft} legs={legs}
            passengerCount={rfq.passenger_count} onSubmitted={onSubmitted} draft={rfq.draft} />
        </div>
      )}
    </Card>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

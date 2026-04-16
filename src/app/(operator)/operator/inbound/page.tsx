'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    });
  }, []);

  const submitQuote = async (requestId: number, form: HTMLFormElement) => {
    const formData = new FormData(form);
    const price = parseFloat(formData.get('price') as string);
    if (isNaN(price) || price <= 0) return;

    const res = await fetch(`/api/booking-requests/${requestId}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceCents: Math.round(price * 100),
        aircraftId: formData.get('aircraftId') ? Number(formData.get('aircraftId')) : undefined,
        message: formData.get('message') || undefined,
        validUntil: formData.get('validUntil') || undefined,
      }),
    });

    if (res.ok) {
      // Refresh data
      const updated = await fetch('/api/operator/inbound').then(r => r.json());
      setRfqs(updated);
      setExpandedId(null);
    }
  };

  const pending = rfqs.filter(r => !r.quote_id && r.request_status !== 'booked' && r.request_status !== 'cancelled');
  const quoted = rfqs.filter(r => r.quote_id);

  if (loading) return <div className="text-brand-muted p-10">Loading inbound requests...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl text-brand-cream mb-2">Inbound Requests</h1>
          <p className="text-brand-muted">
            Charter requests matched to your operator profile. {pending.length > 0 && (
              <span className="text-brand-gold">{pending.length} awaiting your quote.</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="gold">{pending.length} new</Badge>
          <Badge variant="default">{quoted.length} quoted</Badge>
        </div>
      </div>

      {rfqs.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-brand-muted mb-4">No inbound requests yet.</p>
            <p className="text-brand-cream/60 text-sm">
              Make sure your <a href="/operator/settings" className="text-brand-gold hover:underline">operator profile</a> is configured with your markets and fleet types so the matching engine can route requests to you.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Pending quotes first */}
          {pending.length > 0 && (
            <>
              <h2 className="text-xs font-semibold text-brand-gold uppercase tracking-wider mt-6 mb-3">Awaiting Your Quote</h2>
              {pending.map(rfq => (
                <RFQCard
                  key={rfq.outreach_id}
                  rfq={rfq}
                  aircraft={aircraft}
                  expanded={expandedId === rfq.request_id}
                  onToggle={() => setExpandedId(expandedId === rfq.request_id ? null : rfq.request_id)}
                  onSubmit={(form) => submitQuote(rfq.request_id, form)}
                  onViewDetails={() => router.push(`/operator/requests/${rfq.request_id}`)}
                />
              ))}
            </>
          )}

          {/* Already quoted */}
          {quoted.length > 0 && (
            <>
              <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mt-8 mb-3">Quoted</h2>
              {quoted.map(rfq => (
                <RFQCard
                  key={rfq.outreach_id}
                  rfq={rfq}
                  aircraft={aircraft}
                  expanded={false}
                  onToggle={() => {}}
                  onSubmit={() => {}}
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
  onSubmit,
  onViewDetails,
}: {
  rfq: InboundRFQ;
  aircraft: Aircraft[];
  expanded: boolean;
  onToggle: () => void;
  onSubmit: (form: HTMLFormElement) => void;
  onViewDetails: () => void;
}) {
  const legs = rfq.legs as BookingLeg[];
  const route = legs.map(l => l.origin_code).concat(legs[legs.length - 1]?.dest_code).filter(Boolean).join(' → ');
  const dateRange = legs.length > 0
    ? `${legs[0].departure_date}${legs.length > 1 ? ` — ${legs[legs.length - 1].departure_date}` : ''}`
    : '';
  const timeAgo = getTimeAgo(rfq.sent_at);
  const hasQuote = !!rfq.quote_id;

  const quoteBadge: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    pending: 'warning',
    accepted: 'success',
    rejected: 'error',
  };

  return (
    <Card className={`${!hasQuote ? 'border-brand-gold/20' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-brand-cream font-mono tracking-wide text-lg">{route}</span>
            <span className="text-brand-muted/50 text-xs bg-brand-navy rounded px-2 py-0.5">
              Score: {rfq.match_score}
            </span>
          </div>
          <p className="text-brand-muted text-xs">
            {legs.length} leg{legs.length !== 1 ? 's' : ''} · {rfq.passenger_count} pax · {dateRange}
          </p>
          {rfq.request_notes && (
            <p className="text-brand-cream/60 text-xs mt-1 italic">{rfq.request_notes}</p>
          )}
          <p className="text-brand-muted/40 text-xs mt-1">Received {timeAgo}</p>
        </div>

        <div className="flex items-center gap-3">
          {hasQuote ? (
            <div className="text-right">
              <p className="text-brand-gold font-display text-lg">${((rfq.quote_price || 0) / 100).toLocaleString()}</p>
              <Badge variant={quoteBadge[rfq.quote_status || 'pending']}>
                {rfq.quote_status}
              </Badge>
            </div>
          ) : (
            <Button onClick={onToggle} size="sm">
              {expanded ? 'Cancel' : 'Quote Now'}
            </Button>
          )}
          <button
            onClick={onViewDetails}
            className="text-xs text-brand-muted hover:text-brand-cream transition-colors cursor-pointer"
          >
            Details →
          </button>
        </div>
      </div>

      {/* Leg details */}
      <div className="mt-3 flex flex-wrap gap-2">
        {legs.map((leg, i) => (
          <span key={i} className="text-xs rounded bg-brand-navy/70 px-2 py-1 text-brand-cream/70 font-mono">
            {leg.origin_code}→{leg.dest_code} {leg.departure_date}{leg.departure_time ? ` @${leg.departure_time}` : ''}
          </span>
        ))}
      </div>

      {/* Inline quote form */}
      {expanded && !hasQuote && (
        <form
          className="mt-5 pt-5 border-t border-brand-border"
          onSubmit={e => { e.preventDefault(); onSubmit(e.currentTarget); }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input name="price" label="Total Price (USD)" type="number" step="0.01" min="0" placeholder="25000" required />
            <div>
              <label className="block text-sm font-medium text-brand-muted mb-1.5">Aircraft</label>
              <select
                name="aircraftId"
                className="w-full rounded-lg border border-brand-border bg-brand-navy px-3 py-2.5 text-brand-cream text-sm focus:border-brand-gold focus:outline-none transition-colors"
              >
                <option value="">Optional</option>
                {aircraft.map(a => (
                  <option key={a.id} value={a.id}>{a.type} ({a.tail_number})</option>
                ))}
              </select>
            </div>
            <Input name="validUntil" label="Valid Until" type="date" />
            <div className="flex items-end">
              <Button type="submit" className="w-full">Submit Quote</Button>
            </div>
          </div>
          <div className="mt-3">
            <textarea
              name="message"
              rows={2}
              placeholder="Optional message: describe your offer, amenities, etc."
              className="w-full rounded-lg border border-brand-border bg-brand-navy px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted/50 focus:border-brand-gold focus:outline-none transition-colors resize-none"
            />
          </div>
        </form>
      )}
    </Card>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z')).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

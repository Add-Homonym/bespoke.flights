'use client';

import { useState, useEffect } from 'react';
import { StatusBadge } from '@/components/ui/status-badge';
import { plural } from '@/lib/plural';

interface OutreachEntry {
  id: number;
  company_name: string;
  status: string;
  quote_id: number | null;
  quote_price: number | null;
}

const statusBadge: Record<string, 'neutral' | 'confirmed' | 'warning'> = {
  queued: 'neutral',
  sent: 'warning',
  delivered: 'warning',
  responded: 'confirmed',
};

/** What the traveler is told about each operator asked to quote. */
const statusLabel: Record<string, string> = {
  queued: 'Request queued',
  sent: 'Request sent',
  delivered: 'Request delivered',
  responded: 'Replied',
};

export function OutreachStatus({ requestId }: { requestId: number }) {
  const [entries, setEntries] = useState<OutreachEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/outreach?requestId=${requestId}`)
      .then(r => r.json())
      .then(data => { setEntries(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [requestId]);

  // A delivery that failed is the platform's problem, not something to show a traveler.
  const asked = entries.filter(e => e.status !== 'failed');
  if (loading || asked.length === 0) return null;

  const responded = asked.filter(e => e.quote_id);
  const pending = asked.filter(e => !e.quote_id);

  return (
    <div className="rounded-lg border border-hairline bg-surface-raised p-6 mb-8">
      <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-4">
        Operators asked
        <span className="text-ink-muted font-normal ml-2">
          {plural(asked.length, 'operator')} contacted
        </span>
      </h2>

      <div className="space-y-2">
        {asked.map(entry => (
          <div key={entry.id} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
            <div className="flex items-center gap-3">
              <div aria-hidden="true" className={`w-2 h-2 rounded-full ${entry.quote_id ? 'bg-confirmed' : 'bg-warning'}`} />
              <span className="text-ink text-sm">{entry.company_name}</span>
            </div>
            <div className="flex items-center gap-3">
              {entry.quote_id ? (
                <StatusBadge variant="confirmed">Quoted ${((entry.quote_price || 0) / 100).toLocaleString()}</StatusBadge>
              ) : (
                <StatusBadge variant={statusBadge[entry.status] || 'neutral'}>{statusLabel[entry.status] ?? 'Request sent'}</StatusBadge>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-4 text-xs text-ink-muted">
        <span>{responded.length} replied</span>
        <span>{pending.length} awaiting a reply</span>
      </div>
    </div>
  );
}

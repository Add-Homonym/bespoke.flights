'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';

interface OutreachEntry {
  id: number;
  request_id: number;
  operator_id: number;
  company_name: string;
  contact_method: string;
  match_score: number;
  status: string;
  sent_at: string;
  responded_at: string | null;
  quote_id: number | null;
  quote_price: number | null;
  quote_status: string | null;
}

const statusBadge: Record<string, 'default' | 'success' | 'warning' | 'gold'> = {
  queued: 'default',
  sent: 'warning',
  delivered: 'warning',
  responded: 'success',
  failed: 'default',
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

  if (loading) return null;
  if (entries.length === 0) return null;

  const responded = entries.filter(e => e.quote_id);
  const pending = entries.filter(e => !e.quote_id && e.status !== 'failed');

  return (
    <div className="rounded-xl border border-brand-border bg-brand-card p-6 mb-8">
      <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-4">
        Operator Outreach
        <span className="text-brand-cream/50 font-normal ml-2">
          {entries.length} operators contacted
        </span>
      </h2>

      <div className="space-y-2">
        {entries.map(entry => (
          <div key={entry.id} className="flex items-center justify-between py-2 border-b border-brand-border/30 last:border-0">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${entry.quote_id ? 'bg-brand-success' : entry.status === 'sent' ? 'bg-brand-warning' : 'bg-brand-muted/30'}`} />
              <div>
                <span className="text-brand-cream text-sm">{entry.company_name}</span>
                <span className="text-brand-muted/50 text-xs ml-2">
                  via {entry.contact_method}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-brand-muted/50 text-xs">Score: {entry.match_score}</span>
              {entry.quote_id ? (
                <Badge variant="success">Quoted ${((entry.quote_price || 0) / 100).toLocaleString()}</Badge>
              ) : (
                <Badge variant={statusBadge[entry.status] || 'default'}>{entry.status}</Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-4 text-xs text-brand-muted">
        <span>{responded.length} responded</span>
        <span>{pending.length} awaiting response</span>
      </div>
    </div>
  );
}

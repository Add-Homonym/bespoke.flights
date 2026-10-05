'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface DiscoveredOperator {
  id: number;
  company_name: string;
  dba_name: string | null;
  certificate_number: string | null;
  contact_email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string;
  source: string;
  discovered_at: string;
  updated_at: string;
  emailed_at: string | null;
  invite_resend_id: string | null;
  notes: string | null;
}

interface Stats {
  total: number;
  new_count: number;
  no_email_count: number;
  emailed_count: number;
  registered_count: number;
  opted_out_count: number;
  bounced_count: number;
}

const statusBadge: Record<string, 'default' | 'success' | 'warning' | 'error' | 'gold'> = {
  new: 'gold',
  no_email: 'warning',
  emailed: 'success',
  registered: 'success',
  opted_out: 'default',
  bounced: 'error',
};

function DiscoveriesContent() {
  const searchParams = useSearchParams();

  const [data, setData] = useState<DiscoveredOperator[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') || '');
  const [search, setSearch] = useState(searchParams.get('q') || '');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState('');

  const [cronRunning, setCronRunning] = useState(false);
  const [cronResult, setCronResult] = useState<string | null>(null);

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (stateFilter) params.set('state', stateFilter);
    if (search) params.set('q', search);
    params.set('page', String(page));
    params.set('limit', '50');

    const res = await fetch('/api/admin/discoveries?' + params.toString());
    if (res.ok) {
      const json = await res.json();
      setData(json.data);
      setStats(json.stats);
      setPagination(json.pagination);
    }
    setLoading(false);
  }, [statusFilter, stateFilter, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount and when filters change
  useEffect(() => { fetchData(); }, [fetchData]);

  const updateOperator = async (id: number, patch: Record<string, unknown>) => {
    const res = await fetch('/api/admin/discoveries', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) {
      await fetchData(pagination.page);
      setEditingId(null);
      setEditEmail('');
    }
  };

  const triggerCron = async () => {
    setCronRunning(true);
    setCronResult(null);
    try {
      const res = await fetch('/api/cron/weekly-discovery', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setCronResult(
          `Found ${json.operatorsFound} operators in ${json.statesQueried?.length || 0} states. ` +
          `${json.newOperators} new. ${json.emailsSent} emails sent.`
        );
        await fetchData();
      } else {
        setCronResult('Error: ' + (json.error || 'Unknown'));
      }
    } catch {
      setCronResult('Request failed');
    }
    setCronRunning(false);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl text-ink mb-2">Operator Discovery</h1>
          <p className="text-ink-muted">FAA Part 135 operators found via registry scrape. Add emails to trigger invite outreach.</p>
        </div>
        <Button onClick={triggerCron} disabled={cronRunning} size="sm">
          {cronRunning ? 'Running...' : 'Run Discovery Now'}
        </Button>
      </div>

      {cronResult && (
        <Card className="mb-6 border-hairline bg-surface-sunken">
          <p className="text-ink text-sm">{cronResult}</p>
        </Card>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mb-8">
          {[
            { label: 'Total', value: stats.total, filter: '' },
            { label: 'Ready', value: stats.new_count, filter: 'new' },
            { label: 'Need Email', value: stats.no_email_count, filter: 'no_email' },
            { label: 'Invited', value: stats.emailed_count, filter: 'emailed' },
            { label: 'Registered', value: stats.registered_count, filter: 'registered' },
            { label: 'Opted Out', value: stats.opted_out_count, filter: 'opted_out' },
            { label: 'Bounced', value: stats.bounced_count, filter: 'bounced' },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => setStatusFilter(s.filter)}
              className={`rounded-md border px-3 py-2 text-center transition-colors cursor-pointer ${
                statusFilter === s.filter
                  ? 'border-brass bg-surface-sunken'
                  : 'border-hairline hover:border-border-control'
              }`}
            >
              <p className="text-ink font-display text-xl">{s.value}</p>
              <p className="text-ink-muted text-xs">{s.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search company name or cert number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-hairline bg-surface-raised px-4 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none transition-colors"
        />
        <input
          type="text"
          placeholder="State"
          value={stateFilter}
          onChange={e => setStateFilter(e.target.value.toUpperCase())}
          maxLength={2}
          className="w-20 rounded-md border border-hairline bg-surface-raised px-3 py-2.5 text-sm text-ink text-center placeholder:text-ink-subtle focus:outline-none transition-colors"
        />
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-ink-muted p-10">Loading...</div>
      ) : data.length === 0 ? (
        <Card>
          <p className="text-ink-muted text-center py-12">
            No discovered operators{statusFilter ? ` with status "${statusFilter}"` : ''}.
            {!stats?.total && ' Run the discovery pipeline to scrape the FAA registry.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {data.map(op => (
              <Card key={op.id} className={op.status === 'no_email' ? 'border-warning' : ''}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-ink font-semibold truncate">{op.company_name}</h3>
                      {op.dba_name && <span className="text-ink-muted text-xs">DBA: {op.dba_name}</span>}
                      <Badge variant={statusBadge[op.status] || 'default'}>{op.status}</Badge>
                    </div>
                    <p className="text-ink-muted text-xs">
                      {[op.city, op.state, op.zip].filter(Boolean).join(', ')}
                      {op.certificate_number && <> &middot; Cert: {op.certificate_number}</>}
                    </p>
                    {op.contact_email && (
                      <p className="text-ink-muted text-xs mt-1">{op.contact_email}</p>
                    )}
                    {op.phone && (
                      <p className="text-ink-subtle text-xs">{op.phone}</p>
                    )}
                    {op.emailed_at && (
                      <p className="text-ink-subtle text-xs mt-1">Invited {new Date(op.emailed_at).toLocaleDateString()}</p>
                    )}
                    {op.notes && (
                      <p className="text-ink-subtle text-xs mt-1 italic">{op.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {!op.contact_email && op.status === 'no_email' && editingId !== op.id && (
                      <Button size="sm" onClick={() => { setEditingId(op.id); setEditEmail(''); }}>
                        Add Email
                      </Button>
                    )}
                    {op.status !== 'opted_out' && op.status !== 'registered' && (
                      <button
                        onClick={() => updateOperator(op.id, { status: 'opted_out' })}
                        className="text-xs text-ink-subtle hover:text-danger transition-colors cursor-pointer"
                      >
                        Opt out
                      </button>
                    )}
                  </div>
                </div>

                {editingId === op.id && (
                  <div className="mt-3 pt-3 border-t border-hairline flex gap-2">
                    <input
                      type="email"
                      placeholder="charter@company.com"
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      autoFocus
                      className="flex-1 rounded-md border border-hairline bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:outline-none transition-colors"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (editEmail) updateOperator(op.id, { contact_email: editEmail });
                      }}
                      disabled={!editEmail}
                    >
                      Save
                    </Button>
                    <button
                      onClick={() => { setEditingId(null); setEditEmail(''); }}
                      className="text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer px-2"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-ink-muted text-xs">
                Page {pagination.page} of {pagination.pages} ({pagination.total} total)
              </p>
              <div className="flex gap-2">
                <Button size="sm" disabled={pagination.page <= 1} onClick={() => fetchData(pagination.page - 1)}>
                  ← Prev
                </Button>
                <Button size="sm" disabled={pagination.page >= pagination.pages} onClick={() => fetchData(pagination.page + 1)}>
                  Next →
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminDiscoveriesPage() {
  return (
    <Suspense fallback={<div className="text-ink-muted p-10">Loading...</div>}>
      <DiscoveriesContent />
    </Suspense>
  );
}

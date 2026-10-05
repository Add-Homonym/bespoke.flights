'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Aircraft } from '@/lib/types';

export default function FleetPage() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadFleet = async () => {
    const res = await fetch('/api/fleet');
    if (res.ok) setAircraft(await res.json());
  };

  useEffect(() => { loadFleet(); }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const body = {
      tailNumber: formData.get('tailNumber'),
      type: formData.get('type'),
      capacity: Number(formData.get('capacity')),
      rangeNm: formData.get('rangeNm') ? Number(formData.get('rangeNm')) : undefined,
      year: formData.get('year') ? Number(formData.get('year')) : undefined,
    };

    try {
      const res = await fetch('/api/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setError('Failed to add aircraft');
        return;
      }

      setShowForm(false);
      (e.target as HTMLFormElement).reset();
      await loadFleet();
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl text-ink mb-2">Fleet Management</h1>
          <p className="text-ink-muted">Manage your aircraft available for charter.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} variant={showForm ? 'secondary' : 'primary'}>
          {showForm ? 'Cancel' : 'Add Aircraft'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-8">
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-6">New Aircraft</h2>
          {error && (
            <div className="rounded-md bg-danger-tint border border-danger px-4 py-3 text-sm text-danger mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Input name="type" label="Aircraft Type" placeholder="Gulfstream G650" required />
            <Input name="tailNumber" label="Tail Number" placeholder="N123AB" required />
            <Input name="capacity" label="Passenger Capacity" type="number" min={1} required />
            <Input name="rangeNm" label="Range (NM)" type="number" placeholder="7000" />
            <Input name="year" label="Year" type="number" placeholder="2020" />
            <div className="flex items-end">
              <Button type="submit" disabled={loading} block>
                {loading ? 'Adding...' : 'Add Aircraft'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {aircraft.length === 0 ? (
        <Card>
          <p className="text-ink-muted text-center py-12">No aircraft in your fleet. Add your first aircraft to start quoting.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {aircraft.map(a => (
            <Card key={a.id}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-ink font-semibold text-lg">{a.type}</h3>
                  <p className="text-brass-ink font-mono text-sm mt-1">{a.tail_number}</p>
                </div>
                <span className="text-ink-muted text-sm">{a.year || '—'}</span>
              </div>
              <div className="mt-4 flex gap-4 text-sm text-ink-muted">
                <span>{a.capacity} seats</span>
                {a.range_nm && <span>&middot; {a.range_nm.toLocaleString()} NM range</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

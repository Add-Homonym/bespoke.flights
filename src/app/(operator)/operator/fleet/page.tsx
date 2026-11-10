'use client';

import { useEffect, useState } from 'react';
import { Camera, FileSearch, Pencil, Plane, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { AircraftForm, fieldErrors } from '@/components/fleet/aircraft-form';
import { PhotoManager, photoUrl } from '@/components/fleet/photo-manager';
import { RegistrySummary } from '@/components/fleet/registry-summary';
import { normalizeNNumber } from '@/lib/faa/registry';
import type { AircraftView } from '@/lib/fleet';

type Panel = 'edit' | 'photos' | 'registry' | null;

async function errorOf(res: Response) {
  const body = await res.json().catch(() => null);
  return { body, message: typeof body?.error === 'string' ? body.error : undefined };
}

function AircraftCard({ a, onChange, onRemoved }: { a: AircraftView; onChange: (a: AircraftView) => void; onRemoved: () => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const cover = a.photos[0];
  const usTail = !!normalizeNNumber(a.tail_number);
  const toggle = (p: Panel) => { setError(''); setConfirmRemove(false); setPanel(cur => (cur === p ? null : p)); };

  const checkRegistry = async () => {
    setChecking(true);
    setError('');
    const res = await fetch(`/api/fleet/${a.id}/faa`, { method: 'POST' });
    if (res.ok) { onChange(await res.json()); setPanel('registry'); } else setError((await errorOf(res)).message ?? 'Lookup failed');
    setChecking(false);
  };

  const remove = async () => {
    const res = await fetch(`/api/fleet/${a.id}`, { method: 'DELETE' });
    if (res.ok) onRemoved(); else { setConfirmRemove(false); setError((await errorOf(res)).message ?? 'Could not remove'); }
  };

  const tab = (p: Exclude<Panel, null>, label: string, Icon: typeof Pencil) => (
    <button type="button" aria-expanded={panel === p} aria-controls={`aircraft-${a.id}-${p}`} onClick={() => toggle(p)}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-label transition-colors duration-200 ease-out cursor-pointer hover:bg-surface-sunken ${panel === p ? 'bg-surface-sunken text-royal' : 'text-ink'}`}>
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" /> {label}
    </button>
  );

  const reg = a.faa_record;
  const regFlag = reg && (reg.status !== 'assigned' || (reg.registrationStatus && !/^valid$/i.test(reg.registrationStatus))
    || (reg.registrationExpires && reg.registrationExpires < new Date().toISOString().slice(0, 10)));

  return (
    <li id={`aircraft-${a.id}`}>
      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          <button type="button" onClick={() => toggle('photos')} aria-label={cover ? `Photos of ${a.tail_number}` : `Add photos of ${a.tail_number}`}
            className="group relative block aspect-[3/2] w-full shrink-0 overflow-hidden bg-surface-sunken sm:w-64 cursor-pointer">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- own route, immutable cache
              <img src={photoUrl(cover.id, 'thumb')} alt="" className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]" />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-label text-ink-muted group-hover:text-royal">
                <Camera size={24} strokeWidth={1.5} aria-hidden="true" /> Add photos
              </span>
            )}
            {a.photos.length > 1 && (
              <span className="absolute bottom-2 right-2 rounded-pill bg-surface-raised/90 px-2 py-0.5 text-label text-ink">{a.photos.length} photos</span>
            )}
          </button>

          <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <h2 className="text-heading text-ink">{a.type}</h2>
                <p className="font-mono text-label text-royal">{a.tail_number}</p>
              </div>
              {reg ? (
                <span className={`text-label ${regFlag ? 'text-danger' : 'text-confirmed'}`}>
                  {regFlag ? 'Check FAA registration' : `FAA registered${reg.registrationExpires ? ` to ${reg.registrationExpires.slice(0, 7)}` : ''}`}
                </span>
              ) : null}
            </div>
            <p className="text-body text-ink-muted">
              {[`${a.capacity} seats`, a.range_nm ? `${a.range_nm.toLocaleString()} nm range` : null, a.year ? `Built ${a.year}` : null, a.serial_number ? `S/N ${a.serial_number}` : null]
                .filter(Boolean).join(' · ')}
            </p>
            <div className="-ml-3 mt-auto flex flex-wrap items-center gap-1">
              {tab('edit', 'Edit', Pencil)}
              {tab('photos', `Photos${a.photos.length ? ` (${a.photos.length})` : ''}`, Camera)}
              {usTail && (reg ? tab('registry', 'FAA record', FileSearch) : (
                <button type="button" onClick={checkRegistry} disabled={checking}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-label text-ink transition-colors duration-200 ease-out hover:bg-surface-sunken cursor-pointer disabled:opacity-40">
                  <FileSearch size={16} strokeWidth={1.5} aria-hidden="true" /> {checking ? 'Checking…' : 'Check FAA registry'}
                </button>
              ))}
              <span className="ml-auto">
                {confirmRemove ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-label text-ink-muted">Remove {a.tail_number}?</span>
                    <Button size="sm" variant="danger" onClick={remove}>Remove</Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmRemove(false)}>Keep</Button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmRemove(true)} aria-label={`Remove ${a.tail_number}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-200 ease-out hover:bg-surface-sunken hover:text-danger cursor-pointer">
                    <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>

        {error && <div className="px-5 pb-5"><Notice tone="danger">{error}</Notice></div>}

        {panel && (
          <div id={`aircraft-${a.id}-${panel}`} className="border-t border-hairline p-5">
            {panel === 'edit' && (
              <AircraftForm
                id={`aircraft-${a.id}-form`}
                initial={a}
                submitLabel="Save changes"
                onCancel={() => setPanel(null)}
                onSubmit={async payload => {
                  const res = await fetch(`/api/fleet/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                  if (!res.ok) { const { body, message } = await errorOf(res); return { fields: fieldErrors(body), message }; }
                  onChange(await res.json());
                  setPanel(null);
                }}
              />
            )}
            {panel === 'photos' && (
              <PhotoManager aircraftId={a.id} tail={a.tail_number} photos={a.photos} onChange={photos => onChange({ ...a, photos })} />
            )}
            {panel === 'registry' && reg && (
              <div className="space-y-4">
                <RegistrySummary record={reg} checkedAt={a.faa_checked_at} />
                <Button size="sm" variant="secondary" onClick={checkRegistry} disabled={checking}>{checking ? 'Checking…' : 'Check again'}</Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}

export default function FleetPage() {
  const [aircraft, setAircraft] = useState<AircraftView[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetch('/api/fleet')
      .then(async res => (res.ok ? setAircraft(await res.json()) : setLoadError('Could not load the fleet')))
      .catch(() => setLoadError('Could not load the fleet'));
  }, []);

  const replace = (a: AircraftView) => setAircraft(list => list?.map(x => (x.id === a.id ? a : x)) ?? null);

  return (
    <div id="fleet-page" className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-ink">Fleet</h1>
          <p className="mt-2 text-body text-ink-muted">Aircraft you quote. Photos appear with your quotes.</p>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)}><Plus size={16} strokeWidth={1.5} aria-hidden="true" /> Add aircraft</Button>
        )}
      </div>

      {loadError && <Notice tone="danger">{loadError}</Notice>}

      {adding && (
        <Card id="add-aircraft">
          <h2 className="mb-6 text-heading text-ink">New aircraft</h2>
          <AircraftForm
            id="add-aircraft-form"
            submitLabel="Add aircraft"
            onCancel={() => setAdding(false)}
            onSubmit={async (payload, lookedUp) => {
              const res = await fetch('/api/fleet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
              if (!res.ok) { const { body, message } = await errorOf(res); return { fields: fieldErrors(body), message }; }
              const { id } = await res.json();
              // Store the registry record for the tail number that was looked up.
              const stored = lookedUp && lookedUp.nNumber === normalizeNNumber(payload.tailNumber)
                ? await fetch(`/api/fleet/${id}/faa`, { method: 'POST' }).catch(() => null) : null;
              const created: AircraftView = stored?.ok ? await stored.json() : await (await fetch(`/api/fleet/${id}`)).json();
              setAircraft(list => [created, ...(list ?? [])]);
              setAdding(false);
            }}
          />
        </Card>
      )}

      {aircraft === null ? (
        !loadError && <p className="text-body text-ink-muted" role="status">Loading…</p>
      ) : aircraft.length === 0 ? (
        !adding && (
          <Card className="flex flex-col items-center gap-4 py-12 text-center">
            <Plane size={32} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />
            <p className="text-body text-ink-muted">No aircraft yet. Add one to start quoting.</p>
            <Button onClick={() => setAdding(true)}>Add aircraft</Button>
          </Card>
        )
      ) : (
        <ul id="fleet-list" className="space-y-4">
          {aircraft.map(a => (
            <AircraftCard key={a.id} a={a} onChange={replace} onRemoved={() => setAircraft(list => list?.filter(x => x.id !== a.id) ?? null)} />
          ))}
        </ul>
      )}
    </div>
  );
}

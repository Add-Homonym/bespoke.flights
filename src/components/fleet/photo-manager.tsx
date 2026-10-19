'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { Notice } from '@/components/ui/notice';
import { resizeForUpload } from '@/lib/images/resize';
import type { AircraftPhotoMeta } from '@/lib/types';

export const MAX_PHOTOS = 8;

export const photoUrl = (id: number, size?: 'thumb') => `/api/aircraft-photos/${id}${size ? '?size=thumb' : ''}`;

async function errorText(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : `Upload failed (${res.status})`;
}

/** Thumbnails with cover and remove controls, and an add-photos button. First photo is the cover. */
export function PhotoManager({
  aircraftId,
  tail,
  photos,
  onChange,
}: {
  aircraftId: number;
  tail: string;
  photos: AircraftPhotoMeta[];
  onChange: (photos: AircraftPhotoMeta[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const room = MAX_PHOTOS - photos.length;

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    const list = Array.from(files).slice(0, room);
    let latest = photos;
    try {
      for (const [i, file] of list.entries()) {
        setBusy(`Uploading ${i + 1} of ${list.length}`);
        const { photo, thumb } = await resizeForUpload(file);
        const form = new FormData();
        form.set('photo', photo.blob, 'photo.jpg');
        form.set('thumb', thumb.blob, 'thumb.jpg');
        form.set('width', String(photo.width));
        form.set('height', String(photo.height));
        const res = await fetch(`/api/fleet/${aircraftId}/photos`, { method: 'POST', body: form });
        if (!res.ok) throw new Error(await errorText(res));
        latest = (await res.json()).photos;
        onChange(latest);
      }
      if (files.length > list.length) setError(`Up to ${MAX_PHOTOS} photos per aircraft. ${files.length - list.length} not added.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const act = async (photoId: number, method: 'PATCH' | 'DELETE') => {
    setError('');
    setBusy(method === 'PATCH' ? 'Setting cover' : 'Removing');
    try {
      const res = await fetch(`/api/fleet/${aircraftId}/photos/${photoId}`, {
        method,
        headers: method === 'PATCH' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'PATCH' ? JSON.stringify({ cover: true }) : undefined,
      });
      if (!res.ok) throw new Error(await errorText(res));
      onChange((await res.json()).photos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div id={`photos-${aircraftId}`} className="space-y-4">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id} className="group relative overflow-hidden rounded-md border border-hairline bg-surface-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element -- served from our own route with immutable caching */}
            <img src={photoUrl(p.id, 'thumb')} alt={`${tail}, photo ${i + 1}${p.caption ? `: ${p.caption}` : ''}`} className="aspect-[3/2] w-full object-cover" loading="lazy" />
            {i === 0 && (
              <span className="absolute left-2 top-2 rounded-pill bg-royal px-2 py-0.5 text-overline text-on-royal">Cover</span>
            )}
            <div className="flex items-center justify-between gap-1 border-t border-hairline bg-surface-raised px-1">
              {i === 0 ? (
                <span className="px-2 text-label text-ink-muted">Shown first</span>
              ) : (
                <button type="button" disabled={!!busy} onClick={() => act(p.id, 'PATCH')}
                  className="inline-flex min-h-11 items-center gap-1.5 px-2 text-label text-ink hover:text-royal cursor-pointer disabled:opacity-40">
                  <Star size={14} strokeWidth={1.5} aria-hidden="true" /> Make cover
                </button>
              )}
              <button type="button" disabled={!!busy} onClick={() => act(p.id, 'DELETE')} aria-label={`Remove photo ${i + 1}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-ink-muted hover:text-danger cursor-pointer disabled:opacity-40">
                <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
        {room > 0 && (
          <li>
            <label
              className={`flex aspect-[3/2] h-full min-h-28 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-control text-label text-ink-muted transition-colors duration-200 ease-out hover:border-royal hover:text-royal focus-within:border-royal focus-within:ring-2 focus-within:ring-royal ${busy ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
            >
              <ImagePlus size={24} strokeWidth={1.5} aria-hidden="true" />
              <span>{busy ?? (photos.length ? 'Add photos' : 'Add the first photo')}</span>
              <span className="text-ink-subtle">{room} of {MAX_PHOTOS} left</span>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple
                className="sr-only" disabled={!!busy} onChange={e => add(e.target.files)} />
            </label>
          </li>
        )}
      </ul>
      {busy && <p role="status" className="sr-only">{busy}</p>}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Filter the listing by origin and destination code. Submits as query parameters so the page is linkable. */
export function EmptyLegFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [origin, setOrigin] = useState(from);
  const [dest, setDest] = useState(to);
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const q = new URLSearchParams();
    if (origin.trim()) q.set('from', origin.trim().toUpperCase());
    if (dest.trim()) q.set('to', dest.trim().toUpperCase());
    router.push(`/empty-legs${q.size ? `?${q}` : ''}`);
  };
  return (
    <form onSubmit={apply} aria-label="Filter empty legs" className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
      <Input label="From" placeholder="HNL" value={origin} onChange={e => setOrigin(e.target.value)} autoCapitalize="characters" maxLength={4} />
      <Input label="To" placeholder="OGG" value={dest} onChange={e => setDest(e.target.value)} autoCapitalize="characters" maxLength={4} />
      <Button type="submit" variant="secondary">Filter</Button>
    </form>
  );
}

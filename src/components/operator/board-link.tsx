'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/** Private link to the live company board for staff without logins. */
export function BoardLink() {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/operator/board-link').then(r => r.json()).then(d => setUrl(d.url ?? null)).catch(() => setUrl(null));
  }, []);

  const act = async (action: 'create' | 'revoke') => {
    if (action === 'revoke' && !confirm('Turn off the board link? Screens and people using it will lose access.')) return;
    if (action === 'create' && url && !confirm('Replace the board link? The current link will stop working.')) return;
    setBusy(true);
    setMessage('');
    const res = await fetch('/api/operator/board-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMessage(data.error || 'Something went wrong'); return; }
    setUrl(data.url ?? null);
    setMessage(action === 'revoke' ? 'Board link turned off.' : 'New board link created.');
  };

  return (
    <Card className="mb-8">
      <h2 className="text-sm font-semibold text-brand-muted uppercase tracking-wider mb-2">Staff board link</h2>
      <p className="text-brand-cream/70 text-sm mb-4">
        A private, read-only link to your live company board, for dispatch screens or staff without an account.
        It shows upcoming charters with passenger contact details, so share it only inside your company.
      </p>
      {url === undefined ? (
        <p className="text-brand-muted text-sm">Loading&hellip;</p>
      ) : url ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              aria-label="Board link"
              readOnly
              value={url}
              onFocus={e => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-lg border border-brand-border bg-brand-navy px-3 py-2 text-sm text-brand-cream font-mono"
            />
            <Button size="sm" type="button" onClick={() => navigator.clipboard.writeText(url).then(() => setMessage('Link copied.'), () => {})}>Copy</Button>
          </div>
          <div className="flex gap-5 text-xs">
            <a href={url} target="_blank" rel="noreferrer" className="text-brand-gold hover:underline">Open board</a>
            <button type="button" onClick={() => act('create')} disabled={busy} className="text-brand-muted hover:text-brand-cream cursor-pointer">Replace link</button>
            <button type="button" onClick={() => act('revoke')} disabled={busy} className="text-brand-muted hover:text-brand-error cursor-pointer">Turn off link</button>
          </div>
        </div>
      ) : (
        <Button type="button" onClick={() => act('create')} disabled={busy}>Create board link</Button>
      )}
      {message && <p role="status" className="text-brand-success text-sm mt-2">{message}</p>}
    </Card>
  );
}

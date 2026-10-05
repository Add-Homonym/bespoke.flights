'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ShareState {
  url: string | null;
  expiresAt?: string;
}

/** "Share with your team": private trip-sheet link, email, calendar file, revoke. */
export function TripShare({ requestId }: { requestId: number }) {
  const endpoint = `/api/operator/requests/${requestId}/share`;
  const [share, setShare] = useState<ShareState | null>(null);
  const [recipients, setRecipients] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(endpoint).then(r => r.json()).then(setShare).catch(() => setShare({ url: null }));
  }, [endpoint]);

  const post = async (body: object) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return null;
      }
      setShare({ url: data.url, expiresAt: data.expiresAt });
      return data;
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied.');
    } catch {
      setMessage('Select the link and copy it.');
    }
  };

  const createAndCopy = async () => {
    const data = await post({ action: 'create' });
    if (data?.url) await copy(data.url);
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await post({ action: 'email', recipients });
    if (data) {
      setRecipients('');
      setMessage(
        `Sent to ${data.sent} ${data.sent === 1 ? 'person' : 'people'}.` +
        (data.failed?.length ? ` Could not send to: ${data.failed.join(', ')}.` : '')
      );
    }
  };

  const revoke = async () => {
    if (!confirm('Turn off the current link? Anyone who has it will lose access. You can create a new link afterwards.')) return;
    const data = await post({ action: 'revoke' });
    if (data) setMessage('Link turned off.');
  };

  return (
    <Card className="mb-8">
      <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-2">Share with your team</h2>
      <p className="text-ink-muted text-sm mb-5">
        Send dispatch, crew and catering a read-only trip sheet: legs and times, aircraft, passengers, special requests and the
        lead passenger&apos;s contact details. No account needed to view it.
      </p>

      {share === null ? (
        <p className="text-ink-muted text-sm">Loading&hellip;</p>
      ) : (
        <div className="space-y-5">
          {share.url ? (
            <div>
              <label htmlFor="trip-share-link" className="block text-sm font-medium text-ink-muted mb-1.5">Private link</label>
              <div className="flex gap-2">
                <input
                  id="trip-share-link"
                  readOnly
                  value={share.url}
                  onFocus={e => e.currentTarget.select()}
                  className="flex-1 min-w-0 rounded-md border border-hairline bg-surface-raised px-3 py-2 text-sm text-ink font-mono"
                />
                <Button type="button" size="sm" onClick={() => copy(share.url!)} disabled={busy}>Copy</Button>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs">
                <a href={share.url} target="_blank" rel="noreferrer" className="text-brass-ink hover:underline">Open trip sheet</a>
                <a href={`${new URL(share.url).pathname}/calendar`} className="text-brass-ink hover:underline">Download calendar file</a>
                <button type="button" onClick={revoke} disabled={busy} className="text-ink-muted hover:text-danger cursor-pointer">
                  Turn off link
                </button>
                {share.expiresAt && (
                  <span className="text-ink-muted">Expires {new Date(share.expiresAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          ) : (
            <Button type="button" onClick={createAndCopy} disabled={busy}>Create &amp; copy link</Button>
          )}

          <form onSubmit={sendEmail} className="space-y-2">
            <label htmlFor="trip-share-emails" className="block text-sm font-medium text-ink-muted">Email the trip sheet</label>
            <div className="flex gap-2">
              <input
                id="trip-share-emails"
                type="text"
                inputMode="email"
                value={recipients}
                onChange={e => setRecipients(e.target.value)}
                placeholder="dispatch@yourcompany.com, captain@yourcompany.com"
                className="flex-1 min-w-0 rounded-md border border-hairline bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-subtle"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={busy || !recipients.trim()}>Send</Button>
            </div>
            <p className="text-ink-muted text-xs">Up to 20 addresses, separated by commas or spaces.</p>
          </form>

          {message && <p role="status" className="text-confirmed text-sm">{message}</p>}
          {error && <p role="alert" className="text-danger text-sm">{error}</p>}
        </div>
      )}
    </Card>
  );
}

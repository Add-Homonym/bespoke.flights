'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import type { ThreadMessage } from '@/lib/messaging/messages';

const POLL_MS = 15_000;
const MAX = 2000;

/**
 * One conversation between the traveler and one operator. Polls every 15 s
 * while visible. `collapsed` starts it closed behind a "Message operator" link.
 */
export function MessageThread({
  requestId,
  operatorId,
  title,
  collapsed = false,
  unread = 0,
  viewer,
}: {
  requestId: number;
  operatorId: number;
  title: string;
  collapsed?: boolean;
  unread?: number;
  viewer: 'customer' | 'operator' | 'admin';
}) {
  const [open, setOpen] = useState(!collapsed);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [badge, setBadge] = useState(unread);
  const [closed, setClosed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const source = `/api/booking-requests/${requestId}/messages?operatorId=${operatorId}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(source, { cache: 'no-store' });
      if (!res.ok) { setError('Could not load messages.'); return; }
      const data = await res.json();
      setMessages(data.messages);
      setClosed(!!data.closed);
      setBadge(0);
      setError('');
    } catch {
      setError('Could not load messages.');
    }
  }, [source]);

  useEffect(() => {
    if (!open) return;
    const first = setTimeout(load, 0);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [open, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages?.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError('');
    const res = await fetch(source, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (res.status === 409) setClosed(true);
      setError(typeof data.error === 'string' ? data.error : 'Could not send the message.');
      return;
    }
    setDraft('');
    setMessages(prev => [...(prev ?? []), data as ThreadMessage]);
  };

  if (!open) {
    return (
      <div id={`messages-${operatorId}`}>
        <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
          Message operator{badge > 0 && <span className="ml-1 rounded-pill bg-brass px-2 text-overline text-on-brass">{badge} new</span>}
        </Button>
      </div>
    );
  }

  return (
    <section id={`messages-${operatorId}`} aria-label={title} className="space-y-3 rounded-md border border-hairline bg-surface-sunken p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-heading text-ink">{title}</h3>
        {collapsed && <Button variant="quiet" size="sm" onClick={() => setOpen(false)}>Hide messages</Button>}
      </div>

      <div role="log" aria-live="polite" className="max-h-80 space-y-2 overflow-y-auto">
        {messages === null && <p className="text-label text-ink-muted">Loading messages…</p>}
        {messages?.length === 0 && (
          <p className="text-body text-ink-muted">No messages yet. Questions about the aircraft, catering or timing go here; no phone calls needed.</p>
        )}
        {messages?.map(m => {
          const mine = m.from === viewer;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-md px-3 py-2 ${mine ? 'bg-night text-on-night' : 'bg-surface-raised text-ink border border-hairline'}`}>
                <p className={`text-overline ${mine ? 'text-on-night-muted' : 'text-ink-muted'}`}>
                  {m.senderName} · {m.createdAt.slice(0, 16).replace('T', ' ')}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-body">{m.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {closed && <p className="text-body text-ink-muted">This trip was cancelled, so this conversation is read-only.</p>}

      {viewer !== 'admin' && !closed && (
        <div className="space-y-2">
          <label htmlFor={`draft-${operatorId}`} className="sr-only">Your message</label>
          <textarea
            id={`draft-${operatorId}`}
            rows={3}
            maxLength={MAX}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
            placeholder="Write a message"
            className="block w-full rounded-md border border-border-control bg-surface-raised px-4 py-3 text-body text-ink placeholder:text-ink-subtle"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-label text-ink-muted tabular-nums">{draft.length}/{MAX}</p>
            <Button size="sm" onClick={send} disabled={busy || !draft.trim()}>Send message</Button>
          </div>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  );
}

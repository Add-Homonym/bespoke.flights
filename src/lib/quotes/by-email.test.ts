import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { emailAddress, htmlToText, ownText, parseQuoteReply, quoteFromEmail, replyAddress, tokenFromRecipients } from './by-email';
import { setDb } from '@/lib/db';
import { POST } from '@/app/api/webhooks/inbound-email/route';
import type { Quote } from '@/lib/types';

const BASE = 'https://bespoke.flights';
let f: Fixture;
let requestId: number;

beforeEach(async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('EMAIL_FROM', 'Bespoke Flights <hello@mail.bespoke.flights>');
  vi.stubEnv('EMAIL_REPLY_DOMAIN', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  f = await createFixture();
  setDb(f.db);
  requestId = (await f.db.one<{ id: number }>("INSERT INTO booking_requests (customer_id, status, passenger_count) VALUES (?, 'open', 3) RETURNING id", [f.customerId]))!.id;
  await f.db.run("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date) VALUES (?, 1, 'PHNL', 'PHOG', '2030-05-01')", [requestId]);
  await f.db.run("INSERT INTO outreach_log (request_id, operator_id, method, rfq_body, reply_token) VALUES (?, ?, 'email', 'rfq', 'tok_alpha_12345')", [requestId, f.operatorA]);
  await f.db.run("INSERT INTO aircraft (operator_id, tail_number, type, capacity) VALUES (?, 'N123AB', 'Citation CJ3', 6)", [f.operatorA]);
});
afterEach(() => { setDb(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('parsing', () => {
  it('builds and reads the reply address', () => {
    expect(replyAddress('abc123def456')).toBe('quotes+abc123def456@mail.bespoke.flights');
    expect(replyAddress(null)).toBe('quotes@mail.bespoke.flights');
    expect(tokenFromRecipients('Bespoke <quotes+abc123def456@mail.bespoke.flights>')).toBe('abc123def456');
    expect(tokenFromRecipients(['ops@x.com', 'quotes+tok_alpha_12345@mail.bespoke.flights'])).toBe('tok_alpha_12345');
    expect(tokenFromRecipients('quotes@mail.bespoke.flights')).toBeNull();
    expect(emailAddress('Alpha Air <Dispatch@Alpha.com>')).toBe('dispatch@alpha.com');
  });

  it('reads price, tail number and validity from the reply only', () => {
    const text = 'Quote $12,500 on N123AB, valid until 2030-04-20.\nCatering included.\n\nOn Mon, Oct 19, 2026 Bespoke Flights wrote:\n> Charter Quote Request $99,999';
    expect(parseQuoteReply(text)).toEqual({
      priceCents: 1_250_000, tailNumber: 'N123AB', validUntil: '2030-04-20',
      message: 'Quote $12,500 on N123AB, valid until 2030-04-20. Catering included.',
    });
    expect(parseQuoteReply('$4500.50')).toMatchObject({ priceCents: 450_050, tailNumber: null, validUntil: null });
    expect(parseQuoteReply('Sorry, no aircraft available')).toBeNull();
    expect(parseQuoteReply('> $12,000 quoted original only')).toBeNull();
    expect(ownText('yes\n-- \nsig')).toBe('yes');
    expect(htmlToText('<div>Quote <b>$9,000</b><br>Thanks &amp; regards</div>')).toContain('Quote $9,000\nThanks & regards');
  });
});

describe('quoteFromEmail', () => {
  const mail = (over: Partial<Parameters<typeof quoteFromEmail>[1]> = {}) => ({
    from: 'Alpha Air <dispatch@alpha.com>', to: 'quotes+tok_alpha_12345@mail.bespoke.flights', text: 'Quote $12,500 N123AB valid 2030-04-20\nCatering included.', ...over,
  });

  it('creates a quote from a valid reply and records the source', async () => {
    const r = await quoteFromEmail(f.db, mail(), BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const q = await row<Quote & { aircraft_id: number }>(f.db, 'SELECT * FROM quotes WHERE id = ?', r.quoteId);
    expect(q).toMatchObject({ request_id: requestId, operator_id: f.operatorA, price_cents: 1_250_000, valid_until: '2030-04-20', source: 'email', status: 'pending' });
    expect(q.aircraft_id).toBeTruthy();
    expect(q.message).toContain('Catering included');
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM booking_requests WHERE id = ?', requestId)).status).toBe('quoted');
    expect((await row<{ status: string }>(f.db, 'SELECT status FROM outreach_log WHERE reply_token = ?', 'tok_alpha_12345')).status).toBe('responded');
    // A second reply does not create a second live quote.
    expect(await quoteFromEmail(f.db, mail({ text: '$11,000' }), BASE)).toMatchObject({ ok: false });
    expect((await f.db.query('SELECT id FROM quotes WHERE request_id = ?', [requestId])).length).toBe(1);
  });

  it('rejects unknown tokens, other senders and replies without a price', async () => {
    expect(await quoteFromEmail(f.db, mail({ to: 'quotes+nope_000000@mail.bespoke.flights' }), BASE)).toMatchObject({ ok: false, reason: 'Unknown reply token' });
    expect(await quoteFromEmail(f.db, mail({ from: 'b@ops.com' }), BASE)).toMatchObject({ ok: false, reason: expect.stringContaining('Sender') });
    expect(await quoteFromEmail(f.db, mail({ text: 'We can do this, call me' }), BASE)).toMatchObject({ ok: false, reason: expect.stringContaining('No price') });
    expect((await f.db.query('SELECT id FROM quotes WHERE request_id = ?', [requestId])).length).toBe(0);
    // The operator's sign-in address is accepted as well as the contact email.
    expect(await quoteFromEmail(f.db, mail({ from: 'a@ops.com' }), BASE)).toMatchObject({ ok: true });
  });

  it('refuses closed requests and non-approved operators', async () => {
    await f.db.run("UPDATE booking_requests SET status = 'cancelled' WHERE id = ?", [requestId]);
    expect(await quoteFromEmail(f.db, mail(), BASE)).toMatchObject({ ok: false, reason: expect.stringContaining('cancelled') });
  });
});

describe('POST /api/webhooks/inbound-email', () => {
  const post = (body: unknown, auth?: string) => POST(new Request('http://localhost/api/webhooks/inbound-email', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body),
  }));

  it('is off without a secret and refuses the wrong one', async () => {
    vi.stubEnv('INBOUND_EMAIL_SECRET', '');
    expect((await post({})).status).toBe(503);
    vi.stubEnv('INBOUND_EMAIL_SECRET', 's3cret');
    expect((await post({}, 'Bearer wrong')).status).toBe(401);
    expect((await post({ nope: 1 }, 'Bearer s3cret')).status).toBe(400);
  });

  it('accepts a flat message or a provider envelope', async () => {
    vi.stubEnv('INBOUND_EMAIL_SECRET', 's3cret');
    const res = await post({ data: { from: 'dispatch@alpha.com', to: ['quotes+tok_alpha_12345@mail.bespoke.flights'], html: '<p>Quote <b>$8,000</b></p>' } }, 'Bearer s3cret');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, requestId });
    const ignored = await post({ from: 'x@y.com', to: 'hello@mail.bespoke.flights', text: 'hi' }, 'Bearer s3cret');
    expect(await ignored.json()).toMatchObject({ ok: false });
  });
});

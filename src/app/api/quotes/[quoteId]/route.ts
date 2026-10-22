import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validationResponse } from '@/lib/api/validation';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { toId } from '@/lib/db/queries';
import { appBaseUrl } from '@/lib/payments/config';
import { notifyNewQuote, notifyQuoteDeclined, notifyQuoteWithdrawn } from '@/lib/notify/traveler';
import { quoteSchema } from '@/lib/validations';
import { saveWorksheet } from '@/lib/quotes/worksheet-store';
import { learnFromQuote } from '@/lib/quotes/learning';
import { refreshDrafts } from '@/lib/quotes/autopilot';
import type { Quote, BookingRequest, Operator } from '@/lib/types';

/**
 * Quote changes.
 *   { status: 'rejected' }   the traveler (or an admin) declines a pending quote
 *   { status: 'withdrawn' }  the owning operator withdraws a pending quote
 *   { priceCents?, message?, validUntil?, aircraftId? }
 *                            the owning operator revises a pending quote
 * Acceptance happens only through payment: POST /api/payments/checkout.
 */
const statusSchema = z.object({ status: z.enum(['rejected', 'withdrawn']) });
const reviseSchema = quoteSchema.partial().omit({ currency: true }).refine(d => Object.keys(d).length > 0, { message: 'Nothing to change' });

export async function PATCH(req: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { quoteId } = await params;
  const body = await req.json().catch(() => null);
  const isStatusChange = typeof body === 'object' && body !== null && 'status' in body;
  const parsed = isStatusChange ? statusSchema.safeParse(body) : reviseSchema.safeParse(body);
  if (!parsed.success) {
    return isStatusChange
      ? NextResponse.json({ error: 'Invalid request. Accept a quote by paying for it.' }, { status: 400 })
      : validationResponse(parsed.error);
  }

  const db = getDb();
  const quote = await db.one<Quote>('SELECT * FROM quotes WHERE id = ?', [toId(quoteId)]);
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  const request = (await db.one<BookingRequest>('SELECT * FROM booking_requests WHERE id = ?', [quote.request_id]))!;
  const baseUrl = appBaseUrl(req);

  if ('status' in parsed.data && parsed.data.status === 'rejected') {
    const isOwner = session.role === 'customer' && request.customer_id === session.userId;
    if (!isOwner && session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (quote.status !== 'pending') return NextResponse.json({ error: `Quote is ${quote.status}` }, { status: 409 });
    await db.run("UPDATE quotes SET status = 'rejected' WHERE id = ? AND status = 'pending'", [quote.id]);
    await notifyQuoteDeclined(db, quote.id, baseUrl);
    return NextResponse.json({ success: true });
  }

  // Withdraw and revise: the quoting operator only.
  if (session.role !== 'operator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const operator = await db.one<Operator>('SELECT * FROM operators WHERE user_id = ?', [session.userId]);
  if (!operator || operator.id !== quote.operator_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (quote.status !== 'pending') return NextResponse.json({ error: `Quote is ${quote.status}` }, { status: 409 });

  if ('status' in parsed.data) {
    await db.run("UPDATE quotes SET status = 'withdrawn' WHERE id = ? AND status = 'pending'", [quote.id]);
    await notifyQuoteWithdrawn(db, quote.id, baseUrl);
    return NextResponse.json({ success: true, status: 'withdrawn' });
  }

  if (!['open', 'quoted'].includes(request.status)) {
    return NextResponse.json({ error: `This request is ${request.status}` }, { status: 409 });
  }
  const { priceCents, message, validUntil, aircraftId, worksheet } = parsed.data;
  if (worksheet) {
    await saveWorksheet(db, quote.id, operator.id, worksheet);
    await learnFromQuote(db, operator.id, { ...worksheet, aircraftId: worksheet.aircraftId ?? aircraftId ?? quote.aircraft_id }, priceCents ?? quote.price_cents);
    await refreshDrafts(db, operator.id).catch(err => console.error('Autopilot redraft failed:', err));
  }
  // Saving only the private worksheet is not a revision the traveler hears about.
  if (Object.keys(parsed.data).every(k => k === 'worksheet')) {
    return NextResponse.json((await db.one<Quote>('SELECT * FROM quotes WHERE id = ?', [quote.id]))!);
  }
  if (aircraftId) {
    const owned = await db.one('SELECT id FROM aircraft WHERE id = ? AND operator_id = ?', [aircraftId, operator.id]);
    if (!owned) return NextResponse.json({ error: 'Check the highlighted fields.', fieldErrors: { aircraftId: ['Aircraft not in your fleet'] } }, { status: 400 });
  }
  const priceChanged = priceCents != null && priceCents !== quote.price_cents;
  await db.run(`
    UPDATE quotes SET
      price_cents = COALESCE(?, price_cents),
      previous_price_cents = CASE WHEN ? THEN price_cents ELSE previous_price_cents END,
      message = COALESCE(?, message),
      valid_until = COALESCE(?, valid_until),
      aircraft_id = COALESCE(?, aircraft_id),
      revised_at = now()
    WHERE id = ? AND status = 'pending'
  `, [priceCents ?? null, priceChanged, message ?? null, validUntil ?? null, aircraftId ?? null, quote.id]);

  await notifyNewQuote(db, quote.id, baseUrl, 'revised', priceChanged ? quote.price_cents : null);
  const updated = (await db.one<Quote>('SELECT * FROM quotes WHERE id = ?', [quote.id]))!;
  return NextResponse.json(updated);
}

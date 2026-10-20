/**
 * Create a quote on a request. Shared by the operator's quote form
 * (POST /api/booking-requests/[id]/quotes) and reply-by-email quoting.
 */

import type { Db } from '@/lib/db';
import { saveWorksheet } from '@/lib/quotes/worksheet-store';
import { learnFromQuote } from '@/lib/quotes/learning';
import { refreshDrafts } from '@/lib/quotes/autopilot';
import { notifyNewQuote } from '@/lib/notify/traveler';
import type { WorksheetInputs } from '@/lib/quotes/worksheet';
import type { Operator } from '@/lib/types';

export class QuoteError extends Error {
  constructor(message: string, public status: number, public field?: string) { super(message); }
}

export interface QuoteInput {
  requestId: number;
  priceCents: number;
  currency?: string;
  message?: string | null;
  aircraftId?: number | null;
  validUntil?: string | null;
  worksheet?: WorksheetInputs | null;
  source?: 'app' | 'email';
  /** The staff user who submitted, for Autopilot draft bookkeeping. */
  submittedBy?: number | null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export async function submitQuote(db: Db, operator: Operator, input: QuoteInput, baseUrl: string): Promise<number> {
  if (operator.status !== 'approved') throw new QuoteError('Operator not approved', 403);

  const request = await db.one<{ id: number; status: string }>('SELECT id, status FROM booking_requests WHERE id = ?', [input.requestId]);
  if (!request) throw new QuoteError('Request not found', 404);
  if (request.status !== 'open' && request.status !== 'quoted') {
    throw new QuoteError(`This request is ${request.status} and no longer accepts quotes`, 409);
  }

  if (input.aircraftId) {
    const owned = await db.one('SELECT id FROM aircraft WHERE id = ? AND operator_id = ?', [input.aircraftId, operator.id]);
    if (!owned) throw new QuoteError('Aircraft not in your fleet', 400, 'aircraftId');
  }

  const existing = await db.one(
    "SELECT id FROM quotes WHERE request_id = ? AND operator_id = ? AND status IN ('pending','accepted')", [request.id, operator.id]);
  if (existing) throw new QuoteError('You have already quoted this request', 409);

  let quoteId: number;
  try {
    quoteId = await db.transaction(async tx => {
      const { id } = (await tx.one<{ id: number }>(
        'INSERT INTO quotes (request_id, operator_id, aircraft_id, price_cents, currency, message, valid_until, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        [request.id, operator.id, input.aircraftId || null, input.priceCents, input.currency ?? 'USD', input.message || null, input.validUntil || null, input.source ?? 'app']
      ))!;
      await tx.run("UPDATE booking_requests SET status = 'quoted', updated_at = now() WHERE id = ? AND status = 'open'", [request.id]);
      await tx.run("UPDATE outreach_log SET status = 'responded', responded_at = now() WHERE request_id = ? AND operator_id = ?", [request.id, operator.id]);
      if (input.worksheet) await saveWorksheet(tx, id, operator.id, input.worksheet);
      await tx.run(
        "UPDATE quote_drafts SET status = 'submitted', quote_id = ?, reviewed_by = ?, reviewed_at = now() WHERE request_id = ? AND operator_id = ? AND status = 'draft'",
        [id, input.submittedBy ?? null, request.id, operator.id]);
      return id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new QuoteError('You have already quoted this request', 409);
    throw err;
  }

  if (input.worksheet) {
    await learnFromQuote(db, operator.id, { ...input.worksheet, aircraftId: input.worksheet.aircraftId ?? input.aircraftId ?? null }, input.priceCents);
    await refreshDrafts(db, operator.id).catch(err => console.error('Autopilot redraft failed:', err));
  }

  await notifyNewQuote(db, quoteId, baseUrl);
  return quoteId;
}

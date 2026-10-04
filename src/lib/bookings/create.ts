import { cookies } from 'next/headers';
import { after } from 'next/server';
import type { Db } from '@/lib/db';
import { bookingRequestSchema } from '@/lib/validations';
import { dispatchOutreach } from '@/lib/outreach/engine';
import { DRAFT_COOKIE, parseDraft, draftToRequest } from './draft';
import type { BookingLeg } from '@/lib/types';
import type { z } from 'zod';

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;

/**
 * Create a booking request with its legs and dispatch operator outreach.
 * RFQ delivery continues after the response via next/server `after()`.
 */
export async function createBookingRequest(db: Db, customerId: number, input: BookingRequestInput) {
  const { passengerCount, notes, legs } = input;
  const savedLegs: BookingLeg[] = [];

  const requestId = await db.transaction(async tx => {
    const { id } = (await tx.one<{ id: number }>(
      'INSERT INTO booking_requests (customer_id, passenger_count, notes) VALUES (?, ?, ?) RETURNING id',
      [customerId, passengerCount, notes || null]
    ))!;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      await tx.run(
        'INSERT INTO booking_legs (request_id, leg_order, origin_code, origin_name, dest_code, dest_name, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id, i + 1,
          leg.originCode, leg.originName || null,
          leg.destCode, leg.destName || null,
          leg.departureDate, leg.departureTime || null,
        ]
      );
      savedLegs.push({
        id: 0, request_id: id, leg_order: i + 1,
        origin_code: leg.originCode, origin_name: leg.originName || null,
        dest_code: leg.destCode, dest_name: leg.destName || null,
        departure_date: leg.departureDate, departure_time: leg.departureTime || null,
      });
    }
    return id;
  });

  // Matches approved operators by market/fleet/safety, logs RFQs,
  // and delivers via Resend (email) or SMS stub. Non-fatal on failure.
  let outreach = { matched: 0, dispatched: 0 };
  try {
    const result = await dispatchOutreach(db, requestId, savedLegs, passengerCount, notes || null);
    outreach = result;
    after(() => result.deliveries);
  } catch (err) {
    console.error('Outreach dispatch error:', err);
  }

  return { id: requestId, outreach };
}

/**
 * After sign-up or sign-in: if the browser holds a complete booking draft,
 * submit it for this customer and clear the cookie. Returns the new request
 * id, or null when there is no draft or it is incomplete (the cookie is then
 * kept so the visitor can finish it on /book).
 */
export async function claimBookingDraft(db: Db, customerId: number): Promise<number | null> {
  const store = await cookies();
  const draft = parseDraft(store.get(DRAFT_COOKIE)?.value);
  if (!draft) return null;

  const parsed = bookingRequestSchema.safeParse(draftToRequest(draft));
  if (!parsed.success) return null;

  const { id } = await createBookingRequest(db, customerId, parsed.data);
  store.delete(DRAFT_COOKIE);
  return id;
}

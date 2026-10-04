import type { Db } from '@/lib/db';
import type { BookingLeg, Operator, MarketKey } from '@/lib/types';
import { sendEmail } from '@/lib/email/resend';
import { rfqNotificationEmail, rfqSmsBody } from '@/lib/email/templates';

// Route distance estimates for range filtering (nm)
const ROUTE_DISTANCES: Record<string, number> = {
  // Hawaii inter-island
  'PHNL-PHOG': 100, 'PHNL-PHKO': 163, 'PHNL-PHLI': 102, 'PHNL-PHNY': 65,
  // Mainland→Hawaii
  'KLAX-PHNL': 2556, 'KSFO-PHNL': 2398, 'KSEA-PHNL': 2677, 'KLAS-PHNL': 2756,
  'KDEN-PHNL': 3365, 'KORD-PHNL': 4243, 'KJFK-PHNL': 4983, 'KATL-PHNL': 4502,
};

// Classify a route into a market
function classifyMarket(legs: BookingLeg[]): MarketKey {
  const codes = legs.flatMap(l => [l.origin_code, l.dest_code]);
  const hasHI = codes.some(c => c.startsWith('PH') || c === 'KHNL');
  const hasMainland = codes.some(c => c.startsWith('K') && !c.startsWith('KHNL'));

  if (hasHI && !hasMainland) return 'hi_inter';
  if (hasHI && hasMainland) return 'mainland_hi';

  const regions: Record<string, MarketKey> = {
    'KLAX': 'west', 'KVNY': 'west', 'KSFO': 'west', 'KSJC': 'west', 'KOAK': 'west', 'KSAN': 'west', 'KPDX': 'west', 'KSEA': 'west', 'KBFI': 'west',
    'KJFK': 'east', 'KTEB': 'east', 'KEWR': 'east', 'KLGA': 'east', 'KHPN': 'east', 'KFRG': 'east', 'KBOS': 'east', 'KBED': 'east', 'KPHL': 'east', 'KPBI': 'east', 'KIAD': 'east', 'KDCA': 'east',
    'KATL': 'se', 'KPDK': 'se', 'KMIA': 'se', 'KOPF': 'se', 'KFXE': 'se', 'KFLL': 'se', 'KTPA': 'se', 'KMCO': 'se', 'KBNA': 'se', 'KCLT': 'se',
    'KORD': 'central', 'KPWK': 'central', 'KMSP': 'central', 'KDTW': 'central', 'KCLE': 'central', 'KCMH': 'central', 'KIND': 'central', 'KMKE': 'central', 'KMCI': 'central', 'KSTL': 'central', 'KDEN': 'central', 'KAPA': 'central',
    'KDFW': 'sw', 'KDAL': 'sw', 'KHOU': 'sw', 'KIAH': 'sw', 'KSAT': 'sw', 'KAUS': 'sw', 'KLAS': 'sw', 'KVGT': 'sw', 'KPHX': 'sw', 'KSDL': 'sw',
    'TNCM': 'carib', 'TJSJ': 'carib', 'MYNN': 'carib', 'MBPV': 'carib', 'MDPC': 'carib',
    'EGLL': 'transatl', 'EGLF': 'transatl', 'LFPB': 'transatl', 'EDDF': 'transatl', 'EHAM': 'transatl',
  };

  for (const code of codes) {
    if (regions[code]) return regions[code];
  }
  return 'west'; // fallback
}

// Estimate route distance
function estimateDistance(legs: BookingLeg[]): number {
  let maxDist = 0;
  for (const leg of legs) {
    const key = `${leg.origin_code}-${leg.dest_code}`;
    const revKey = `${leg.dest_code}-${leg.origin_code}`;
    const dist = ROUTE_DISTANCES[key] || ROUTE_DISTANCES[revKey] || 1500;
    maxDist = Math.max(maxDist, dist);
  }
  return maxDist;
}

// Aircraft range by type
const FLEET_RANGE: Record<string, number> = {
  vlj: 1000, turboprop: 1200, light: 1500, mid: 2500, super_mid: 3500, heavy: 5000, ultra_long: 7500,
};

// Pax count → viable fleet types
function paxToFleetTypes(pax: number): string[] {
  if (pax <= 4) return ['vlj', 'light', 'turboprop', 'mid'];
  if (pax <= 6) return ['light', 'mid', 'turboprop', 'super_mid'];
  if (pax <= 8) return ['mid', 'super_mid'];
  if (pax <= 10) return ['super_mid', 'heavy'];
  if (pax <= 14) return ['heavy', 'ultra_long'];
  return ['ultra_long'];
}

export interface MatchedOperator {
  operator: Operator;
  score: number;
  reasons: string[];
}

export async function matchOperators(
  db: Db,
  requestId: number,
  legs: BookingLeg[],
  passengerCount: number
): Promise<MatchedOperator[]> {
  const market = classifyMarket(legs);
  const distance = estimateDistance(legs);
  const viableFleetTypes = paxToFleetTypes(passengerCount);
  const viableForRange = viableFleetTypes.filter(t => FLEET_RANGE[t] >= distance);

  const fleetFilter = viableForRange.length > 0 ? viableForRange : ['heavy', 'ultra_long'];

  const operators = await db.query<Operator>(
    "SELECT * FROM operators WHERE status = 'approved'"
  );

  const results: MatchedOperator[] = [];

  for (const op of operators) {
    let score = 0;
    const reasons: string[] = [];

    let opMarkets: string[] = [];
    try { opMarkets = op.markets ? JSON.parse(op.markets) : []; } catch { /* empty */ }

    let opFleet: string[] = [];
    try { opFleet = op.fleet_types ? JSON.parse(op.fleet_types) : []; } catch { /* empty */ }

    if (opMarkets.includes(market)) {
      score += 40;
      reasons.push(`Serves ${market} market`);
    } else {
      if (opMarkets.length === 0) {
        score += 15;
        reasons.push('Market coverage not configured');
      } else {
        continue;
      }
    }

    const fleetMatch = fleetFilter.some(t => opFleet.includes(t));
    if (fleetMatch) {
      score += 20;
      reasons.push('Fleet type match');
    } else if (opFleet.length === 0) {
      const aircraftCount = (await db.one<{ c: number }>(
        'SELECT COUNT(*) as c FROM aircraft WHERE operator_id = ? AND capacity >= ?',
        [op.id, passengerCount]
      ))!.c;
      if (aircraftCount > 0) {
        score += 20;
        reasons.push('Aircraft in fleet match capacity');
      } else {
        score += 5;
        reasons.push('Fleet not fully configured');
      }
    }

    const safetyScores: Record<string, number> = {
      'ARGUS Platinum': 25, 'Wyvern Wingman': 25, 'IS-BAO Stage 3': 25,
      'ARGUS Gold': 18, 'IS-BAO Stage 2': 18, 'Part 135 Certified': 10,
    };
    const safetyScore = safetyScores[op.safety_rating || ''] || 10;
    score += safetyScore;
    if (op.safety_rating) reasons.push(op.safety_rating);

    if ((market === 'hi_inter' || market === 'mainland_hi') && !op.hi_capable) {
      score -= 30;
    }
    if (distance > 3000 && !op.transoceanic) {
      score -= 20;
    }

    const accepted = (await db.one<{ c: number }>(
      "SELECT COUNT(*) as c FROM quotes WHERE operator_id = ? AND status = 'accepted'",
      [op.id]
    ))!.c;
    const perfScore = Math.min(accepted * 3, 15);
    score += perfScore;
    if (accepted > 0) reasons.push(`${accepted} bookings won`);

    if (score > 20) {
      results.push({ operator: op, score, reasons });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

export function generateRFQ(
  legs: BookingLeg[],
  passengerCount: number,
  notes: string | null,
  requestId: number
): { subject: string; body: string } {
  const route = legs.map(l => l.origin_code).join(' → ') + ' → ' + legs[legs.length - 1].dest_code;
  const dateRange = legs.length > 1
    ? `${legs[0].departure_date} — ${legs[legs.length - 1].departure_date}`
    : legs[0].departure_date;

  const subject = `Charter Quote Request #${requestId} — ${route}`;

  const legDetails = legs.map((l, i) =>
    `  Leg ${i + 1}: ${l.origin_code} → ${l.dest_code} | ${l.departure_date}${l.departure_time ? ` @ ${l.departure_time}` : ''}`
  ).join('\n');

  const body = `New charter request from Bespoke Flights.

REQUEST #${requestId}
ROUTE: ${route}
DATES: ${dateRange}
PASSENGERS: ${passengerCount}
${notes ? `NOTES: ${notes}` : ''}

ITINERARY:
${legDetails}

QUOTE REQUIREMENTS:
• Aircraft type + tail number
• All-in price (fuel, crew, landing fees, FET)
• Repositioning fees (if any)
• Catering inclusions
• Cancellation terms

Submit your quote at: https://bespoke.flights/operator/inbound

No markup on your quoted price. Commission on confirmed booking only.

— Bespoke Flights`;

  return { subject, body };
}

/**
 * Deliver an RFQ notification to an operator via their preferred method.
 * Uses Resend for email. SMS is stubbed for future Twilio integration.
 */
async function deliverRFQ(
  op: Operator,
  rfqData: {
    requestId: number;
    route: string;
    dateRange: string;
    passengerCount: number;
    notes: string | null;
    legDetails: string[];
    matchScore: number;
  }
): Promise<{ emailId: string | null; error: string | null }> {
  const method = op.contact_method || 'email';
  let emailId: string | null = null;
  let error: string | null = null;

  // Email delivery via Resend
  if (method === 'email' || method === 'both') {
    const toEmail = op.contact_email;
    if (toEmail) {
      const { subject, html } = rfqNotificationEmail({
        ...rfqData,
        operatorCompany: op.company_name,
      });

      const result = await sendEmail({
        to: toEmail,
        subject,
        html,
        replyTo: 'quotes@bespoke.flights',
        tags: [
          { name: 'type', value: 'rfq-notification' },
          { name: 'request_id', value: String(rfqData.requestId) },
          { name: 'operator_id', value: String(op.id) },
        ],
      });

      emailId = result.id;
      if (result.error) error = result.error;
    }
  }

  // SMS delivery — stubbed for Twilio
  if (method === 'text' || method === 'both') {
    if (op.contact_phone) {
      const _smsBody = rfqSmsBody({
        requestId: rfqData.requestId,
        route: rfqData.route,
        dateRange: rfqData.dateRange,
        passengerCount: rfqData.passengerCount,
      });
      // TODO: Twilio integration
      // await twilioClient.messages.create({ to: op.contact_phone, from: TWILIO_FROM, body: smsBody });
      console.log(`[SMS STUB] Would text ${op.contact_phone}: RFQ #${rfqData.requestId}`);
    }
  }

  return { emailId, error };
}

/**
 * Run the full outreach pipeline for a new booking request.
 * Called automatically when a booking request is created.
 *
 * Matches operators → logs outreach → delivers via Resend (email) or SMS stub.
 * Delivery runs in the background; `deliveries` settles when it finishes.
 * Route handlers pass it to next/server `after()` so serverless functions
 * stay alive until delivery completes.
 */
export async function dispatchOutreach(
  db: Db,
  requestId: number,
  legs: BookingLeg[],
  passengerCount: number,
  notes: string | null
): Promise<{ matched: number; dispatched: number; deliveries: Promise<void> }> {
  const matches = await matchOperators(db, requestId, legs, passengerCount);
  const { subject, body } = generateRFQ(legs, passengerCount, notes, requestId);

  const route = legs.map(l => l.origin_code).join(' → ') + ' → ' + legs[legs.length - 1].dest_code;
  const dateRange = legs.length > 1
    ? `${legs[0].departure_date} — ${legs[legs.length - 1].departure_date}`
    : legs[0].departure_date;
  const legDetails = legs.map((l, i) =>
    `Leg ${i + 1}: ${l.origin_code} → ${l.dest_code} | ${l.departure_date}${l.departure_time ? ` @ ${l.departure_time}` : ''}`
  );

  let dispatched = 0;
  const pending: Promise<void>[] = [];

  for (const match of matches) {
    const op = match.operator;
    const method = op.contact_method || 'pending';

    // Log the outreach first as 'sent'; skip operators already contacted for this request
    const inserted = await db.run(`
      INSERT INTO outreach_log (request_id, operator_id, method, match_score, rfq_subject, rfq_body, status)
      VALUES (?, ?, ?, ?, ?, ?, 'sent')
      ON CONFLICT (request_id, operator_id) DO NOTHING
    `, [requestId, op.id, method, match.score, subject, body]);
    if (inserted === 0) continue;
    dispatched++;

    pending.push(
      deliverRFQ(op, {
        requestId,
        route,
        dateRange,
        passengerCount,
        notes,
        legDetails,
        matchScore: match.score,
      }).then(async result => {
        if (result.emailId && !result.error) {
          await db.run("UPDATE outreach_log SET status = 'delivered' WHERE request_id = ? AND operator_id = ?", [requestId, op.id]);
        } else if (result.error) {
          await db.run("UPDATE outreach_log SET status = 'failed' WHERE request_id = ? AND operator_id = ?", [requestId, op.id]);
          console.error(`RFQ delivery failed for operator ${op.id}:`, result.error);
        }
      }).catch(err => {
        console.error(`RFQ delivery error for operator ${op.id}:`, err);
      })
    );
  }

  return { matched: matches.length, dispatched, deliveries: Promise.all(pending).then(() => {}) };
}

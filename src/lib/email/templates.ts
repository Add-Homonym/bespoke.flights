/**
 * Email templates for Bespoke Flights.
 *
 * All templates return { subject, html } ready for sendEmail().
 */

const BRAND = {
  dark: '#0f1724',
  navy: '#1a2332',
  gold: '#c9a55a',
  cream: '#f5f0e8',
  muted: '#8b95a5',
};

function layout(body: string): string {
  return '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:' + BRAND.dark + ';font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + BRAND.dark + '">' +
    '<tr><td align="center" style="padding:40px 20px">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">' +
    // Header
    '<tr><td style="padding:0 0 30px 0">' +
    '<span style="font-size:22px;color:' + BRAND.cream + ';font-weight:600">bespoke</span>' +
    '<span style="font-size:22px;color:' + BRAND.gold + ';font-weight:600">.flights</span>' +
    '</td></tr>' +
    // Body
    '<tr><td style="background:' + BRAND.navy + ';border-radius:12px;padding:40px">' +
    body +
    '</td></tr>' +
    // Footer
    '<tr><td style="padding:30px 0 0 0;text-align:center">' +
    '<p style="margin:0;color:' + BRAND.muted + ';font-size:12px">Bespoke Flights Inc. &middot; Honolulu, HI</p>' +
    '<p style="margin:8px 0 0 0;color:' + BRAND.muted + ';font-size:12px">' +
    '<a href="https://bespoke.flights" style="color:' + BRAND.muted + '">bespoke.flights</a>' +
    '</p>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function button(text: string, url: string): string {
  return '<table cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td>' +
    '<a href="' + url + '" style="display:inline-block;background:' + BRAND.gold +
    ';color:' + BRAND.dark + ';font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none">' +
    text + '</a></td></tr></table>';
}

function p(text: string, style?: string): string {
  return '<p style="margin:0 0 16px 0;color:' + BRAND.cream + ';font-size:15px;line-height:1.6;' + (style || '') + '">' + text + '</p>';
}

// ─── Operator Invite (cold outreach) ────────────────────────────────

export function operatorInviteEmail(companyName: string, certNumber?: string): { subject: string; html: string } {
  const subject = companyName + ' — Receive Charter Quote Requests, No Broker Markup';

  const body =
    '<h1 style="margin:0 0 24px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">' +
    'Charter requests, direct to your dispatch' +
    '</h1>' +
    p('Hi ' + companyName + ' team,') +
    p('We found your FAA Part 135 certificate' +
      (certNumber ? ' (' + certNumber + ')' : '') +
      ' and wanted to introduce Bespoke Flights &mdash; a charter marketplace that connects travelers directly with operators like you.') +
    p('<strong style="color:' + BRAND.gold + '">How it works:</strong>') +
    '<table cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;width:100%">' +
    featureRow('1', 'Travelers submit charter requests (route, dates, pax count)') +
    featureRow('2', 'Our matching engine routes the RFQ to qualified operators') +
    featureRow('3', 'You quote your price &mdash; no markup, no middleman') +
    featureRow('4', 'We earn a small commission only on confirmed bookings') +
    '</table>' +
    p('No subscription fees. No listing costs. You only see requests that match your fleet and markets.') +
    button('Set Up Your Operator Account', 'https://bespoke.flights/register?role=operator') +
    p('Takes about 2 minutes. Once approved, RFQs arrive via your preferred method &mdash; email, text, or both.', 'color:' + BRAND.muted + ';font-size:13px') +
    '<hr style="border:none;border-top:1px solid #2a3444;margin:28px 0">' +
    p('Questions? Reply to this email or visit <a href="https://bespoke.flights" style="color:' + BRAND.gold + '">bespoke.flights</a>.', 'color:' + BRAND.muted + ';font-size:13px') +
    p('If you\'d prefer not to receive messages from us, <a href="https://bespoke.flights/unsubscribe" style="color:' + BRAND.muted + '">unsubscribe here</a>.', 'color:' + BRAND.muted + ';font-size:12px');

  return { subject, html: layout(body) };
}

function featureRow(num: string, text: string): string {
  return '<tr>' +
    '<td style="width:32px;vertical-align:top;padding:6px 0">' +
    '<span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:' + BRAND.gold + '20;color:' + BRAND.gold + ';font-size:13px;font-weight:600;text-align:center;line-height:24px">' +
    num + '</span></td>' +
    '<td style="padding:6px 0 6px 12px;color:' + BRAND.cream + ';font-size:14px;line-height:1.5">' + text + '</td>' +
    '</tr>';
}

// ─── RFQ Notification (to matched operators) ────────────────────────

export interface RFQEmailData {
  requestId: number;
  route: string;
  dateRange: string;
  passengerCount: number;
  notes: string | null;
  legDetails: string[];
  matchScore: number;
  operatorCompany: string;
}

export function rfqNotificationEmail(data: RFQEmailData): { subject: string; html: string } {
  const subject = 'Charter Quote Request #' + data.requestId + ' — ' + data.route;

  const legsHtml = data.legDetails.map(leg =>
    '<tr><td style="padding:8px 12px;color:' + BRAND.cream + ';font-size:14px;font-family:monospace;border-bottom:1px solid #2a3444">' + leg + '</td></tr>'
  ).join('');

  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">' +
    'New Charter Request' +
    '</h1>' +
    p('Request #' + data.requestId + ' &middot; Match score: ' + data.matchScore, 'color:' + BRAND.muted + ';font-size:13px') +
    '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px;margin:20px 0">' +
    '<tr><td style="padding:16px">' +
    '<table cellpadding="0" cellspacing="0" style="width:100%">' +
    summaryRow('Route', data.route) +
    summaryRow('Dates', data.dateRange) +
    summaryRow('Passengers', String(data.passengerCount)) +
    (data.notes ? summaryRow('Notes', data.notes) : '') +
    '</table></td></tr></table>' +
    '<h2 style="margin:24px 0 12px 0;color:' + BRAND.muted + ';font-size:12px;text-transform:uppercase;letter-spacing:1px">Itinerary</h2>' +
    '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px">' +
    legsHtml +
    '</table>' +
    button('Submit Your Quote', 'https://bespoke.flights/operator/inbound') +
    p('No markup on your quoted price. Commission on confirmed booking only.', 'color:' + BRAND.muted + ';font-size:13px');

  return { subject, html: layout(body) };
}

function summaryRow(label: string, value: string): string {
  return '<tr>' +
    '<td style="padding:4px 0;color:' + BRAND.muted + ';font-size:13px;width:100px">' + label + '</td>' +
    '<td style="padding:4px 0;color:' + BRAND.cream + ';font-size:14px;font-weight:500">' + value + '</td>' +
    '</tr>';
}

// ─── RFQ SMS (short version for text) ───────────────────────────────

export function rfqSmsBody(data: { requestId: number; route: string; dateRange: string; passengerCount: number }): string {
  return 'Bespoke Flights RFQ #' + data.requestId +
    '\n' + data.route +
    '\n' + data.dateRange + ' | ' + data.passengerCount + ' pax' +
    '\nQuote at: bespoke.flights/operator/inbound';
}

// ─── Payment Receipt (to customer) ──────────────────────────────────

export interface BookingPaymentEmailData {
  requestId: number;
  route: string;
  dateRange: string;
  passengerCount: number;
  operatorCompany: string;
  aircraft: string | null;
  amount: string;
  baseUrl: string;
}

export function paymentReceiptEmail(data: BookingPaymentEmailData): { subject: string; html: string } {
  const subject = 'Booking confirmed — ' + data.route;

  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">' +
    'Your charter is booked' +
    '</h1>' +
    p('Request #' + data.requestId + ' &middot; Payment received', 'color:' + BRAND.muted + ';font-size:13px') +
    '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px;margin:20px 0">' +
    '<tr><td style="padding:16px">' +
    '<table cellpadding="0" cellspacing="0" style="width:100%">' +
    summaryRow('Route', data.route) +
    summaryRow('Dates', data.dateRange) +
    summaryRow('Passengers', String(data.passengerCount)) +
    summaryRow('Operator', data.operatorCompany) +
    (data.aircraft ? summaryRow('Aircraft', data.aircraft) : '') +
    summaryRow('Total paid', data.amount) +
    '</table></td></tr></table>' +
    p(data.operatorCompany + ' will contact you to confirm passenger details and flight logistics.') +
    button('View Booking', data.baseUrl + '/requests/' + data.requestId);

  return { subject, html: layout(body) };
}

// ─── Booking Confirmed (to operator) ────────────────────────────────

export function bookingConfirmedOperatorEmail(
  data: BookingPaymentEmailData & { platformFee: string; payout: string }
): { subject: string; html: string } {
  const subject = 'Quote accepted and paid — Request #' + data.requestId + ' — ' + data.route;

  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">' +
    'You have a confirmed booking' +
    '</h1>' +
    p('Request #' + data.requestId + ' &middot; Customer payment received', 'color:' + BRAND.muted + ';font-size:13px') +
    '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px;margin:20px 0">' +
    '<tr><td style="padding:16px">' +
    '<table cellpadding="0" cellspacing="0" style="width:100%">' +
    summaryRow('Route', data.route) +
    summaryRow('Dates', data.dateRange) +
    summaryRow('Passengers', String(data.passengerCount)) +
    (data.aircraft ? summaryRow('Aircraft', data.aircraft) : '') +
    summaryRow('Quote', data.amount) +
    summaryRow('Platform fee', data.platformFee) +
    summaryRow('Your payout', data.payout) +
    '</table></td></tr></table>' +
    p('Funds are transferred to your connected payout account and paid out on your Stripe payout schedule.') +
    button('View Request', data.baseUrl + '/operator/requests/' + data.requestId);

  return { subject, html: layout(body) };
}

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

/** Escape user-entered text before it goes into email HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
  /** When set, the operator may quote by replying to this email. */
  replyToQuote?: boolean;
}

export function rfqNotificationEmail(data: RFQEmailData): { subject: string; html: string } {
  const subject = 'Charter Quote Request #' + data.requestId + ' — ' + data.route;

  const legsHtml = data.legDetails.map(leg =>
    '<tr><td style="padding:8px 12px;color:' + BRAND.cream + ';font-size:14px;font-family:monospace;border-bottom:1px solid #2a3444">' + escapeHtml(leg) + '</td></tr>'
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
    summaryRow('Special requests', data.notes ? escapeHtml(data.notes) : 'None') +
    '</table></td></tr></table>' +
    '<h2 style="margin:24px 0 12px 0;color:' + BRAND.muted + ';font-size:12px;text-transform:uppercase;letter-spacing:1px">Itinerary</h2>' +
    '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px">' +
    legsHtml +
    '</table>' +
    button('Submit Your Quote', 'https://bespoke.flights/operator/inbound') +
    (data.replyToQuote
      ? p('Or reply to this email with your all-in price, for example <strong style="color:' + BRAND.cream + '">Quote $12,500</strong>. Add a tail number and a validity date if you like: <em>$12,500 N123AB valid 2026-11-01</em>. The rest of your reply reaches the traveler as your message.', 'color:' + BRAND.muted + ';font-size:13px')
      : '') +
    p('No markup on your quoted price. Commission on confirmed booking only.', 'color:' + BRAND.muted + ';font-size:13px');

  return { subject, html: layout(body) };
}

// ─── Reply-by-email quoting: receipts to the operator ─────────────

export function quoteConfirmationEmail(data: { requestId: number; priceCents: number; url: string }): { subject: string; html: string } {
  const price = '$' + (data.priceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">Quote received</h1>' +
    p('Your reply quoted <strong style="color:' + BRAND.cream + '">' + price + '</strong> on request #' + data.requestId + '. The traveler has been notified.') +
    button('View the request', data.url);
  return { subject: 'Quote received — Request #' + data.requestId, html: layout(body) };
}

export function quoteRejectedEmail(data: { requestId: number; reason: string; url: string }): { subject: string; html: string } {
  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">We could not record your quote</h1>' +
    p('Request #' + data.requestId + ': ' + escapeHtml(data.reason)) +
    p('Reply again with the price on its own line, or quote from your dashboard.', 'color:' + BRAND.muted + ';font-size:13px') +
    button('Quote from the dashboard', data.url);
  return { subject: 'Quote not recorded — Request #' + data.requestId, html: layout(body) };
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
  /** One line per leg with date and time. */
  legLines: string[];
  specialRequests: string | null;
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
    data.legLines.map((line, i) => summaryRow(i === 0 ? 'Legs' : '', escapeHtml(line.replace(/^Leg \d+: /, '')))).join('') +
    summaryRow('Passengers', String(data.passengerCount)) +
    summaryRow('Special requests', data.specialRequests ? escapeHtml(data.specialRequests) : 'None') +
    summaryRow('Operator', data.operatorCompany) +
    (data.aircraft ? summaryRow('Aircraft', data.aircraft) : '') +
    summaryRow('Total paid', data.amount) +
    '</table></td></tr></table>' +
    p(data.operatorCompany + ' will confirm passenger details and flight logistics with you in the app.') +
    button('View Booking', data.baseUrl + '/requests/' + data.requestId) +
    p('<a href="' + data.baseUrl + '/requests/' + data.requestId + '/receipt" style="color:' + BRAND.gold + '">Printable receipt</a>', 'color:' + BRAND.muted + ';font-size:13px');

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
    data.legLines.map((line, i) => summaryRow(i === 0 ? 'Legs' : '', escapeHtml(line.replace(/^Leg \d+: /, '')))).join('') +
    summaryRow('Passengers', String(data.passengerCount)) +
    summaryRow('Special requests', data.specialRequests ? escapeHtml(data.specialRequests) : 'None') +
    (data.aircraft ? summaryRow('Aircraft', data.aircraft) : '') +
    summaryRow('Quote', data.amount) +
    summaryRow('Platform fee', data.platformFee) +
    summaryRow('Your payout', data.payout) +
    '</table></td></tr></table>' +
    p('Funds are transferred to your connected payout account and paid out on your Stripe payout schedule.') +
    button('View Request', data.baseUrl + '/operator/requests/' + data.requestId);

  return { subject, html: layout(body) };
}

// ─── Trip Sheet (operator to their own staff) ───────────────────────

export function tripSheetEmail(data: {
  requestId: number;
  route: string;
  legLines: string[];
  passengerCount: number;
  specialRequests: string | null;
  aircraft: string | null;
  operatorCompany: string;
  senderName: string;
  url: string;
}): { subject: string; html: string } {
  const subject = 'Trip sheet: ' + data.route + ' (Booking #' + data.requestId + ')';

  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">' +
    'Confirmed charter: ' + escapeHtml(data.route) +
    '</h1>' +
    p(escapeHtml(data.senderName) + ' at ' + escapeHtml(data.operatorCompany) + ' shared this booking with you.', 'color:' + BRAND.muted + ';font-size:13px') +
    '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px;margin:20px 0">' +
    '<tr><td style="padding:16px">' +
    '<table cellpadding="0" cellspacing="0" style="width:100%">' +
    summaryRow('Booking', '#' + data.requestId) +
    data.legLines.map((line, i) => summaryRow(i === 0 ? 'Legs' : '', escapeHtml(line.replace(/^Leg \d+: /, '')))).join('') +
    (data.aircraft ? summaryRow('Aircraft', escapeHtml(data.aircraft)) : '') +
    summaryRow('Passengers', String(data.passengerCount)) +
    summaryRow('Special requests', data.specialRequests ? escapeHtml(data.specialRequests) : 'None') +
    '</table></td></tr></table>' +
    button('Open Trip Sheet', data.url) +
    p('The trip sheet includes the lead passenger’s contact details. Do not forward it outside your company.', 'color:' + BRAND.muted + ';font-size:12px');

  return { subject, html: layout(body) };
}

// ─── Staff alert (operator's own staff) ─────────────────────────────

export function staffAlertEmail(data: {
  subject: string;
  heading: string;
  intro: string;
  legLines: string[];
  passengerCount: number;
  specialRequests: string | null;
  aircraft: string | null;
  leadPassenger: string | null;
  url: string;
  buttonLabel: string;
}): { subject: string; html: string } {
  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">' + escapeHtml(data.heading) + '</h1>' +
    p(escapeHtml(data.intro), 'color:' + BRAND.muted + ';font-size:13px') +
    '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px;margin:20px 0">' +
    '<tr><td style="padding:16px">' +
    '<table cellpadding="0" cellspacing="0" style="width:100%">' +
    data.legLines.map((line, i) => summaryRow(i === 0 ? 'Legs' : '', escapeHtml(line.replace(/^Leg \d+: /, '')))).join('') +
    (data.aircraft ? summaryRow('Aircraft', escapeHtml(data.aircraft)) : '') +
    summaryRow('Passengers', String(data.passengerCount)) +
    summaryRow('Special requests', data.specialRequests ? escapeHtml(data.specialRequests) : 'None') +
    (data.leadPassenger ? summaryRow('Lead passenger', escapeHtml(data.leadPassenger)) : '') +
    '</table></td></tr></table>' +
    button(escapeHtml(data.buttonLabel), data.url) +
    p('You receive this because your company added you to its bespoke.flights alerts.', 'color:' + BRAND.muted + ';font-size:12px');

  return { subject: data.subject, html: layout(body) };
}

// ─── Change request (traveler proposes, operator resolves) ──────────

export function changeRequestEmail(data: {
  event: 'proposed' | 'accepted' | 'accepted_payment_due' | 'applied' | 'declined';
  audience: 'customer' | 'operator';
  requestId: number;
  changeRequestId: number;
  route: string;
  proposedLegLines: string[];
  currentLegLines: string[];
  passengerCount: number;
  notes: string | null;
  operatorNote: string | null;
  operatorCompany: string;
  customerName: string;
  amount: string | null;
  url: string | null;
  baseUrl: string;
}): { subject: string; html: string } {
  const customer = data.audience === 'customer';
  const pageUrl = customer ? data.baseUrl + '/requests/' + data.requestId : data.baseUrl + '/operator/requests/' + data.requestId;
  let heading: string, subject: string, lead: string, cta: string, ctaUrl = pageUrl;
  switch (data.event) {
    case 'proposed':
      subject = 'Change requested — Request #' + data.requestId + ' — ' + data.route;
      heading = 'A traveler asked to change a booked trip';
      lead = escapeHtml(data.customerName) + ' proposed a new itinerary for booking #' + data.requestId + '. Accept it (at the same or a new all-in price) or decline it with a note.';
      cta = 'Review change request';
      break;
    case 'accepted':
      subject = 'Change accepted — Request #' + data.requestId + ' — ' + data.route;
      heading = customer ? 'Your change is confirmed' : 'Itinerary updated';
      lead = (customer ? escapeHtml(data.operatorCompany) + ' accepted your change.' : 'You accepted the traveler\'s change.') +
        (data.amount ? ' ' + data.amount + ' is being refunded for the lower price.' : ' The price is unchanged.') + ' The booking now shows the new itinerary.';
      cta = 'View trip';
      break;
    case 'accepted_payment_due':
      subject = 'Change accepted, payment due — Request #' + data.requestId;
      heading = 'Your change is accepted: pay the difference to confirm';
      lead = escapeHtml(data.operatorCompany) + ' accepted your change at a new price. Pay ' + (data.amount ?? 'the difference') + ' to apply it. Until then the original itinerary stands.';
      cta = 'Pay the difference';
      ctaUrl = data.url ?? pageUrl;
      break;
    case 'applied':
      subject = 'Itinerary updated — Request #' + data.requestId + ' — ' + data.route;
      heading = customer ? 'Your new itinerary is confirmed' : 'Itinerary updated and paid';
      lead = customer ? 'Payment received. The booking now shows the new itinerary.' : 'The traveler paid the difference. The booking now shows the new itinerary.';
      cta = 'View trip';
      break;
    default:
      subject = 'Change declined — Request #' + data.requestId + ' — ' + data.route;
      heading = 'Your change could not be accommodated';
      lead = escapeHtml(data.operatorCompany) + ' declined the change. Your original booking stands. You can message the operator or propose a different change.';
      cta = 'View trip';
  }

  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">' + heading + '</h1>' +
    p('Request #' + data.requestId + ' &middot; Change #' + data.changeRequestId, 'color:' + BRAND.muted + ';font-size:13px') +
    p(lead) +
    '<h2 style="margin:24px 0 12px 0;color:' + BRAND.muted + ';font-size:12px;text-transform:uppercase;letter-spacing:1px">Proposed itinerary</h2>' +
    '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px;margin:0 0 20px 0">' +
    '<tr><td style="padding:16px"><table cellpadding="0" cellspacing="0" style="width:100%">' +
    data.proposedLegLines.map((line, i) => summaryRow(i === 0 ? 'Legs' : '', escapeHtml(line.replace(/^Leg \d+: /, '')))).join('') +
    summaryRow('Passengers', String(data.passengerCount)) +
    summaryRow('Special requests', data.notes ? escapeHtml(data.notes) : 'None') +
    '</table></td></tr></table>' +
    (data.event === 'proposed' && data.currentLegLines.length
      ? '<h2 style="margin:0 0 12px 0;color:' + BRAND.muted + ';font-size:12px;text-transform:uppercase;letter-spacing:1px">Current itinerary</h2>' +
        '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px;margin:0 0 20px 0">' +
        '<tr><td style="padding:16px"><table cellpadding="0" cellspacing="0" style="width:100%">' +
        data.currentLegLines.map((line, i) => summaryRow(i === 0 ? 'Legs' : '', escapeHtml(line.replace(/^Leg \d+: /, '')))).join('') +
        '</table></td></tr></table>'
      : '') +
    (data.operatorNote ? p('Operator note: ' + escapeHtml(data.operatorNote), 'color:' + BRAND.muted + ';font-size:13px') : '') +
    button(cta, ctaUrl);

  return { subject, html: layout(body) };
}

// ─── New quote (to the traveler) ────────────────────────────────────

export function newQuoteEmail(data: {
  requestId: number;
  route: string;
  operatorCompany: string;
  aircraft: string | null;
  price: string;
  validUntil: string | null;
  message: string | null;
  quoteCount: number;
  baseUrl: string;
  /** 'new' for a first quote, 'revised' when the operator changed it. */
  kind?: 'new' | 'revised';
  previousPrice?: string | null;
}): { subject: string; html: string } {
  const revised = data.kind === 'revised';
  const subject = (revised ? 'Quote revised — ' : 'New quote — ') + data.price + ' from ' + data.operatorCompany + ' — Request #' + data.requestId;
  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">' +
    (revised ? 'A quote on your trip was revised' : 'You have a new quote') + '</h1>' +
    p('Request #' + data.requestId + ' &middot; ' + escapeHtml(data.route), 'color:' + BRAND.muted + ';font-size:13px') +
    '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px;margin:20px 0">' +
    '<tr><td style="padding:16px"><table cellpadding="0" cellspacing="0" style="width:100%">' +
    summaryRow('Operator', escapeHtml(data.operatorCompany) + ' &middot; Part 135') +
    (data.aircraft ? summaryRow('Aircraft', escapeHtml(data.aircraft)) : '') +
    summaryRow('All-in price', data.price) +
    (revised && data.previousPrice ? summaryRow('Previously', data.previousPrice) : '') +
    (data.validUntil ? summaryRow('Valid until', escapeHtml(data.validUntil)) : '') +
    (data.message ? summaryRow('Message', escapeHtml(data.message)) : '') +
    '</table></td></tr></table>' +
    p(data.quoteCount > 1
      ? 'You now have ' + data.quoteCount + ' quotes to compare. Every price is all-in, with no broker markup.'
      : 'Every price is all-in, with no broker markup. More quotes may follow as other operators respond.') +
    button('Compare quotes', data.baseUrl + '/requests/' + data.requestId);
  return { subject, html: layout(body) };
}

// ─── Status change (to the traveler or the operator) ────────────────

/** A short, plain status email: used where no richer template applies. */
export function statusUpdateEmail(data: {
  requestId: number;
  route: string;
  heading: string;
  text: string;
  url: string;
  buttonLabel: string;
}): { subject: string; html: string } {
  const subject = data.heading + ' — Request #' + data.requestId;
  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">' + escapeHtml(data.heading) + '</h1>' +
    p('Request #' + data.requestId + ' &middot; ' + escapeHtml(data.route), 'color:' + BRAND.muted + ';font-size:13px') +
    p(escapeHtml(data.text)) +
    button(escapeHtml(data.buttonLabel), data.url);
  return { subject, html: layout(body) };
}

// ─── New message (in-app thread) ────────────────────────────────────

/** Points at the thread; the body stays in the app so contact details never travel by email. */
export function newMessageEmail(data: { requestId: number; route: string; senderName: string; url: string }): { subject: string; html: string } {
  const subject = 'New message from ' + data.senderName + ' — Request #' + data.requestId;
  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">You have a new message</h1>' +
    p('Request #' + data.requestId + ' &middot; ' + escapeHtml(data.route), 'color:' + BRAND.muted + ';font-size:13px') +
    p(escapeHtml(data.senderName) + ' wrote to you about this trip. Read and reply in bespoke.flights.') +
    button('Open conversation', data.url) +
    p('You get at most one of these emails every 10 minutes per conversation.', 'color:' + BRAND.muted + ';font-size:12px');
  return { subject, html: layout(body) };
}

// ─── Booking cancelled (customer and operator) ──────────────────────

export function bookingCancelledEmail(data: {
  audience: 'customer' | 'operator';
  requestId: number;
  route: string;
  legLines: string[];
  passengerCount: number;
  operatorCompany: string;
  paid: string;
  refund: string;
  tier: 'full' | 'partial' | 'none';
  policyText: string;
  baseUrl: string;
}): { subject: string; html: string } {
  const customer = data.audience === 'customer';
  const subject = 'Booking cancelled — Request #' + data.requestId + ' — ' + data.route;
  const refundLine = data.tier === 'none'
    ? 'No refund is due under the cancellation policy.'
    : (customer ? 'A refund of ' + data.refund + ' is on its way to your original payment method.'
                : data.refund + ' is being returned to the traveler; the rest stays with your payout.');

  const body =
    '<h1 style="margin:0 0 8px 0;color:' + BRAND.cream + ';font-size:22px;font-weight:600">' +
    (customer ? 'Your trip is cancelled' : 'A charter was cancelled') +
    '</h1>' +
    p('Request #' + data.requestId, 'color:' + BRAND.muted + ';font-size:13px') +
    '<table cellpadding="0" cellspacing="0" style="width:100%;background:#0f1724;border-radius:8px;margin:20px 0">' +
    '<tr><td style="padding:16px">' +
    '<table cellpadding="0" cellspacing="0" style="width:100%">' +
    summaryRow('Route', escapeHtml(data.route)) +
    data.legLines.map((line, i) => summaryRow(i === 0 ? 'Legs' : '', escapeHtml(line.replace(/^Leg \d+: /, '')))).join('') +
    summaryRow('Passengers', String(data.passengerCount)) +
    summaryRow('Operator', escapeHtml(data.operatorCompany)) +
    summaryRow('Paid', data.paid) +
    summaryRow('Refund', data.refund) +
    '</table></td></tr></table>' +
    p(refundLine) +
    p('Policy: ' + escapeHtml(data.policyText), 'color:' + BRAND.muted + ';font-size:13px') +
    (customer
      ? button('View trip', data.baseUrl + '/requests/' + data.requestId)
      : button('View request', data.baseUrl + '/operator/requests/' + data.requestId));

  return { subject, html: layout(body) };
}

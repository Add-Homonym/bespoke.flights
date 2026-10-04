import { describe, expect, it } from 'vitest';
import { paymentReceiptEmail, bookingConfirmedOperatorEmail, rfqNotificationEmail, escapeHtml } from './templates';

const data = {
  requestId: 7,
  route: 'KLAX → PHNL → KLAX',
  dateRange: '2026-12-01 — 2026-12-08',
  legLines: ['Leg 1: KLAX → PHNL · Tue, Dec 1, 2026, 9:30 AM', 'Leg 2: PHNL → KLAX · Tue, Dec 8, 2026, any time'],
  specialRequests: 'Dog <Max> & "cake"',
  passengerCount: 3,
  operatorCompany: 'Alpha Air',
  aircraft: null,
  amount: '$85,000.00',
  baseUrl: 'https://bespoke.flights',
};

describe('booking emails show every trip detail', () => {
  for (const [name, html] of [
    ['receipt', paymentReceiptEmail(data).html],
    ['operator confirmation', bookingConfirmedOperatorEmail({ ...data, platformFee: '$4,250.00', payout: '$80,750.00' }).html],
  ] as const) {
    it(`${name}: legs with date and time, passengers, escaped special requests`, () => {
      expect(html).toContain('KLAX → PHNL · Tue, Dec 1, 2026, 9:30 AM');
      expect(html).toContain('PHNL → KLAX · Tue, Dec 8, 2026, any time');
      expect(html).toContain('Special requests');
      expect(html).toContain('Dog &lt;Max&gt; &amp; &quot;cake&quot;');
      expect(html).not.toContain('<Max>');
    });
  }

  it('says None when there are no special requests', () => {
    expect(paymentReceiptEmail({ ...data, specialRequests: null }).html).toMatch(/Special requests<\/td><td[^>]*>None</);
  });

  it('escapes traveler text in operator RFQ emails', () => {
    const html = rfqNotificationEmail({
      requestId: 7, route: 'KLAX → PHNL', dateRange: '2026-12-01', passengerCount: 2,
      notes: '<img src=x onerror=alert(1)>', legDetails: ['Leg 1: KLAX → PHNL | 2026-12-01'], matchScore: 80, operatorCompany: 'Alpha Air',
    }).html;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapeHtml covers the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

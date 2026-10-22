// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { TicketBookingForm } from './ticket-booking-form';
import type { BookingDraft } from '@/lib/bookings/draft';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

afterEach(cleanup);

const saved: BookingDraft = {
  passengerCount: 3,
  tags: [],
  custom: [],
  legs: [{ originCode: 'PHNL', destCode: 'PHOG', departureDate: '2030-06-01', departureTime: '' }],
  variant: 'ticket',
};

describe('TicketBookingForm', () => {
  it('shows the saved draft on the first render, before any effect runs', () => {
    render(<TicketBookingForm initialDraft={saved} viewerRole="customer" />);
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('HNL');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('OGG');
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2030-06-01');
  });

  it('renders the saved trip in the server HTML with the fields locked until React takes over', () => {
    const html = renderToString(<TicketBookingForm initialDraft={saved} viewerRole="customer" />);
    expect(html).toContain('value="HNL"');
    expect(html).toMatch(/<fieldset[^>]*disabled/);
  });

  it('typing in a restored field replaces it and never merges with the draft', async () => {
    const user = userEvent.setup();
    render(<TicketBookingForm initialDraft={saved} viewerRole="customer" />);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    await user.click(from);
    await user.keyboard('lax');
    expect(from.value).toBe('LAX');
    expect(from.value).not.toMatch(/HNL|PHNL/);
  });

  it('has an explicit Request quotes button, and tells you what is missing when the trip is incomplete', async () => {
    const user = userEvent.setup();
    render(<TicketBookingForm initialDraft={null} viewerRole="customer" />);
    const button = screen.getByRole('button', { name: 'Request quotes' });
    expect(button).toBeTruthy();
    await user.click(button);
    expect(screen.getByRole('alert').textContent).toMatch(/where from, where to and a date/);
  });

  it('shortens the airport placeholder so it fits a half-width cell', () => {
    render(<TicketBookingForm initialDraft={null} viewerRole={null} />);
    const from = screen.getByLabelText('From');
    expect(from.getAttribute('placeholder')).toBe('City or code');
    expect(from.className).toMatch(/placeholder:text-\[16px\]/);
  });
});

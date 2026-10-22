// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PaymentStatus, type PaymentSummary } from './payment-status';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }) }));

const payment: PaymentSummary = {
  id: 7, status: 'pending', provider: 'stub', amount: '$85,000.00', refunded: null,
  companyName: 'Alpha Air', paidAt: null, failureReason: null, checkoutUrl: null,
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); refresh.mockClear(); });

describe('PaymentStatus Pay button', () => {
  it('is disabled and reads "Paying…" while the call is pending, then shows Paid without a reload', async () => {
    let finish!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    render(<PaymentStatus payment={payment} returnedFromCheckout={false} />);
    const pay = screen.getByRole('button', { name: 'Pay $85,000.00' });
    fireEvent.click(pay);

    const busy = await screen.findByRole('button', { name: 'Paying…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    // A second tap while pending sends nothing more.
    fireEvent.click(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    finish(new Response(JSON.stringify({ outcome: 'booked', status: 'succeeded' }), { status: 200 }));
    await waitFor(() => expect(screen.getByText('Paid')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Pay|Paying/ })).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a plain message, never "Payment is succeeded", when the call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'This payment can no longer be completed.' }), { status: 409 })));
    render(<PaymentStatus payment={payment} returnedFromCheckout={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pay $85,000.00' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('can no longer be completed'));
    expect(document.body.textContent).not.toMatch(/Payment is succeeded/);
    expect((screen.getByRole('button', { name: 'Pay $85,000.00' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AirportField } from './route-field';

afterEach(cleanup);

/** Stored value is the ICAO code, as in the booking form. */
function Harness({ start = '' }: { start?: string }) {
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState('');
  return (
    <form>
      <AirportField id="from" label="From" value={from} onChange={setFrom} />
      <AirportField id="to" label="To" value={to} onChange={setTo} />
      <output data-testid="stored">{from}|{to}</output>
    </form>
  );
}

describe('AirportField', () => {
  it('Enter selects the top match and moves focus to the next field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const from = screen.getByLabelText('From');
    await user.click(from);
    await user.type(from, 'hnl');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('stored').textContent).toBe('PHNL|');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('To')));
    // The resolved airport reads as its IATA code.
    expect((from as HTMLInputElement).value).toBe('HNL');
  });

  it('picks the exact code ahead of looser matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const to = screen.getByLabelText('To');
    await user.click(to);
    await user.type(to, 'ogg{Enter}');
    expect(screen.getByTestId('stored').textContent).toBe('|PHOG');
  });

  it('replaces a resolved field instead of appending to it', async () => {
    const user = userEvent.setup();
    render(<Harness start="PHNL" />);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    expect(from.value).toBe('HNL');
    // Click into the field and type: the old airport is replaced.
    await user.click(from);
    await user.keyboard('ogg');
    expect(screen.getByTestId('stored').textContent).toBe('OGG|');
    expect(from.value).not.toContain('HNL');
  });

  it('replaces a resolved field even when the caret was placed at the end', async () => {
    const user = userEvent.setup();
    render(<Harness start="PHNL" />);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    await user.click(from);
    from.setSelectionRange(from.value.length, from.value.length);
    await user.keyboard('O');
    expect(screen.getByTestId('stored').textContent).toBe('O|');
  });
});

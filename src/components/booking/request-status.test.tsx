// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RequestStatusBadge } from './request-status';

afterEach(cleanup);

describe('RequestStatusBadge', () => {
  it('reads "Awaiting payment" for an empty leg that is held but unpaid', () => {
    render(<RequestStatusBadge status="quoted" emptyLeg />);
    expect(screen.getByText('Awaiting payment')).toBeTruthy();
  });

  it('reads "Booked" once paid, empty leg or not', () => {
    render(<RequestStatusBadge status="booked" emptyLeg />);
    expect(screen.getByText('Booked')).toBeTruthy();
  });
});

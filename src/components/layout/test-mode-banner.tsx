import { isTestMode } from '@/lib/payments/config';
import { DEMO_PASSWORD } from '@/lib/db/demo-data';

/** Site-wide notice shown when APP_TEST_MODE=true. */
export function TestModeBanner() {
  if (!isTestMode()) return null;
  return (
    <div role="status" className="bg-warning-tint text-warning border-b border-hairline text-sm text-center px-4 py-2 font-medium print:hidden">
      Test mode: all payments and payouts are simulated. No money moves.
      <span className="font-normal">
        {' '}Demo logins: admin@bespoke.flights, john@example.com, ops@eliteair.com (password {DEMO_PASSWORD}).
      </span>
    </div>
  );
}

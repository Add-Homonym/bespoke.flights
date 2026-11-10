import { Plane } from 'lucide-react';
import { findAirport } from '@/lib/airports';
import { formatTripDate, formatTripTime, type TripLeg } from '@/lib/trip-format';

/** Shimmering bar for a detail that arrives with the quotes. */
function Pending({ width, label }: { width: string; label: string }) {
  return (
    <>
      <span aria-hidden="true" className="ticket-pending" style={{ width }} />
      <span className="sr-only">{label}</span>
    </>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-overline text-ink-muted">{label}</p>
      <div className="mt-1 truncate font-mono text-[15px] leading-[22px] uppercase text-ink">{children}</div>
    </div>
  );
}

const city = (code: string) => findAirport(code)?.city ?? '';

/**
 * The trip as a printed airline ticket. Operator, aircraft and fare are
 * filled in by quotes, so they show as animated placeholders until then.
 */
export function TripTicket({ legs, passengerCount, notes, id = 'trip-ticket' }: {
  legs: TripLeg[];
  passengerCount: number;
  notes: string | null;
  id?: string;
}) {
  const first = legs[0];
  const last = legs[legs.length - 1];
  const from = first?.from || '';
  const to = last?.to || '';
  const roundTrip = legs.length > 1 && from && from === to;
  const dest = roundTrip ? legs[legs.length - 2]?.to || to : to;
  const blank = <span className="text-ink-subtle">———</span>;

  return (
    <article id={id} aria-label="Trip ticket"
      className="ticket overflow-hidden rounded-lg border border-hairline shadow-raised">
      <div className="flex flex-col sm:flex-row">
        {/* Main part */}
        <div className="min-w-0 flex-1 space-y-5 p-5 sm:p-6">
          <header className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
            <p className="text-overline text-royal">Bespoke Flights · Private charter</p>
            <p className="text-overline text-ink-muted">Passenger ticket</p>
          </header>

          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-overline text-ink-muted">From</p>
              <p className="font-mono text-[40px] font-semibold leading-[44px] tracking-tight text-ink">{from || '···'}</p>
              <p className="truncate text-label text-ink-muted">{city(from) || ' '}</p>
            </div>
            <div aria-hidden="true" className="flex flex-1 items-center gap-2 pb-6 text-ink-muted">
              <span className="h-px flex-1 border-t border-dashed border-ink-subtle" />
              <Plane size={20} strokeWidth={1.5} className="text-royal" />
              <span className="h-px flex-1 border-t border-dashed border-ink-subtle" />
            </div>
            <div className="min-w-0 text-right">
              <p className="text-overline text-ink-muted">{roundTrip ? 'To · return' : 'To'}</p>
              <p className="font-mono text-[40px] font-semibold leading-[44px] tracking-tight text-ink">{dest || '···'}</p>
              <p className="truncate text-label text-ink-muted">{city(dest) || ' '}</p>
            </div>
          </div>

          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Legs</caption>
            <thead>
              <tr className="text-overline text-ink-muted">
                <th scope="col" className="pb-1 font-semibold">Leg</th>
                <th scope="col" className="pb-1 font-semibold">Route</th>
                <th scope="col" className="pb-1 font-semibold">Date</th>
                <th scope="col" className="pb-1 text-right font-semibold">Departs</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[14px] leading-[22px] uppercase text-ink">
              {legs.map((l, i) => (
                <tr key={i} className="border-t border-dashed border-hairline">
                  <td className="py-1.5 pr-3 tabular-nums">{String(i + 1).padStart(2, '0')}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{l.from || '···'} – {l.to || '···'}</td>
                  <td className="py-1.5 pr-3">{formatTripDate(l.date) || blank}</td>
                  <td className="py-1.5 text-right">{formatTripTime(l.time) || 'Any time'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-hairline pt-4 sm:grid-cols-3">
            <Field label="Guests">{passengerCount}</Field>
            <Field label="Operator"><Pending width="9rem" label="Operator: assigned when you choose a quote" /></Field>
            <Field label="Aircraft"><Pending width="7rem" label="Aircraft: comes with each quote" /></Field>
            <Field label="Special requests" className="col-span-2 sm:col-span-3">
              <span className="whitespace-normal normal-case">{notes?.trim() || <span className="text-ink-subtle">None</span>}</span>
            </Field>
          </div>
        </div>

        {/* Stub */}
        <aside aria-label="Ticket stub" className="ticket-perf flex shrink-0 flex-col justify-between gap-4 p-5 sm:w-52 sm:p-6">
          <div className="space-y-4">
            <Field label="Fare" className="[&>div]:whitespace-normal">
              <span className="ticket-dots normal-case text-ink-muted">
                Quotes on the way<span aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
              </span>
            </Field>
            <Field label="Flight">{from && dest ? `${from}–${dest}` : blank}</Field>
            <Field label="Date">{formatTripDate(first?.date ?? '') || blank}</Field>
          </div>
          <div aria-hidden="true" className="ticket-barcode h-10 w-full rounded-sm" />
        </aside>
      </div>
    </article>
  );
}

'use client';

import { useMemo } from 'react';
import { Calculator, Clock, Fuel, Lock, Percent, Plane, Receipt, UtensilsCrossed, BedDouble, Landmark, Route, Users } from 'lucide-react';
import { legDistance } from '@/lib/distance';
import { computeWorksheet, estimateLegHours, type WorksheetInputs } from '@/lib/quotes/worksheet';
import { formatMoney } from '@/lib/payments/config';
import { fieldClasses } from '@/components/ui/input';

type NumKey = 'hourlyRate' | 'positioningHours' | 'minDailyHours' | 'overnights' | 'crewOvernight' | 'fuelSurchargePct'
  | 'landingFees' | 'catering' | 'other' | 'marginPct' | 'fetPct' | 'segmentFeePerPax';

const money = (c: number) => formatMoney(c).replace(/\.00$/, '');

function NumField({ id, label, icon: Icon, value, onChange, step = 1, unit, prefix }: {
  id: string; label: string; icon: typeof Clock; value: number; onChange: (n: number) => void; step?: number; unit?: string; prefix?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-1.5 text-label text-ink-muted">
        <Icon size={14} strokeWidth={1.5} aria-hidden="true" /> {label}
      </label>
      <div className="relative">
        {prefix && <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-body text-ink-muted">{prefix}</span>}
        <input id={id} type="number" inputMode="decimal" min={0} step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={e => onChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
          className={`${fieldClasses} tabular-nums ${prefix ? 'pl-8' : ''} ${unit ? 'pr-12' : ''}`} />
        {unit && <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-label text-ink-muted">{unit}</span>}
      </div>
    </div>
  );
}

/**
 * Work out a charter price from rate, flight time, positioning, crew, fees,
 * margin and tax. The inputs stay with the operator; only the total is quoted.
 */
export function QuoteWorksheet({ id, value, onChange, onUse, cruiseKtas }: {
  id: string;
  value: WorksheetInputs;
  onChange: (w: WorksheetInputs) => void;
  /** Put the total into the quote's price field. */
  onUse: (totalCents: number) => void;
  /** For "Re-estimate" of leg hours. */
  cruiseKtas?: number | null;
}) {
  const result = useMemo(() => computeWorksheet(value), [value]);
  const set = (k: NumKey) => (n: number) => onChange({ ...value, [k]: n });
  const setLegHours = (i: number, hours: number) =>
    onChange({ ...value, legs: value.legs.map((l, j) => (j === i ? { ...l, hours } : l)) });
  const reestimate = () =>
    onChange({ ...value, legs: value.legs.map(l => ({ ...l, hours: estimateLegHours(l.origin, l.dest, cruiseKtas || undefined) ?? l.hours })) });

  return (
    <div id={id} className="space-y-6 rounded-md border border-hairline bg-surface-sunken p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-heading text-ink">
          <Calculator size={18} strokeWidth={1.5} aria-hidden="true" className="text-royal" /> Price worksheet
        </h3>
        <p className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-raised px-3 py-1 text-label text-ink">
          <Lock size={14} strokeWidth={1.5} aria-hidden="true" className="text-royal" />
          Private to your company. The traveler sees only the total.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 flex w-full items-center justify-between text-overline text-ink-muted">
          <span className="inline-flex items-center gap-1.5"><Route size={14} strokeWidth={1.5} aria-hidden="true" /> Flight time</span>
          <button type="button" onClick={reestimate} className="inline-flex min-h-11 items-center text-label normal-case tracking-normal text-royal hover:underline underline-offset-4 cursor-pointer">
            Re-estimate from distance
          </button>
        </legend>
        <ul className="divide-y divide-hairline rounded-md border border-hairline bg-surface-raised">
          {value.legs.map((l, i) => {
            const d = legDistance(l.origin, l.dest);
            return (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
                <Plane size={16} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />
                <span className="font-mono text-label text-ink">{l.origin} → {l.dest}</span>
                <span className="text-label text-ink-muted">{l.date}{d ? ` · ${Math.round(d.nm).toLocaleString()} nm` : ''}</span>
                <label className="ml-auto flex items-center gap-2 text-label text-ink-muted">
                  <span className="sr-only">Leg {i + 1} hours</span>
                  <input type="number" inputMode="decimal" min={0} step={0.1} value={l.hours}
                    onChange={e => setLegHours(i, Math.max(0, Number(e.target.value) || 0))}
                    className="h-11 w-24 rounded-md border border-border-control bg-surface-raised px-3 text-right text-body tabular-nums text-ink" />
                  h
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumField id={`${id}-rate`} label="Hourly rate" icon={Clock} prefix="$" unit="/h" step={50} value={value.hourlyRate} onChange={set('hourlyRate')} />
        <NumField id={`${id}-positioning`} label="Positioning" icon={Route} unit="h" step={0.1} value={value.positioningHours} onChange={set('positioningHours')} />
        <NumField id={`${id}-min`} label="Daily minimum" icon={Clock} unit="h/day" step={0.5} value={value.minDailyHours} onChange={set('minDailyHours')} />
        <NumField id={`${id}-fuel`} label="Fuel surcharge" icon={Fuel} unit="%" step={0.5} value={value.fuelSurchargePct} onChange={set('fuelSurchargePct')} />
        <NumField id={`${id}-nights`} label="Crew overnights" icon={BedDouble} unit="nights" value={value.overnights} onChange={n => set('overnights')(Math.round(n))} />
        <NumField id={`${id}-crew`} label="Per overnight" icon={BedDouble} prefix="$" step={50} value={value.crewOvernight} onChange={set('crewOvernight')} />
        <NumField id={`${id}-landing`} label="Landing and handling" icon={Landmark} prefix="$" step={50} value={value.landingFees} onChange={set('landingFees')} />
        <NumField id={`${id}-catering`} label="Catering" icon={UtensilsCrossed} prefix="$" step={50} value={value.catering} onChange={set('catering')} />
        <NumField id={`${id}-other`} label="Other costs" icon={Receipt} prefix="$" step={50} value={value.other} onChange={set('other')} />
        <NumField id={`${id}-margin`} label="Margin" icon={Percent} unit="%" step={0.5} value={value.marginPct} onChange={set('marginPct')} />
        <NumField id={`${id}-fet`} label="Federal excise tax" icon={Landmark} unit="%" step={0.1} value={value.fetPct} onChange={set('fetPct')} />
        <NumField id={`${id}-segment`} label="Segment fee per passenger" icon={Users} prefix="$" step={0.1} value={value.segmentFeePerPax} onChange={set('segmentFeePerPax')} />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${id}-notes`} className="text-label text-ink-muted">Notes</label>
        <textarea id={`${id}-notes`} rows={2} maxLength={2000} value={value.notes ?? ''}
          onChange={e => onChange({ ...value, notes: e.target.value || undefined })}
          placeholder="Fuel price, handler, crew plan…"
          className="block w-full resize-y rounded-md border border-border-control bg-surface-raised px-4 py-3 text-body text-ink placeholder:text-ink-subtle" />
      </div>

      <div className="rounded-md border border-hairline bg-surface-raised">
        {result.lines.length === 0 ? (
          <p className="px-4 py-3 text-body text-ink-muted">Enter an hourly rate to see the breakdown.</p>
        ) : (
          <dl className="divide-y divide-hairline">
            {result.lines.map(l => (
              <div key={l.key} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
                <dt className="text-body text-ink">{l.label}</dt>
                {l.detail && <dd className="text-label text-ink-muted">{l.detail}</dd>}
                <dd className="ml-auto text-body tabular-nums text-ink">{money(l.cents)}</dd>
              </div>
            ))}
            <div className="flex items-baseline gap-3 px-4 py-3">
              <dt className="text-heading text-ink">Total</dt>
              <dd className="ml-auto text-figure tabular-nums text-ink">{money(result.totalCents)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="flex justify-end">
        <button type="button" disabled={result.totalCents <= 0} onClick={() => onUse(result.totalCents)}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-royal px-4 text-[13px] font-semibold text-on-royal transition-colors duration-200 ease-out hover:opacity-90 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">
          Use {money(result.totalCents)} as the price
        </button>
      </div>
    </div>
  );
}

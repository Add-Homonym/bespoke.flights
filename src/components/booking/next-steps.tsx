import { Check, ChevronRight, Clock, CreditCard, Lock, Plane } from 'lucide-react';

/**
 * What happens after "Request quotes", shown as pictures rather than prose:
 * 1. the route (this form) — current, ticked once every leg is set;
 * 2. quotes being prepared — animated rows filling in;
 * 3. payment — muted, locked, later.
 * Words are limited to short labels; screen readers get a full sentence per step.
 */
export function NextSteps({ routeReady }: { routeReady: boolean }) {
  return (
    <ol
      id="next-steps"
      aria-label="What happens next"
      className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-1.5 sm:gap-3"
    >
      {/* 1. Route: you are here */}
      <li id="step-route" className="flex flex-col gap-3 rounded-lg border border-royal bg-surface-raised p-3 sm:p-4">
        <StepBadge n={1} state={routeReady ? 'done' : 'current'} />
        <div aria-hidden="true" className="flex h-12 items-center gap-1">
          <span className="size-2 shrink-0 rounded-pill bg-ink" />
          <span className="h-px flex-1 border-t border-dashed border-ink-muted" />
          <Plane size={18} strokeWidth={1.5} className="shrink-0 text-ink" />
          <span className="h-px flex-1 border-t border-dashed border-ink-muted" />
          <span className="size-2 shrink-0 rounded-pill border border-ink" />
        </div>
        <StepLabel>Route</StepLabel>
        <span className="sr-only">Step 1, now: your route{routeReady ? ' is ready' : ''}.</span>
      </li>

      <Arrow />

      {/* 2. Quotes: operators are preparing prices */}
      <li id="step-quotes" className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-raised p-3 sm:p-4">
        <StepBadge n={2} state="next" />
        <div aria-hidden="true" className="quote-anim flex h-12 flex-col justify-center gap-1.5">
          {[0, 1, 2].map(row => (
            <div key={row} className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-pill bg-ink-subtle" />
              <span className="h-1.5 w-1/3 rounded-pill bg-surface-sunken" />
              <span className="relative ml-auto h-1.5 w-2/5 overflow-hidden rounded-pill bg-surface-sunken">
                <span className="quote-fill absolute inset-y-0 left-0 rounded-pill bg-royal" style={{ animationDelay: `${row * 0.45}s` }} />
              </span>
              {row === 1
                ? <span className="quote-best size-1.5 shrink-0 rounded-pill bg-brass" />
                : <span className="size-1.5 shrink-0" />}
            </div>
          ))}
        </div>
        <StepLabel>Quotes</StepLabel>
        <span className="sr-only">Step 2, next: certified operators prepare all-in quotes for you to compare.</span>
      </li>

      <Arrow />

      {/* 3. Payment: later, once a quote is chosen */}
      <li id="step-payment" className="flex flex-col gap-3 rounded-lg border border-dashed border-border-control p-3 sm:p-4">
        <StepBadge n={3} state="later" />
        <div aria-hidden="true" className="relative flex h-12 items-center justify-center opacity-60">
          <CreditCard size={32} strokeWidth={1.25} className="text-ink-muted" />
          <span className="absolute bottom-0.5 left-1/2 ml-2 flex size-5 items-center justify-center rounded-pill border border-hairline bg-surface">
            <Lock size={11} strokeWidth={1.75} className="text-ink-muted" />
          </span>
        </div>
        <StepLabel muted>Payment</StepLabel>
        <span className="sr-only">Step 3, later: you pay only after you choose a quote. Nothing is charged now.</span>
      </li>
    </ol>
  );
}

function StepBadge({ n, state }: { n: number; state: 'current' | 'done' | 'next' | 'later' }) {
  const style = {
    current: 'bg-royal text-on-royal',
    done: 'bg-royal text-on-royal',
    next: 'border border-ink-muted text-ink',
    later: 'border border-dashed border-ink-subtle text-ink-subtle',
  }[state];
  return (
    <span aria-hidden="true" className="flex items-center justify-between">
      <span className={`flex size-6 items-center justify-center rounded-pill text-label tabular-nums ${style}`}>
        {state === 'done' ? <Check size={14} strokeWidth={2} /> : n}
      </span>
      {state === 'later' && <Clock size={14} strokeWidth={1.5} className="text-ink-subtle" />}
    </span>
  );
}

function StepLabel({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return <span aria-hidden="true" className={`text-overline ${muted ? 'text-ink-subtle' : 'text-ink'}`}>{children}</span>;
}

function Arrow() {
  return (
    <li aria-hidden="true" className="flex items-center text-ink-subtle">
      <ChevronRight size={16} strokeWidth={1.5} />
    </li>
  );
}

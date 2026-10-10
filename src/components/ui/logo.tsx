/** Emblem: a gold double chevron (climb) in a gold-ringed royal purple roundel. */
function LogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <circle cx="16" cy="16" r="15.25" fill="var(--night)" stroke="var(--brass)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="var(--brass)" strokeWidth="0.5" opacity="0.6" />
      <path
        d="M10 18.5 16 11.5l6 7M12.5 22.5 16 18.5l3.5 4"
        fill="none"
        stroke="var(--brass)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SIZES = {
  sm: { mark: 32, word: 'text-[15px] leading-none', gap: 'gap-3', rule: 'h-4' },
  lg: { mark: 44, word: 'text-[20px] leading-none', gap: 'gap-4', rule: 'h-5' },
};

/**
 * The bespoke.flights lockup: emblem, spaced uppercase wordmark, gold rule.
 * The emblem and rule are decorative; the wordmark text is the accessible name.
 */
export function Logo({
  size = 'sm',
  className = '',
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <LogoMark size={s.mark} />
      <span className={`inline-flex items-center gap-2.5 font-display uppercase tracking-[0.28em] ${s.word}`}>
        <span className="-mr-[0.28em] font-bold text-ink">Bespoke</span>
        <span aria-hidden="true" className={`w-px ${s.rule} bg-brass`} />
        <span className="font-normal text-brass-ink">Flights</span>
      </span>
    </span>
  );
}

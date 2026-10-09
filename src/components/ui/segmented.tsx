export interface SegmentedOption {
  value: string;
  label: string;
}

/** Two to four mutually exclusive choices. */
export function Segmented({
  label,
  options,
  value,
  onChange,
  className = '',
}: {
  /** Accessible name for the group. */
  label: string;
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex gap-1 rounded-md bg-surface-sunken p-1 ${className}`}>
      {options.map(opt => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`min-h-11 flex-1 rounded-sm px-3 text-label transition-colors duration-200 ease-out cursor-pointer ${
              selected ? 'bg-royal text-on-royal' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

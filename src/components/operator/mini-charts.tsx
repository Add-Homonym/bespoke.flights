/**
 * Small inline charts for the operator dashboard. SVG with design tokens via
 * currentColor/CSS variables; every chart carries a text equivalent.
 */

export function Bars({
  values,
  labels,
  label,
  highlightLast = true,
  height = 56,
}: {
  values: number[];
  labels?: string[];
  /** Text equivalent for screen readers. */
  label: string;
  highlightLast?: boolean;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const gap = 4;
  const w = 100;
  const bw = (w - gap * (n - 1)) / n;
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className="block w-full" style={{ height }}>
        {values.map((v, i) => {
          const h = v === 0 ? 2 : Math.max(3, (v / max) * (height - 2));
          return (
            <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx={1.5}
              fill={highlightLast && i === n - 1 ? 'var(--royal)' : v === 0 ? 'var(--hairline)' : 'color-mix(in srgb, var(--royal) 45%, transparent)'} />
          );
        })}
      </svg>
      {labels && (
        <figcaption aria-hidden="true" className="flex justify-between text-overline text-ink-subtle">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </figcaption>
      )}
    </figure>
  );
}

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** One horizontal bar split by share, with a legend. */
export function SplitBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="space-y-2">
      <div role="img" aria-label={label} className="flex h-2.5 w-full overflow-hidden rounded-pill bg-surface-sunken">
        {total > 0 && segments.filter(s => s.value > 0).map(s => (
          <span key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} className="h-full first:rounded-l-pill last:rounded-r-pill" />
        ))}
      </div>
      <Legend segments={segments} />
    </div>
  );
}

export function Legend({ segments }: { segments: Segment[] }) {
  return (
    <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1">
      {segments.map(s => (
        <li key={s.label} className="inline-flex items-center gap-1.5 text-label text-ink-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          {s.label} <span className="text-ink tabular-nums">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ring chart with a figure in the middle. */
export function Donut({ segments, center, caption, label, size = 112 }: { segments: Segment[]; center: string; caption?: string; label: string; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 15.915; // circumference 100
  let offset = 25; // start at 12 o'clock
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" role="img" aria-label={label} className="h-full w-full -rotate-0">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="4" />
        {total > 0 && segments.filter(s => s.value > 0).map(s => {
          const pct = (s.value / total) * 100;
          const el = (
            <circle key={s.label} cx="18" cy="18" r={r} fill="none" stroke={s.color} strokeWidth="4"
              strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} />
          );
          offset -= pct;
          return el;
        })}
      </svg>
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-figure text-ink">{center}</span>
        {caption && <span className="text-overline text-ink-muted">{caption}</span>}
      </div>
    </div>
  );
}

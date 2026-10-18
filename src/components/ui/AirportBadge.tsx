import Image from 'next/image';
import { airportIconSrc } from '@/lib/airport-icons';
import { findAirport } from '@/lib/airports';

type IconSize = 24 | 32 | 40;

/**
 * The airport roundel on its own. Decorative: the airport code is always
 * rendered as text next to it. Loaded via next/image (never inlined: every
 * icon file uses clipPath id="c").
 */
export function AirportIcon({ iata, size = 40, className = '' }: { iata?: string | null; size?: IconSize; className?: string }) {
  return (
    <Image
      src={airportIconSrc(iata)}
      width={size}
      height={size}
      alt=""
      unoptimized
      className={`shrink-0 ${className}`}
    />
  );
}

/**
 * Airport roundel with its code and city. 40px in lists, 32px inline, 24px in
 * compact route lines. On `bg-night` surfaces pass tone="on-night".
 */
export function AirportBadge({
  iata,
  city,
  size = 40,
  tone = 'default',
  className = '',
}: {
  iata: string;
  city: string;
  size?: IconSize;
  tone?: 'default' | 'on-night';
  className?: string;
}) {
  const onNight = tone === 'on-night';
  return (
    <div className={`inline-flex min-w-0 items-center gap-3 ${className}`}>
      <AirportIcon iata={iata} size={size} />
      <div className="min-w-0">
        <p className={`font-display font-bold text-[17px] leading-[22px] tracking-[0.04em] ${onNight ? 'text-on-night' : 'text-ink'}`}>{iata}</p>
        {city && <p className={`text-label truncate ${onNight ? 'text-on-night-muted' : 'text-ink-muted'}`}>{city}</p>}
      </div>
    </div>
  );
}

function CodeBadge({ code, size }: { code: string; size: IconSize }) {
  if (!code) return <span className="text-ink-subtle">…</span>;
  const airport = findAirport(code);
  return <AirportBadge iata={airport?.iata ?? code} city={airport?.city ?? ''} size={size} />;
}

/** Origin → destination as two badges, from the codes stored on a request (ICAO or IATA). */
export function RouteBadges({ from, to, size = 32, className = '' }: { from: string; to: string; size?: IconSize; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      <CodeBadge code={from} size={size} />
      <span aria-label="to" className="text-ink-muted">&rarr;</span>
      <CodeBadge code={to} size={size} />
    </div>
  );
}

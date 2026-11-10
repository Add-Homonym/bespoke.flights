export const AIRPORT_ICONS = ['HNL','OGG','KOA','ITO','LIH','MKK','LNY','LAX','SFO','LAS'] as const;

export function airportIconSrc(iata?: string | null): string {
  const code = (iata ?? '').toUpperCase();
  return (AIRPORT_ICONS as readonly string[]).includes(code) ? `/airports/${code.toLowerCase()}.svg` : '/airports/any.svg';
}

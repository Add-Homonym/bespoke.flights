/** The least a charter quote can be: $100. */
export const MIN_QUOTE_CENTS = 10_000;

/** Why a typed dollar amount cannot be a quote price, in plain language, or null when it can. */
export function priceProblem(raw: string): string | null {
  const text = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return 'Enter a price in dollars, like 25000 or 25000.50';
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return 'Enter dollars and cents, no fractions of a cent';
  const cents = Math.round(Number(text) * 100);
  if (cents < MIN_QUOTE_CENTS) return `Enter a price of at least $${MIN_QUOTE_CENTS / 100}`;
  if (cents > 1_000_000_000) return 'Enter a price of $10,000,000 or less';
  return null;
}

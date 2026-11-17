/** Seeded randomness and Beta sampling for the ads loop. Deterministic for a given seed, so runs are reproducible. */

export type Rng = () => number;

/** mulberry32: small, fast, good enough for Monte Carlo over a handful of ads. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Gamma(shape, 1), Marsaglia-Tsang. */
function gamma(shape: number, rng: Rng): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(rng() || Number.MIN_VALUE, 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u || Number.MIN_VALUE) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(a: number, b: number, rng: Rng): number {
  const x = gamma(a, rng);
  return x / (x + gamma(b, rng));
}

export interface Trials { successes: number; trials: number }

/**
 * For each arm, the probability that its true success rate is the highest,
 * under a uniform prior. Monte Carlo over Beta posteriors.
 */
export function probabilityBest(arms: Trials[], rng: Rng, draws = 4000): number[] {
  const wins = arms.map(() => 0);
  if (arms.length === 0) return wins;
  for (let i = 0; i < draws; i++) {
    let best = -1, bestIdx = 0;
    arms.forEach((arm, idx) => {
      const s = Math.min(arm.successes, arm.trials);
      const x = sampleBeta(1 + s, 1 + Math.max(arm.trials - s, 0), rng);
      if (x > best) { best = x; bestIdx = idx; }
    });
    wins[bestIdx]++;
  }
  return wins.map(w => w / draws);
}

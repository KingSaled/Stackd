/**
 * Crash timing, shared by the screen and mirrored in supabase/schema.sql.
 * The multiplier grows as e^(GROWTH * seconds) from the moment the round launches.
 */
export const CRASH = {
  /** Betting window before launch (seconds). */
  bettingSeconds: 8,
  /** The crash result stays on show this long before the next round opens (seconds). */
  showSeconds: 4,
  growth: 0.08,
  minBet: 10,
  maxBet: 500_000,
  maxMultiplier: 1000,
};

/** Multiplier `ms` milliseconds after launch, rounded down to 2 decimals. */
export function crashMultiplier(ms: number): number {
  if (ms <= 0) return 1;
  return Math.floor(Math.exp((CRASH.growth * ms) / 1000) * 100) / 100;
}

/** Milliseconds after launch at which the multiplier reaches `m`. */
export function crashTimeFor(m: number): number {
  return (Math.log(Math.max(1, m)) / CRASH.growth) * 1000;
}

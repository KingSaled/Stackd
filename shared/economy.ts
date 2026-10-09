/**
 * Economy constants. The authoritative values live in supabase/schema.sql
 * (enforced by Postgres functions); these mirror them for display purposes.
 */
export const ECONOMY = {
  startingChips: 10_000,
  dailyBonusBase: 2_000,
  dailyBonusStreakStep: 500,
  dailyBonusMaxStreak: 7,
  dailyCooldownHours: 24,
  /** Wallet + chips at tables below this amount qualifies for an emergency reload. */
  reloadThreshold: 1_000,
  /** An emergency reload tops the player's total back up to this amount. */
  reloadTarget: 100_000,
  reloadCooldownMinutes: 180,
};

export function dailyBonusFor(streak: number): number {
  const s = Math.max(1, Math.min(ECONOMY.dailyBonusMaxStreak, streak));
  return ECONOMY.dailyBonusBase + (s - 1) * ECONOMY.dailyBonusStreakStep;
}

export const COLORS = [
  '#f5c451', '#ff6b6b', '#ff8e3c', '#ffd93d', '#6bcb77', '#3ef0a8',
  '#4dd4ff', '#4d8bff', '#8f6bff', '#d46bff', '#ff6bcb', '#e8e8f0',
];

export const BLIND_PRESETS: { sb: number; bb: number }[] = [
  { sb: 5, bb: 10 },
  { sb: 10, bb: 20 },
  { sb: 25, bb: 50 },
  { sb: 50, bb: 100 },
  { sb: 100, bb: 200 },
  { sb: 250, bb: 500 },
  { sb: 500, bb: 1_000 },
  { sb: 1_000, bb: 2_000 },
];

export const REACTIONS = ['👍', '😂', '😮', '😡', '🔥', '🤑', '😭', '🙏', '👏', '🫡', '💀', '🤡'];

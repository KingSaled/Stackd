/**
 * Case Opening odds. The database (open_case() in supabase/schema.sql) rolls the
 * real result with the same tiers and formulas; tests keep them in step and check
 * the expected payback stays a little under 100%.
 *
 * Within a tier the multiplier is `min + (max - min) * u^skew` for a uniform u, so
 * higher prizes in a tier are rarer than lower ones.
 */
export type CaseTier = 'common' | 'uncommon' | 'rare' | 'covert';

export interface TierInfo {
  id: CaseTier;
  name: string;
  /** Chance of this tier, out of 1. */
  odds: number;
  min: number;
  max: number;
  skew: number;
}

export const CASE_TIERS: TierInfo[] = [
  { id: 'common', name: 'Common', odds: 0.75, min: 0.5, max: 0.7, skew: 1 },
  { id: 'uncommon', name: 'Uncommon', odds: 0.2, min: 1.0, max: 1.2, skew: 1 },
  { id: 'rare', name: 'Rare', odds: 0.04, min: 2, max: 5, skew: 2 },
  { id: 'covert', name: 'Covert', odds: 0.01, min: 10, max: 50, skew: 5 },
];

export const CASE_LIMITS = { minCost: 100, maxCost: 500_000 };

/** Average multiplier of a tier. */
export const tierMean = (t: TierInfo) => t.min + (t.max - t.min) / (t.skew + 1);

/** Expected payback of one case, as a share of its cost (about 0.957). */
export const CASE_RTP = CASE_TIERS.reduce((a, t) => a + t.odds * tierMean(t), 0);

export const TIER_BY_ID = new Map(CASE_TIERS.map((t) => [t.id, t]));

/**
 * Shop items, achievements and challenges live in code (shared/cosmetics.ts,
 * shared/achievements.ts and shared/challenges.ts). The database keeps a copy so purchases and rewards
 * can be checked server-side; this keeps that copy up to date automatically,
 * so new items work as soon as they are deployed, even before schema.sql is re-run.
 */
import { BACKDROPS, FRAMES } from '../shared/cosmetics';
import { ACHIEVEMENTS } from '../shared/achievements';
import { CHALLENGES } from '../shared/challenges';
import type { CatalogRows, Repo } from './repo';

export function catalogRows(): CatalogRows {
  return {
    cosmetics: [...FRAMES, ...BACKDROPS].map((c) => ({ id: c.id, kind: c.kind, price: c.price, tier: c.tier })),
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, counter: a.counter, target: a.target, reward: a.reward })),
    challenges: CHALLENGES.map((c) => ({ id: c.id, period: c.period, slot: c.slot, counter: c.counter, target: c.target, reward: c.reward })),
  };
}

export async function syncCatalog(repo: Repo) {
  const rows = catalogRows();
  await repo.upsertCatalog(rows);
  return { cosmetics: rows.cosmetics.length, achievements: rows.achievements.length, challenges: rows.challenges.length };
}

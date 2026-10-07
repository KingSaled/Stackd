/**
 * Shop items and achievements live in code (shared/cosmetics.ts and
 * shared/achievements.ts). The database keeps a copy so purchases and rewards
 * can be checked server-side; this keeps that copy up to date automatically,
 * so new items work as soon as they are deployed, even before schema.sql is re-run.
 */
import { BACKDROPS, FRAMES } from '../shared/cosmetics';
import { ACHIEVEMENTS } from '../shared/achievements';
import type { CatalogRows, Repo } from './repo';

export function catalogRows(): CatalogRows {
  return {
    cosmetics: [...FRAMES, ...BACKDROPS].map((c) => ({ id: c.id, kind: c.kind, price: c.price, tier: c.tier })),
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, counter: a.counter, target: a.target, reward: a.reward })),
  };
}

export async function syncCatalog(repo: Repo) {
  const rows = catalogRows();
  await repo.upsertCatalog(rows);
  return { cosmetics: rows.cosmetics.length, achievements: rows.achievements.length };
}

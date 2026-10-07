/**
 * Scheduled housekeeping (hourly):
 *  - closes tables abandoned mid-session (refunds any hand in progress and
 *    cashes every seated player back to their wallet),
 *  - deletes empty tables older than a day and old chat messages,
 *  - copies new shop items and achievements from the code into the database.
 *
 * A side benefit: regular database activity keeps a free Supabase project from
 * being paused for inactivity.
 */
import type { Config } from '@netlify/functions';
import { runJanitor } from '../../server/service';
import { syncCatalog } from '../../server/catalog';
import { SupabaseRepo, getAdminClient } from '../../server/supabase';

export default async () => {
  const repo = new SupabaseRepo(getAdminClient());
  try {
    console.log('[stackd] catalog', JSON.stringify(await syncCatalog(repo)));
  } catch (e) {
    console.error('[stackd] catalog sync failed', e);
  }
  try {
    const result = await runJanitor(repo);
    console.log('[stackd] janitor', JSON.stringify(result));
  } catch (e) {
    console.error('[stackd] janitor failed', e);
  }
};

export const config: Config = {
  schedule: '@hourly',
};

/**
 * Scheduled housekeeping (hourly):
 *  - closes tables abandoned mid-session (refunds any hand in progress and
 *    cashes every seated player back to their wallet),
 *  - deletes empty tables older than a day and old chat messages.
 *
 * A side benefit: regular database activity keeps a free Supabase project from
 * being paused for inactivity.
 */
import type { Config } from '@netlify/functions';
import { runJanitor } from '../../server/service';
import { SupabaseRepo, getAdminClient } from '../../server/supabase';

export default async () => {
  try {
    const result = await runJanitor(new SupabaseRepo(getAdminClient()));
    console.log('[stackd] janitor', JSON.stringify(result));
  } catch (e) {
    console.error('[stackd] janitor failed', e);
  }
};

export const config: Config = {
  schedule: '@hourly',
};

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './config';

/** Browser Supabase client (anon/publishable key + the signed-in user's session). */
export const supabase: SupabaseClient = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'stackd-auth' },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : (null as unknown as SupabaseClient);

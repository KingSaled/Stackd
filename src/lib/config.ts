export const SUPABASE_URL: string = __SUPABASE_URL__;
export const SUPABASE_ANON_KEY: string = __SUPABASE_ANON_KEY__;

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const API_URL = '/.netlify/functions/api';

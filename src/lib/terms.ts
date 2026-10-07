import { supabase } from './supabase';
import { readJSON, writeJSON } from './storage';
import { TERMS_VERSION } from '../legal';

const PENDING = 'stackd:terms-pending';

/** Remember that the player ticked the 18+ / Terms box on the sign-in screen. */
export function rememberTermsAccepted() {
  writeJSON(PENDING, { version: TERMS_VERSION, at: Date.now() });
}

/** A box ticked on this device in the last week counts as acceptance once the account exists. */
export function pendingAcceptance(): boolean {
  const p = readJSON<{ version: string; at: number } | null>(PENDING, null);
  return !!p && p.version === TERMS_VERSION && Date.now() - p.at < 7 * 86_400_000;
}

export function clearPendingAcceptance() {
  writeJSON(PENDING, null);
}

export async function acceptTerms(): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.rpc('accept_terms', { p_version: TERMS_VERSION, p_age_confirmed: true });
  if (!error) {
    writeJSON(PENDING, null);
    return { ok: true };
  }
  // Database not upgraded yet: don't lock players out of the game.
  if (error.code === 'PGRST202') return { ok: true };
  return { ok: false, message: error.message };
}

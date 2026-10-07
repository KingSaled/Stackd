import { create } from 'zustand';
import { supabase } from '../lib/supabase';

/** The player at the top of the leaderboard; they wear a crown at every table. */
interface ChampionState {
  id: string | null;
  at: number;
}

export const useChampion = create<ChampionState>(() => ({ id: null, at: 0 }));

const STALE_MS = 5 * 60_000;

export function setChampion(id: string | null) {
  useChampion.setState({ id, at: Date.now() });
}

/** Fetch the current #1 unless we already know it from the last few minutes. */
export async function refreshChampion() {
  if (Date.now() - useChampion.getState().at < STALE_MS) return;
  useChampion.setState({ at: Date.now() });
  try {
    const { data } = await supabase.rpc('leaderboard');
    const rows = data as { id: string }[] | null;
    if (rows) setChampion(rows[0]?.id ?? null);
  } catch {
    // Cosmetic only: keep whatever we had.
  }
}

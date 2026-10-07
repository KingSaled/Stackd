import { supabase } from './supabase';
import { createBlackjackRoom, createRoom } from './api';
import { pokerTableConfig } from './tableOptions';
import { pickQuickTable, type OpenTableRow } from './quickMatch';
import type { GameMode } from '../store/game';
import type { BlackjackQuickPlay, PokerQuickPlay } from '../store/quickplay';

/**
 * Find a table for Quick play: an open one that matches the saved settings
 * (when the player allows it), otherwise a fresh public table with them.
 * Returns the table id; the table page then seats the player straight away.
 */
export async function quickPlayRoom(game: GameMode, prefs: PokerQuickPlay | BlackjackQuickPlay, wallet: number): Promise<string> {
  if (prefs.joinOpen) {
    const { data } = await supabase.rpc('list_open_tables');
    const pick = pickQuickTable((data ?? []) as OpenTableRow[], game, prefs, wallet);
    if (pick) return pick.id;
  }
  if (game === 'blackjack') {
    const res = await createBlackjackRoom({ name: '', turnSeconds: (prefs as BlackjackQuickPlay).timer });
    return res.roomId;
  }
  const res = await createRoom({ name: '', config: pokerTableConfig(prefs as PokerQuickPlay) });
  return res.roomId;
}

/** Table pages: did Quick play send the player here to take a seat? */
export function hasQuickSeatIntent(): boolean {
  return new URLSearchParams(window.location.search).get('quick') === '1';
}

/** Remove the Quick play marker from the address so a reload doesn't sit the player again. */
export function clearQuickSeatIntent() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('quick')) return;
  params.delete('quick');
  const rest = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
}

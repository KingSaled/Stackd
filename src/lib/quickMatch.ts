import { BLIND_PRESETS } from '../../shared/economy';
import { BUYIN_PRESETS } from './tableOptions';
import type { GameMode } from '../store/game';
import type { BlackjackQuickPlay, PokerQuickPlay } from '../store/quickplay';

/** An open table as the lobby lists it (`list_open_tables`). */
export interface OpenTableRow {
  id: string;
  name: string;
  small_blind: number | null;
  big_blind: number | null;
  max_seats: number;
  min_buy_in: number | null;
  max_buy_in: number | null;
  player_count: number;
  updated_at: string;
  bots?: boolean;
  game?: string;
  turn_seconds?: number;
}

/** Chips needed to sit at the stakes a Quick play setup asks for. */
export function quickBuyInNeeded(p: PokerQuickPlay) {
  return (BLIND_PRESETS[p.blind] ?? BLIND_PRESETS[1]).bb * (BUYIN_PRESETS[p.buyin] ?? BUYIN_PRESETS[1]).min;
}

/**
 * The open table Quick play should join: same game and (for poker) the same
 * blinds, seats and bots, a free seat (bots give theirs up), and stakes the
 * player can afford. The busiest table wins so players end up together.
 */
export function pickQuickTable(
  rows: OpenTableRow[],
  game: GameMode,
  prefs: PokerQuickPlay | BlackjackQuickPlay,
  wallet: number,
): OpenTableRow | null {
  const fits = rows.filter((t) => {
    if (t.player_count >= t.max_seats) return false;
    if (game === 'blackjack') return t.game === 'blackjack';
    if (t.game === 'blackjack') return false;
    const p = prefs as PokerQuickPlay;
    const b = BLIND_PRESETS[p.blind] ?? BLIND_PRESETS[1];
    return (
      Number(t.small_blind) === b.sb &&
      Number(t.big_blind) === b.bb &&
      t.max_seats === p.seats &&
      !!t.bots === p.bots &&
      wallet >= Number(t.min_buy_in ?? 0)
    );
  });
  fits.sort((a, b) => b.player_count - a.player_count || Date.parse(b.updated_at) - Date.parse(a.updated_at));
  return fits[0] ?? null;
}

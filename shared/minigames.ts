/**
 * The house minigames, played with the same play-money wallet as the tables.
 * All money moves inside Postgres functions (supabase/schema.sql); these
 * constants mirror the limits there for the screens.
 */
export type MinigameId = 'crash' | 'coinflip' | 'roulette' | 'cases';

export interface MinigameInfo {
  id: MinigameId;
  name: string;
  path: string;
  /** One line for menus and lobby tiles. */
  tagline: string;
}

export const MINIGAMES: MinigameInfo[] = [
  { id: 'crash', name: 'Crash', path: '/games/crash', tagline: 'Cash out before the rocket crashes' },
  { id: 'coinflip', name: 'Coin Flip', path: '/games/coinflip', tagline: 'Heads or tails against another player' },
  { id: 'roulette', name: 'Roulette', path: '/games/roulette', tagline: 'Red, black or green, every 25 seconds' },
  { id: 'cases', name: 'Case Opening', path: '/games/cases', tagline: 'Open a case for a shot at 50x' },
];

export const MINIGAME_BY_ID = new Map(MINIGAMES.map((g) => [g.id, g]));

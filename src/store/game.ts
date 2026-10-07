import { create } from 'zustand';
import { readJSON, writeJSON } from '../lib/storage';

/** Which game the lobby is showing: Texas Hold'em or blackjack against the house. */
export type GameMode = 'holdem' | 'blackjack';

const KEY = 'stackd:game';
const saved = readJSON<GameMode>(KEY, 'holdem');

export const useGameMode = create<{ mode: GameMode; setMode(mode: GameMode): void }>((set) => ({
  mode: saved === 'blackjack' ? 'blackjack' : 'holdem',
  setMode(mode) {
    writeJSON(KEY, mode);
    set({ mode });
  },
}));

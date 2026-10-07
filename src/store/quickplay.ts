import { create } from 'zustand';
import { readJSON, writeJSON } from '../lib/storage';
import { BLIND_PRESETS } from '../../shared/economy';
import { BJ_TIMERS } from '../../shared/blackjack/engine';
import { BUYIN_PRESETS, POKER_TIMERS, SEAT_CHOICES, type PokerSetup } from '../lib/tableOptions';
import type { GameMode } from './game';

/**
 * Saved Quick play settings for each game (kept on this device). Once saved,
 * Quick play takes the player straight to a seat with them.
 */
export interface PokerQuickPlay extends PokerSetup {
  /** Sit at an open table with the same blinds, seats and bots when one has room. */
  joinOpen: boolean;
}

export interface BlackjackQuickPlay {
  timer: number;
  joinOpen: boolean;
}

export const DEFAULT_POKER_QUICK: PokerQuickPlay = { blind: 1, seats: 6, buyin: 1, timer: 30, bots: true, joinOpen: true };
export const DEFAULT_BJ_QUICK: BlackjackQuickPlay = { timer: 15, joinOpen: true };

const KEY = 'stackd:quickplay';

interface Saved {
  holdem: PokerQuickPlay | null;
  blackjack: BlackjackQuickPlay | null;
}

/** Drop anything stale or tampered with, so a bad save never breaks Quick play. */
function clean(raw: Partial<Saved> | null): Saved {
  const h = raw?.holdem;
  const b = raw?.blackjack;
  return {
    holdem:
      h && typeof h === 'object'
        ? {
            blind: Number.isInteger(h.blind) && h.blind >= 0 && h.blind < BLIND_PRESETS.length ? h.blind : DEFAULT_POKER_QUICK.blind,
            seats: SEAT_CHOICES.includes(h.seats) ? h.seats : DEFAULT_POKER_QUICK.seats,
            buyin: Number.isInteger(h.buyin) && h.buyin >= 0 && h.buyin < BUYIN_PRESETS.length ? h.buyin : DEFAULT_POKER_QUICK.buyin,
            timer: POKER_TIMERS.includes(h.timer) ? h.timer : DEFAULT_POKER_QUICK.timer,
            bots: h.bots !== false,
            joinOpen: h.joinOpen !== false,
          }
        : null,
    blackjack:
      b && typeof b === 'object'
        ? { timer: BJ_TIMERS.includes(b.timer) ? b.timer : DEFAULT_BJ_QUICK.timer, joinOpen: b.joinOpen !== false }
        : null,
  };
}

interface QuickPlayStore extends Saved {
  save(game: 'holdem', prefs: PokerQuickPlay): void;
  save(game: 'blackjack', prefs: BlackjackQuickPlay): void;
}

export const useQuickPlay = create<QuickPlayStore>((set, get) => ({
  ...clean(readJSON<Partial<Saved> | null>(KEY, null)),
  save(game: GameMode, prefs: PokerQuickPlay | BlackjackQuickPlay) {
    const next = clean({ holdem: get().holdem, blackjack: get().blackjack, [game]: prefs });
    writeJSON(KEY, next);
    set(next);
  },
}));

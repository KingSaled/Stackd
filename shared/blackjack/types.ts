import type { Card } from '../poker/cards';
import type { LogEntry } from '../poker/types';

export type BjPhase = 'waiting' | 'betting' | 'playing' | 'settled';

export interface BjConfig {
  game: 'blackjack';
  /** Always 6 seats. */
  maxSeats: number;
  minBet: number;
  maxBet: number;
  /** Seconds a player has to act before their hand automatically stands. */
  turnSeconds: number;
}

export type BjOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BjHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  /** Created by splitting a pair (a two-card 21 here is not a blackjack). */
  split: boolean;
  /** Split aces receive exactly one card each. */
  splitAces: boolean;
  /** No more decisions on this hand. */
  done: boolean;
  outcome: BjOutcome | null;
  /** Chips returned to the player when the round settled (stake + winnings; 0 on a loss). */
  payout: number;
}

export interface BjSeat {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  frame?: string | null;
  backdrop?: string | null;
  /** Bet placed for the next deal (already taken from the wallet). */
  bet: number;
  /** Last bet the player made, for one-tap rebets. */
  lastBet: number;
  /** Hands in the current round (more than one after a split). */
  hands: BjHand[];
  /** Stood up during a round: removed when the round settles. */
  leaving: boolean;
  /** Consecutive rounds dealt without this player betting. */
  missed: number;
  /** Consecutive turns that timed out. */
  timeouts: number;
  joinedAt: number;
}

export interface BjPublicState {
  v: 1;
  game: 'blackjack';
  config: BjConfig;
  roundNo: number;
  phase: BjPhase;
  seats: (BjSeat | null)[];
  /** Dealer's visible cards (the hole card is added when it is turned over). */
  dealer: Card[];
  /** The dealer has a face-down hole card. */
  holeHidden: boolean;
  /** Seat whose turn it is (-1 when nobody is acting). */
  toAct: number;
  /** Which of that seat's hands is being played. */
  handIdx: number;
  turnStartedAt: number | null;
  actionDeadline: number | null;
  /** Betting closes and cards are dealt at this time (set once someone has bet). */
  bettingDeadline: number | null;
  /** When the settled round clears and betting opens again. */
  nextRoundAt: number | null;
  /** When the cards of this round were dealt (for animation). */
  dealtAt: number | null;
  /** When the round settled and how many cards the dealer drew after revealing (for staged animation). */
  settledAt: number | null;
  dealerDraws: number;
  /** The dealer turned over a blackjack straight after the deal. */
  dealerBlackjack: boolean;
  shoeLeft: number;
  shoeSize: number;
  /** A fresh shoe was shuffled for this round. */
  shuffled: boolean;
  log: LogEntry[];
  logSeq: number;
  updatedAt: number;
}

export interface BjSecretState {
  shoe: Card[];
  hole: Card | null;
}

export type BjState = BjPublicState & BjSecretState;

export type BjAction = 'hit' | 'stand' | 'double' | 'split';

export interface BjEffects {
  /** userId → chip delta applied to the player's wallet (bets negative, payouts positive). */
  wallet: Record<string, number>;
}

export function newBjEffects(): BjEffects {
  return { wallet: {} };
}

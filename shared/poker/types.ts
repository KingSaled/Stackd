import type { Card } from './cards';

export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export const BETTING_PHASES: readonly Phase[] = ['preflop', 'flop', 'turn', 'river'];

export type PlayerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface PlayerAction {
  type: PlayerActionType;
  /** For bet/raise: the total amount the player's street bet should become ("raise to"). */
  amount?: number;
}

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  /** Number of seats at the table (2-9). */
  maxSeats: number;
  minBuyIn: number;
  maxBuyIn: number;
  /** Seconds a player has to act before the automatic check/fold. */
  turnSeconds: number;
  /** Keep every open seat filled with bots (players can claim a bot's seat). */
  bots?: boolean;
}

export interface SeatActionLabel {
  type: PlayerActionType | 'sb' | 'bb';
  /** The player's street bet after the action (0 for fold/check). */
  amount: number;
  /** True when the action was taken automatically (timeout / away). */
  auto?: boolean;
}

export interface Seat {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  /** Chips behind (not yet committed this street). */
  stack: number;
  /** Chips put in on the current street. */
  bet: number;
  /** Total chips put in during the current hand (all streets, including `bet`). */
  committed: number;
  /** Dealt into the current hand. */
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  /** Has voluntarily acted on the current street. */
  hasActed: boolean;
  /** The table's current bet level right after this player last acted (raise re-opening rule). */
  actedLevel: number;
  lastAction: SeatActionLabel | null;
  /** Will not be dealt into new hands. */
  sittingOut: boolean;
  sittingOutSince: number | null;
  /** Auto check/fold instantly (set after repeated timeouts). */
  away: boolean;
  /** Stood up during a hand; seat is released when the hand ends. */
  leaving: boolean;
  /** Consecutive turn timeouts. */
  timeouts: number;
  /** Chips bought while in a hand; added to the stack before the next deal. */
  pendingTopUp: number;
  joinedAt: number;
  /** Computer-controlled player (no wallet, no stats). */
  isBot?: boolean;
  /** A real player who claimed this bot's seat; they replace the bot when the hand ends. */
  reservedFor?: SeatReservation | null;
  /** Equipped Cosmetic Shop items (see shared/cosmetics). */
  frame?: string | null;
  backdrop?: string | null;
  nameFx?: string | null;
  club?: string | null;
  /** Put chips in voluntarily before the flop this hand (VPIP). */
  vpip?: boolean;
  /** Bet or raised before the flop this hand (PFR). */
  pfr?: boolean;
}

export interface SeatReservation {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  frame?: string | null;
  backdrop?: string | null;
  nameFx?: string | null;
  club?: string | null;
  /** Already taken from the player's wallet. */
  buyIn: number;
}

export interface Pot {
  amount: number;
  /** Seat indices eligible to win this pot. */
  eligible: number[];
}

export interface ShownHand {
  seat: number;
  cards: Card[];
  /** Hand category name, e.g. "Flush". */
  name: string;
  /** Descriptive name, e.g. "Flush, Ace High". */
  description: string;
  best: Card[];
  category: number;
}

export interface PotResult {
  amount: number;
  winners: number[];
  /** Description of the winning hand (null when uncontested). */
  handName: string | null;
  label: string;
}

export interface Payout {
  seat: number;
  userId: string;
  name: string;
  amount: number;
}

export interface HandResult {
  handNo: number;
  uncontested: boolean;
  pots: PotResult[];
  payouts: Payout[];
  hands: ShownHand[];
}

export type LogKind = 'hand' | 'action' | 'board' | 'win' | 'info';

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
  at: number;
}

/** Everything that every viewer of a table may see. */
export interface PublicState {
  v: 1;
  config: TableConfig;
  handNo: number;
  phase: Phase;
  seats: (Seat | null)[];
  dealer: number;
  sbSeat: number;
  bbSeat: number;
  board: Card[];
  /** Pots collected from previous streets (current street bets live on the seats). */
  pots: Pot[];
  currentBet: number;
  /** Size of the last full bet/raise on this street: the minimum raise increment. */
  minRaise: number;
  toAct: number;
  turnStartedAt: number | null;
  actionDeadline: number | null;
  /** When the next hand should be dealt (set while waiting to start or showing results). */
  nextHandAt: number | null;
  result: HandResult | null;
  /** Hole cards revealed to everyone (all-in run-outs and showdowns). */
  shown: { seat: number; cards: Card[] }[];
  /** Board length at the moment players were all-in and the board was run out (for staged animation). */
  runoutFrom: number | null;
  log: LogEntry[];
  logSeq: number;
  updatedAt: number;
}

/** Server-only data: never sent to clients except through the per-player projection. */
export interface SecretState {
  deck: Card[];
  /** Hole cards by seat index (stringified). */
  hole: Record<string, Card[]>;
  /** Hidden skill/personality of each bot, by bot user id. */
  bots?: Record<string, BotBrainData>;
}

export interface BotBrainData {
  level: 'easy' | 'medium' | 'hard';
  tight: number;
  aggr: number;
  bluff: number;
  iters: number;
}

export type EngineState = PublicState & SecretState;

export interface StatDelta {
  played: number;
  won: number;
  biggestPot: number;
  bestHand: number;
}

/** One player's part in a finished hand (feeds stats, achievements and abuse checks). */
export interface HandSummary {
  userId: string;
  isBot: boolean;
  /** Stack at the start of the hand. */
  startStack: number;
  /** Chips put into the pot this hand. */
  committed: number;
  /** Chips paid out to the player (0 if they lost). */
  won: number;
  folded: boolean;
  /** Was all-in when the hand ended. */
  allIn: boolean;
  /** Hand category shown at showdown, -1 if not shown. */
  category: number;
  vpip: boolean;
  pfr: boolean;
}

export interface HandRecord {
  handNo: number;
  bigBlind: number;
  uncontested: boolean;
  players: HandSummary[];
}

/** Side effects produced by an engine mutation and persisted atomically with the new state. */
export interface Effects {
  /** userId → chip delta applied to the player's wallet (negative = buy-in). */
  wallet: Record<string, number>;
  stats: Record<string, StatDelta>;
  /** A new hand was dealt; private hole cards must be re-published. */
  dealt: boolean;
  /** Net chips that entered play through bots (bot stacks created minus removed). Diagnostic only. */
  botChips: number;
  /** Hands that finished during this mutation. */
  hands: HandRecord[];
}

export function newEffects(): Effects {
  return { wallet: {}, stats: {}, dealt: false, botChips: 0, hands: [] };
}

export interface LegalActions {
  canAct: boolean;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** Chips needed to call (capped at the player's stack). */
  callAmount: number;
  /** Calling puts the player all-in. */
  callIsAllIn: boolean;
  /** No bet yet on this street: aggressive action is a "bet". */
  isBet: boolean;
  canRaise: boolean;
  /** Minimum legal "raise to" / bet total (already capped to all-in). */
  minRaiseTo: number;
  /** Maximum legal "raise to" (all-in total). */
  maxRaiseTo: number;
  canAllIn: boolean;
}

/**
 * Authoritative No-Limit Texas Hold'em state machine.
 *
 * All functions mutate the provided EngineState in place and record wallet /
 * stat side effects in the supplied Effects object. The server loads a state,
 * applies exactly one mutation, and persists the result atomically (optimistic
 * concurrency), so these functions never need to deal with concurrency.
 *
 * Time is always injected (`now`, epoch ms) and randomness is injected (`rng`),
 * which keeps the engine deterministic and fully testable.
 */
import { freshDeck, shuffle, cardToText, seededRng, type Card, type Rng } from './cards';
import { evaluateHand } from './evaluator';
import { computePots, splitPot } from './pots';
import { botThinkMs, createBotBrain, createBotIdentity, decideBotAction, isBotId } from './bot';
import {
  BETTING_PHASES,
  type Effects,
  type EngineState,
  type HandRecord,
  type HandResult,
  type LegalActions,
  type LogKind,
  type Phase,
  type PlayerAction,
  type PotResult,
  type Seat,
  type SeatReservation,
  type ShownHand,
  type StatDelta,
  type TableConfig,
} from './types';

export const TIMING = {
  /** Delay before the very first hand once enough players are seated. */
  startDelayMs: 2500,
  /** How long showdown results stay on screen before the next deal. */
  showdownMs: 6000,
  /** Results display time when everyone else folded. */
  uncontestedMs: 3200,
  /** Extra time per street dealt during an all-in run-out (client animates it). */
  runoutStreetMs: 1500,
  /** Sitting-out players are released from their seat after this long. */
  staleSitOutMs: 15 * 60 * 1000,
  /** Consecutive timeouts before a player is marked away. */
  timeoutsBeforeAway: 2,
};

const MAX_LOG = 60;

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export interface PlayerIdentity {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  frame?: string | null;
  backdrop?: string | null;
  nameFx?: string | null;
  club?: string | null;
}

/* ------------------------------------------------------------------------ */
/* Configuration                                                             */
/* ------------------------------------------------------------------------ */

export const CONFIG_LIMITS = {
  minSeats: 2,
  maxSeats: 9,
  minBigBlind: 2,
  maxBigBlind: 1_000_000,
  turnSeconds: [10, 15, 20, 30, 45, 60, 90] as const,
  minBuyInBB: 10,
  maxBuyInBB: 500,
};

/** Validate and normalise a table configuration supplied by a client. */
export function sanitizeConfig(input: Partial<TableConfig>): TableConfig {
  const int = (v: unknown, name: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) throw new GameError('bad_config', `Invalid ${name}`);
    return n;
  };
  const bigBlind = int(input.bigBlind, 'big blind');
  const smallBlind = int(input.smallBlind ?? Math.max(1, Math.floor(bigBlind / 2)), 'small blind');
  if (bigBlind < CONFIG_LIMITS.minBigBlind || bigBlind > CONFIG_LIMITS.maxBigBlind)
    throw new GameError('bad_config', 'Big blind out of range');
  if (smallBlind > bigBlind) throw new GameError('bad_config', 'Small blind cannot exceed the big blind');
  const maxSeats = int(input.maxSeats ?? 6, 'seat count');
  if (maxSeats < CONFIG_LIMITS.minSeats || maxSeats > CONFIG_LIMITS.maxSeats)
    throw new GameError('bad_config', 'Tables seat 2 to 9 players');
  const minBuyIn = int(input.minBuyIn ?? bigBlind * 20, 'minimum buy-in');
  const maxBuyIn = int(input.maxBuyIn ?? bigBlind * 100, 'maximum buy-in');
  if (minBuyIn < bigBlind * CONFIG_LIMITS.minBuyInBB)
    throw new GameError('bad_config', `Minimum buy-in must be at least ${CONFIG_LIMITS.minBuyInBB} big blinds`);
  if (maxBuyIn > bigBlind * CONFIG_LIMITS.maxBuyInBB)
    throw new GameError('bad_config', `Maximum buy-in can be at most ${CONFIG_LIMITS.maxBuyInBB} big blinds`);
  if (minBuyIn > maxBuyIn) throw new GameError('bad_config', 'Minimum buy-in exceeds maximum buy-in');
  const turnSeconds = int(input.turnSeconds ?? 30, 'turn timer');
  if (turnSeconds < 10 || turnSeconds > 120) throw new GameError('bad_config', 'Turn timer must be 10-120 seconds');
  return { smallBlind, bigBlind, maxSeats, minBuyIn, maxBuyIn, turnSeconds, bots: input.bots === true };
}

export function createInitialState(config: TableConfig, now: number): EngineState {
  return {
    v: 1,
    config,
    handNo: 0,
    phase: 'waiting',
    seats: Array.from({ length: config.maxSeats }, () => null),
    dealer: -1,
    sbSeat: -1,
    bbSeat: -1,
    board: [],
    pots: [],
    currentBet: 0,
    minRaise: config.bigBlind,
    toAct: -1,
    turnStartedAt: null,
    actionDeadline: null,
    nextHandAt: null,
    result: null,
    shown: [],
    runoutFrom: null,
    log: [],
    logSeq: 0,
    updatedAt: now,
    deck: [],
    hole: {},
    bots: {},
  };
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

export function isBettingPhase(phase: Phase): boolean {
  return BETTING_PHASES.includes(phase);
}

export function seatIndexOf(s: { seats: (Seat | null)[] }, userId: string): number {
  return s.seats.findIndex((seat) => seat?.userId === userId);
}

export function formatChips(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function addLog(s: EngineState, kind: LogKind, text: string, now: number) {
  s.logSeq += 1;
  s.log.push({ id: s.logSeq, kind, text, at: now });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

function walletDelta(fx: Effects, userId: string, delta: number) {
  if (!delta || isBotId(userId)) return; // bots have no wallet
  fx.wallet[userId] = (fx.wallet[userId] ?? 0) + delta;
}

function stat(fx: Effects, userId: string): StatDelta {
  const blank = { played: 0, won: 0, biggestPot: 0, bestHand: -1 };
  if (isBotId(userId)) return blank; // bots don't keep stats
  return (fx.stats[userId] ??= blank);
}

/** Real (non-bot) players seated, optionally excluding ones on their way out. */
function humanSeats(s: EngineState, includeLeaving = true): Seat[] {
  return s.seats.filter((x): x is Seat => !!x && !x.isBot && (includeLeaving || !x.leaving));
}

/** The seat a user has claimed from a bot (they join when the current hand ends). */
export function reservationOf(s: { seats: (Seat | null)[] }, userId: string): number {
  return s.seats.findIndex((seat) => seat?.reservedFor?.userId === userId);
}

function seatAt(s: EngineState, i: number): Seat {
  const seat = s.seats[i];
  if (!seat) throw new GameError('no_seat', 'Seat is empty');
  return seat;
}

function liveSeats(s: EngineState): number[] {
  const out: number[] = [];
  s.seats.forEach((seat, i) => {
    if (seat && seat.inHand && !seat.folded) out.push(i);
  });
  return out;
}

function actorCount(s: EngineState): number {
  let n = 0;
  for (const seat of s.seats) if (seat && seat.inHand && !seat.folded && !seat.allIn) n++;
  return n;
}

function isEligibleForDeal(seat: Seat | null): seat is Seat {
  return !!seat && !seat.sittingOut && !seat.leaving && seat.stack > 0;
}

/** A hand is only dealt when at least two players can play and at least one of them is human. */
function canDeal(s: EngineState): boolean {
  const eligible = s.seats.filter(isEligibleForDeal);
  return eligible.length >= 2 && eligible.some((x) => !x.isBot);
}

function nextIndex(s: EngineState, from: number, pred: (seat: Seat | null, i: number) => boolean): number {
  const n = s.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n;
    if (pred(s.seats[i], i)) return i;
  }
  return -1;
}

function holeOf(s: EngineState, i: number): Card[] {
  return s.hole[String(i)] ?? [];
}

function draw(s: EngineState): Card {
  const c = s.deck.pop();
  if (!c) throw new GameError('deck_empty', 'Deck exhausted');
  return c;
}

function putChips(seat: Seat, amount: number) {
  const pay = Math.min(amount, seat.stack);
  seat.stack -= pay;
  seat.bet += pay;
  seat.committed += pay;
  if (seat.stack === 0) seat.allIn = true;
  return pay;
}

/** Can this seat put in a (re-)raise right now? Implements the betting re-opening rule. */
function raiseRuleOpen(s: EngineState, seat: Seat): boolean {
  if (seat.stack <= s.currentBet - seat.bet) return false; // can at best call
  if (!seat.hasActed) return true;
  // A player who already acted may raise again only if the bet was raised by at
  // least a full raise since they acted (cumulative short all-ins count).
  return s.currentBet - seat.actedLevel >= s.minRaise;
}

function needsToAct(s: EngineState, i: number): boolean {
  const seat = s.seats[i];
  if (!seat || !seat.inHand || seat.folded || seat.allIn) return false;
  if (seat.hasActed && seat.bet >= s.currentBet) return false;
  if (actorCount(s) <= 1) {
    // Everybody else is all-in or folded: only act if facing chips you have not matched.
    let maxOther = 0;
    s.seats.forEach((o, j) => {
      if (j !== i && o && o.inHand && !o.folded) maxOther = Math.max(maxOther, o.bet);
    });
    if (seat.bet >= maxOther) return false;
  }
  return true;
}

function findNextToAct(s: EngineState, from: number): number {
  return nextIndex(s, from, (_seat, i) => needsToAct(s, i));
}

function setTurn(s: EngineState, i: number, now: number) {
  s.toAct = i;
  s.turnStartedAt = now;
  const seat = s.seats[i];
  if (seat?.isBot) {
    // Bots "think" briefly; a client tick then asks the server to play their move.
    const humansLive = s.seats.some((x) => x && !x.isBot && x.inHand && !x.folded);
    s.actionDeadline = now + botThinkMs(s, i, humansLive);
  } else {
    s.actionDeadline = now + s.config.turnSeconds * 1000;
  }
}

function clearTurn(s: EngineState) {
  s.toAct = -1;
  s.turnStartedAt = null;
  s.actionDeadline = null;
}

/** When the table is idle, (re)arm or cancel the countdown to the first hand. */
function scheduleIfReady(s: EngineState, now: number) {
  if (s.phase !== 'waiting') return;
  if (canDeal(s)) {
    if (s.nextHandAt == null) s.nextHandAt = now + TIMING.startDelayMs;
  } else {
    s.nextHandAt = null;
  }
}

function removeSeat(s: EngineState, fx: Effects, i: number, now: number, reason?: string) {
  const seat = s.seats[i];
  if (!seat) return;
  const cashOut = seat.stack + seat.pendingTopUp;
  s.seats[i] = null;
  if (seat.isBot) {
    fx.botChips -= cashOut;
    if (s.bots) delete s.bots[seat.userId];
    // A player who had claimed this seat gets their buy-in back.
    if (seat.reservedFor) walletDelta(fx, seat.reservedFor.userId, seat.reservedFor.buyIn);
    addLog(s, 'info', `${seat.name} ${reason ?? 'left the table'}`, now);
    return;
  }
  walletDelta(fx, seat.userId, cashOut);
  addLog(s, 'info', `${seat.name} ${reason ?? 'left the table'}${cashOut ? ` (${formatChips(cashOut)} cashed out)` : ''}`, now);
}

function newSeat(player: PlayerIdentity, stack: number, now: number, isBot = false): Seat {
  return {
    userId: player.userId,
    name: player.name,
    avatar: player.avatar,
    color: player.color,
    ...(player.frame ? { frame: player.frame } : {}),
    ...(player.backdrop ? { backdrop: player.backdrop } : {}),
    ...(player.nameFx ? { nameFx: player.nameFx } : {}),
    ...(player.club ? { club: player.club } : {}),
    stack,
    bet: 0,
    committed: 0,
    inHand: false,
    folded: false,
    allIn: false,
    hasActed: false,
    actedLevel: 0,
    lastAction: null,
    sittingOut: false,
    sittingOutSince: null,
    away: false,
    leaving: false,
    timeouts: 0,
    pendingTopUp: 0,
    joinedAt: now,
    ...(isBot ? { isBot: true, reservedFor: null } : {}),
  };
}

/** Seat a bot with a random personality and a random buy-in in seat `i`. */
function addBot(s: EngineState, fx: Effects, i: number, now: number, rng: Rng) {
  const taken = new Set(s.seats.filter(Boolean).map((x) => x!.name));
  const identity = createBotIdentity(rng, taken);
  const { minBuyIn, maxBuyIn, bigBlind } = s.config;
  const span = Math.max(0, maxBuyIn - minBuyIn);
  // Average of two rolls: buy-ins cluster toward the middle of the range.
  const raw = minBuyIn + ((rng(1001) + rng(1001)) / 2000) * span;
  const stack = Math.max(minBuyIn, Math.min(maxBuyIn, Math.round(raw / bigBlind) * bigBlind));
  s.seats[i] = newSeat(identity, stack, now, true);
  (s.bots ??= {})[identity.userId] = createBotBrain(rng);
  fx.botChips += stack;
}

/** Keep every open seat filled with bots while at least one real player is seated. */
function fillBots(s: EngineState, fx: Effects, now: number, rng: Rng) {
  if (!s.config.bots || humanSeats(s, false).length === 0) return;
  let added = 0;
  for (let i = 0; i < s.seats.length; i++) {
    if (!s.seats[i]) {
      addBot(s, fx, i, now, rng);
      added++;
    }
  }
  if (added) addLog(s, 'info', `${added} bot${added === 1 ? '' : 's'} joined the table`, now);
}

/** Replace a bot whose seat was claimed with the waiting player. */
function seatReservation(s: EngineState, fx: Effects, i: number, now: number) {
  const bot = s.seats[i];
  if (!bot?.isBot || !bot.reservedFor) return;
  const r: SeatReservation = bot.reservedFor;
  fx.botChips -= bot.stack + bot.pendingTopUp;
  if (s.bots) delete s.bots[bot.userId];
  s.seats[i] = newSeat(r, r.buyIn, now);
  addLog(s, 'info', `${r.name} took ${bot.name}'s seat with ${formatChips(r.buyIn)}`, now);
}

/* ------------------------------------------------------------------------ */
/* Seating                                                                   */
/* ------------------------------------------------------------------------ */

export function sitDown(
  s: EngineState,
  fx: Effects,
  player: PlayerIdentity,
  seatIndex: number,
  buyIn: number,
  now: number,
  rng: Rng = seededRng(now),
) {
  if (isBotId(player.userId)) throw new GameError('bad_seat', 'Invalid player');
  if (seatIndexOf(s, player.userId) >= 0) throw new GameError('already_seated', 'You already have a seat at this table');
  if (reservationOf(s, player.userId) >= 0)
    throw new GameError('already_seated', 'You already claimed a seat — you join when this hand ends');
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= s.seats.length)
    throw new GameError('bad_seat', 'That seat does not exist');
  if (!Number.isInteger(buyIn) || buyIn < s.config.minBuyIn || buyIn > s.config.maxBuyIn)
    throw new GameError(
      'bad_buyin',
      `Buy-in must be between ${formatChips(s.config.minBuyIn)} and ${formatChips(s.config.maxBuyIn)}`,
    );
  const occupant = s.seats[seatIndex];
  if (occupant && !occupant.isBot) throw new GameError('seat_taken', 'That seat was just taken');
  if (occupant?.isBot) {
    if (occupant.reservedFor) throw new GameError('seat_taken', 'Someone already claimed that seat');
    if (isBettingPhase(s.phase) && occupant.inHand) {
      // The bot finishes the current hand; the player takes over when it ends.
      occupant.reservedFor = {
        userId: player.userId,
        name: player.name,
        avatar: player.avatar,
        color: player.color,
        frame: player.frame ?? null,
        backdrop: player.backdrop ?? null,
        nameFx: player.nameFx ?? null,
        club: player.club ?? null,
        buyIn,
      };
      walletDelta(fx, player.userId, -buyIn);
      addLog(s, 'info', `${player.name} will take ${occupant.name}'s seat after this hand`, now);
      finalize(s, fx, now);
      return;
    }
    removeSeat(s, fx, seatIndex, now, 'gave up the seat');
  }
  s.seats[seatIndex] = newSeat(player, buyIn, now);
  walletDelta(fx, player.userId, -buyIn);
  addLog(s, 'info', `${player.name} sat down with ${formatChips(buyIn)}`, now);
  fillBots(s, fx, now, rng);
  finalize(s, fx, now);
}

export function standUp(s: EngineState, fx: Effects, userId: string, now: number) {
  const claimed = reservationOf(s, userId);
  if (claimed >= 0) {
    const bot = seatAt(s, claimed);
    const r = bot.reservedFor!;
    bot.reservedFor = null;
    walletDelta(fx, userId, r.buyIn);
    addLog(s, 'info', `${r.name} changed their mind about ${bot.name}'s seat`, now);
    finalize(s, fx, now);
    return;
  }
  const i = seatIndexOf(s, userId);
  if (i < 0) throw new GameError('not_seated', 'You are not seated at this table');
  const seat = seatAt(s, i);
  const inActiveHand = isBettingPhase(s.phase) && seat.inHand;
  if (!inActiveHand) {
    removeSeat(s, fx, i, now);
    finalize(s, fx, now);
    return;
  }
  // Mid-hand: the seat stays until the hand ends so its chips in the pot are accounted for.
  seat.leaving = true;
  seat.sittingOut = true;
  seat.sittingOutSince = now;
  if (seat.allIn) {
    addLog(s, 'info', `${seat.name} will leave after this hand`, now);
    finalize(s, fx, now);
    return;
  }
  if (!seat.folded) {
    seat.folded = true;
    seat.lastAction = { type: 'fold', amount: 0 };
    addLog(s, 'action', `${seat.name} folds and leaves the table`, now);
  }
  // A folded player can no longer win anything: cash out what is behind right away.
  walletDelta(fx, seat.userId, seat.stack + seat.pendingTopUp);
  seat.stack = 0;
  seat.pendingTopUp = 0;
  const live = liveSeats(s);
  if (live.length === 1) {
    finishUncontested(s, fx, live[0], now);
  } else if (s.toAct === i || !needsToAct(s, s.toAct)) {
    advanceFrom(s, fx, s.toAct === i ? i : s.toAct, now);
  }
  finalize(s, fx, now);
}

export function setSittingOut(s: EngineState, fx: Effects, userId: string, sittingOut: boolean, now: number) {
  const i = seatIndexOf(s, userId);
  if (i < 0) throw new GameError('not_seated', 'You are not seated at this table');
  const seat = seatAt(s, i);
  if (sittingOut) {
    if (!seat.sittingOut) {
      seat.sittingOut = true;
      seat.sittingOutSince = now;
      addLog(s, 'info', `${seat.name} is sitting out`, now);
    }
  } else {
    if (seat.leaving) throw new GameError('leaving', 'You are leaving this table');
    if (seat.stack + seat.pendingTopUp <= 0) throw new GameError('no_chips', 'Add chips to sit back in');
    const wasOut = seat.sittingOut || seat.away;
    seat.sittingOut = false;
    seat.sittingOutSince = null;
    seat.away = false;
    seat.timeouts = 0;
    if (wasOut) addLog(s, 'info', `${seat.name} is back`, now);
  }
  finalize(s, fx, now);
}

export function addChips(s: EngineState, fx: Effects, userId: string, amount: number, now: number) {
  const i = seatIndexOf(s, userId);
  if (i < 0) throw new GameError('not_seated', 'You are not seated at this table');
  const seat = seatAt(s, i);
  if (seat.leaving) throw new GameError('leaving', 'You are leaving this table');
  if (!Number.isInteger(amount) || amount <= 0) throw new GameError('bad_amount', 'Invalid amount');
  const total = seat.stack + seat.pendingTopUp + amount;
  if (total > s.config.maxBuyIn)
    throw new GameError('over_max', `Your stack cannot exceed the ${formatChips(s.config.maxBuyIn)} maximum buy-in`);
  walletDelta(fx, userId, -amount);
  const wasBusted = seat.stack + seat.pendingTopUp <= 0;
  const playingHand = isBettingPhase(s.phase) && seat.inHand && !seat.folded;
  if (playingHand) {
    seat.pendingTopUp += amount;
    addLog(s, 'info', `${seat.name} adds ${formatChips(amount)} (after this hand)`, now);
  } else {
    seat.stack += amount;
    addLog(s, 'info', `${seat.name} adds ${formatChips(amount)}`, now);
  }
  // Re-buying after busting means the player wants to play.
  if (wasBusted && seat.sittingOut) {
    seat.sittingOut = false;
    seat.sittingOutSince = null;
    seat.away = false;
    seat.timeouts = 0;
  }
  finalize(s, fx, now);
}

/** Refresh cosmetic identity of a seated player (name / avatar / color). */
export function updateIdentity(s: EngineState, player: PlayerIdentity): boolean {
  const i = seatIndexOf(s, player.userId);
  if (i < 0) return false;
  const seat = seatAt(s, i);
  const frame = player.frame ?? null;
  const backdrop = player.backdrop ?? null;
  const nameFx = player.nameFx ?? null;
  const club = player.club ?? null;
  if (
    seat.name === player.name &&
    seat.avatar === player.avatar &&
    seat.color === player.color &&
    (seat.frame ?? null) === frame &&
    (seat.backdrop ?? null) === backdrop &&
    (seat.nameFx ?? null) === nameFx &&
    (seat.club ?? null) === club
  )
    return false;
  seat.name = player.name;
  seat.avatar = player.avatar;
  seat.color = player.color;
  seat.frame = frame;
  seat.backdrop = backdrop;
  seat.nameFx = nameFx;
  seat.club = club;
  return true;
}

/* ------------------------------------------------------------------------ */
/* Hand lifecycle                                                            */
/* ------------------------------------------------------------------------ */

function resetSeatForHand(seat: Seat) {
  seat.inHand = false;
  seat.folded = false;
  seat.allIn = false;
  seat.bet = 0;
  seat.committed = 0;
  seat.hasActed = false;
  seat.actedLevel = 0;
  seat.lastAction = null;
  seat.vpip = false;
  seat.pfr = false;
}

/** Clean up after a hand and deal the next one if at least two players can play. */
export function startHand(s: EngineState, fx: Effects, now: number, rng: Rng) {
  if (isBettingPhase(s.phase)) throw new GameError('hand_in_progress', 'A hand is already in progress');

  for (let i = 0; i < s.seats.length; i++) {
    const seat = s.seats[i];
    if (!seat) continue;
    if (seat.leaving) {
      removeSeat(s, fx, i, now);
      continue;
    }
    if (seat.isBot) {
      if (seat.reservedFor) {
        seatReservation(s, fx, i, now); // a real player claimed this seat
      } else if (seat.stack + seat.pendingTopUp <= 0) {
        removeSeat(s, fx, i, now, 'busted out');
      } else {
        resetSeatForHand(seat);
      }
      continue;
    }
    if (seat.pendingTopUp > 0) {
      seat.stack += seat.pendingTopUp;
      seat.pendingTopUp = 0;
    }
    if (seat.stack <= 0 && !seat.sittingOut) {
      seat.sittingOut = true;
      seat.sittingOutSince = now;
      addLog(s, 'info', `${seat.name} is out of chips`, now);
    }
    if (seat.sittingOut && seat.sittingOutSince != null && now - seat.sittingOutSince >= TIMING.staleSitOutMs) {
      removeSeat(s, fx, i, now, 'was removed after sitting out');
      continue;
    }
    resetSeatForHand(seat);
  }

  s.board = [];
  s.pots = [];
  s.result = null;
  s.shown = [];
  s.runoutFrom = null;
  s.currentBet = 0;
  s.minRaise = s.config.bigBlind;
  s.nextHandAt = null;
  s.deck = [];
  s.hole = {};
  clearTurn(s);
  fillBots(s, fx, now, rng);

  const eligible = s.seats.map((seat, i) => (isEligibleForDeal(seat) ? i : -1)).filter((i) => i >= 0);
  if (!canDeal(s)) {
    s.phase = 'waiting';
    s.sbSeat = -1;
    s.bbSeat = -1;
    return;
  }

  // Move the button.
  if (s.dealer < 0 || s.dealer >= s.seats.length) s.dealer = eligible[rng(eligible.length)];
  else s.dealer = nextIndex(s, s.dealer, (seat) => isEligibleForDeal(seat));
  if (eligible.length === 2) {
    s.sbSeat = s.dealer; // heads-up: the button posts the small blind
    s.bbSeat = nextIndex(s, s.dealer, (seat) => isEligibleForDeal(seat));
  } else {
    s.sbSeat = nextIndex(s, s.dealer, (seat) => isEligibleForDeal(seat));
    s.bbSeat = nextIndex(s, s.sbSeat, (seat) => isEligibleForDeal(seat));
  }

  s.handNo += 1;
  s.deck = shuffle(freshDeck(), rng);
  for (const i of eligible) s.seats[i]!.inHand = true;

  // Deal two rounds, one card at a time, starting left of the button.
  const order: number[] = [];
  for (let k = 1; k <= s.seats.length; k++) {
    const i = (s.dealer + k) % s.seats.length;
    if (s.seats[i]?.inHand) order.push(i);
  }
  for (let round = 0; round < 2; round++)
    for (const i of order) (s.hole[String(i)] ??= []).push(draw(s));

  s.phase = 'preflop';
  fx.dealt = true;
  addLog(s, 'hand', `Hand #${s.handNo} · ${s.seats[s.dealer]!.name} has the button`, now);

  const sb = seatAt(s, s.sbSeat);
  const bb = seatAt(s, s.bbSeat);
  putChips(sb, s.config.smallBlind);
  sb.lastAction = { type: sb.allIn ? 'allin' : 'sb', amount: sb.bet };
  putChips(bb, s.config.bigBlind);
  bb.lastAction = { type: bb.allIn ? 'allin' : 'bb', amount: bb.bet };
  addLog(s, 'action', `${sb.name} posts the small blind ${formatChips(sb.bet)}`, now);
  addLog(s, 'action', `${bb.name} posts the big blind ${formatChips(bb.bet)}`, now);
  s.currentBet = s.config.bigBlind;
  s.minRaise = s.config.bigBlind;

  const first = findNextToAct(s, s.bbSeat);
  if (first >= 0) setTurn(s, first, now);
  else endStreet(s, fx, now);
}

function performAction(s: EngineState, i: number, action: PlayerAction, now: number, auto: boolean) {
  const seat = seatAt(s, i);
  const toCall = Math.max(0, s.currentBet - seat.bet);
  const tag = auto ? ' (auto)' : '';
  if (s.phase === 'preflop' && !auto) {
    // Voluntary money before the flop (blinds don't count); bets and raises also count as PFR.
    const raising = action.type === 'bet' || action.type === 'raise' || (action.type === 'allin' && seat.bet + seat.stack > s.currentBet);
    if (raising || action.type === 'call' || action.type === 'allin') seat.vpip = true;
    if (raising) seat.pfr = true;
  }
  switch (action.type) {
    case 'fold': {
      seat.folded = true;
      seat.lastAction = { type: 'fold', amount: 0, auto };
      addLog(s, 'action', `${seat.name} folds${tag}`, now);
      return;
    }
    case 'check': {
      if (toCall > 0) throw new GameError('cannot_check', 'You cannot check facing a bet');
      seat.hasActed = true;
      seat.actedLevel = s.currentBet;
      seat.lastAction = { type: 'check', amount: seat.bet, auto };
      addLog(s, 'action', `${seat.name} checks${tag}`, now);
      return;
    }
    case 'call': {
      if (toCall <= 0) throw new GameError('nothing_to_call', 'There is nothing to call');
      putChips(seat, toCall);
      seat.hasActed = true;
      seat.actedLevel = s.currentBet;
      seat.lastAction = { type: seat.allIn ? 'allin' : 'call', amount: seat.bet };
      addLog(
        s,
        'action',
        seat.allIn ? `${seat.name} calls all-in ${formatChips(seat.bet)}` : `${seat.name} calls ${formatChips(seat.bet)}`,
        now,
      );
      return;
    }
    case 'bet':
    case 'raise': {
      const target = Number(action.amount);
      if (!Number.isFinite(target) || !Number.isInteger(target)) throw new GameError('bad_amount', 'Invalid amount');
      const maxTo = seat.bet + seat.stack;
      if (target > maxTo) throw new GameError('bad_amount', 'You do not have that many chips');
      if (target <= s.currentBet) throw new GameError('bad_amount', 'A raise must be larger than the current bet');
      if (!raiseRuleOpen(s, seat)) throw new GameError('cannot_raise', 'Betting is not re-opened to you: call or fold');
      const minTo = s.currentBet === 0 ? s.config.bigBlind : s.currentBet + s.minRaise;
      if (target < minTo && target < maxTo)
        throw new GameError('raise_too_small', `The minimum ${s.currentBet === 0 ? 'bet' : 'raise'} is ${formatChips(minTo)}`);
      raiseTo(s, seat, target, now);
      return;
    }
    case 'allin': {
      const total = seat.bet + seat.stack;
      if (seat.stack <= 0) throw new GameError('bad_action', 'You have no chips behind');
      if (total <= s.currentBet) {
        putChips(seat, seat.stack);
        seat.hasActed = true;
        seat.actedLevel = s.currentBet;
        seat.lastAction = { type: 'allin', amount: seat.bet };
        addLog(s, 'action', `${seat.name} calls all-in ${formatChips(seat.bet)}`, now);
        return;
      }
      if (!raiseRuleOpen(s, seat)) throw new GameError('cannot_raise', 'Betting is not re-opened to you: call or fold');
      raiseTo(s, seat, total, now);
      return;
    }
    default:
      throw new GameError('bad_action', 'Unknown action');
  }
}

function raiseTo(s: EngineState, seat: Seat, total: number, now: number) {
  const prevBet = s.currentBet;
  const increment = total - prevBet;
  putChips(seat, total - seat.bet);
  if (increment >= s.minRaise) s.minRaise = increment; // full raise: sets the new minimum increment
  s.currentBet = total;
  seat.hasActed = true;
  seat.actedLevel = total;
  const type = seat.allIn ? 'allin' : prevBet === 0 ? 'bet' : 'raise';
  seat.lastAction = { type, amount: total };
  const verb = seat.allIn ? 'goes all-in for' : prevBet === 0 ? 'bets' : 'raises to';
  addLog(s, 'action', `${seat.name} ${verb} ${formatChips(total)}`, now);
}

/** After seat `from` acted (or was removed), move the action forward. */
function advanceFrom(s: EngineState, fx: Effects, from: number, now: number) {
  const live = liveSeats(s);
  if (live.length === 1) {
    finishUncontested(s, fx, live[0], now);
    return;
  }
  const next = findNextToAct(s, from);
  if (next >= 0) setTurn(s, next, now);
  else endStreet(s, fx, now);
}

/** Return the part of the largest bet nobody matched. */
function returnUncalled(s: EngineState, now: number) {
  const inHand = s.seats.filter((x): x is Seat => !!x && x.inHand).sort((a, b) => b.bet - a.bet);
  if (inHand.length === 0) return;
  const top = inHand[0];
  const second = inHand[1]?.bet ?? 0;
  if (top.bet > second) {
    const diff = top.bet - second;
    top.bet -= diff;
    top.committed -= diff;
    top.stack += diff;
    if (top.stack > 0) top.allIn = false;
    addLog(s, 'info', `Uncalled ${formatChips(diff)} returned to ${top.name}`, now);
  }
}

function collectBets(s: EngineState) {
  for (const seat of s.seats) {
    if (!seat || !seat.inHand) continue;
    seat.bet = 0;
    seat.hasActed = false;
    seat.actedLevel = 0;
    if (seat.lastAction && seat.lastAction.type !== 'fold' && seat.lastAction.type !== 'allin') seat.lastAction = null;
  }
  s.currentBet = 0;
  s.minRaise = s.config.bigBlind;
}

function revealLiveHands(s: EngineState) {
  for (const i of liveSeats(s)) {
    if (!s.shown.some((x) => x.seat === i)) s.shown.push({ seat: i, cards: holeOf(s, i).slice() });
  }
}

function endStreet(s: EngineState, fx: Effects, now: number) {
  returnUncalled(s, now);
  collectBets(s);
  s.pots = computePots(s.seats);
  clearTurn(s);

  if (s.phase === 'river') {
    showdown(s, fx, now);
    return;
  }

  if (actorCount(s) <= 1 && s.runoutFrom == null) {
    s.runoutFrom = s.board.length;
    revealLiveHands(s);
    addLog(s, 'info', 'All in! Running out the board', now);
  }

  draw(s); // burn
  if (s.phase === 'preflop') {
    s.board.push(draw(s), draw(s), draw(s));
    s.phase = 'flop';
    addLog(s, 'board', `Flop: ${s.board.map(cardToText).join(' ')}`, now);
  } else if (s.phase === 'flop') {
    s.board.push(draw(s));
    s.phase = 'turn';
    addLog(s, 'board', `Turn: ${cardToText(s.board[3])}`, now);
  } else {
    s.board.push(draw(s));
    s.phase = 'river';
    addLog(s, 'board', `River: ${cardToText(s.board[4])}`, now);
  }

  const first = findNextToAct(s, s.dealer);
  if (first >= 0) setTurn(s, first, now);
  else endStreet(s, fx, now);
}

function potLabel(index: number, count: number) {
  if (count === 1) return 'Pot';
  return index === 0 ? 'Main pot' : `Side pot ${index}`;
}

function showdown(s: EngineState, fx: Effects, now: number) {
  const live = liveSeats(s);
  const evals = new Map<number, ReturnType<typeof evaluateHand>>();
  for (const i of live) evals.set(i, evaluateHand([...holeOf(s, i), ...s.board]));
  revealLiveHands(s);

  const pots = computePots(s.seats);
  const payouts = new Map<number, number>();
  const potResults: PotResult[] = [];
  pots.forEach((pot, k) => {
    const contenders = pot.eligible.filter((i) => evals.has(i));
    let best = -1;
    for (const i of contenders) best = Math.max(best, evals.get(i)!.score);
    const winners = contenders.filter((i) => evals.get(i)!.score === best);
    for (const [seat, amt] of splitPot(pot.amount, winners, s.dealer, s.seats.length))
      payouts.set(seat, (payouts.get(seat) ?? 0) + amt);
    potResults.push({
      amount: pot.amount,
      winners,
      handName: winners.length ? evals.get(winners[0])!.description : null,
      label: potLabel(k, pots.length),
    });
  });

  const hands: ShownHand[] = live.map((i) => {
    const e = evals.get(i)!;
    return {
      seat: i,
      cards: holeOf(s, i).slice(),
      name: e.name,
      description: e.description,
      best: e.best,
      category: e.category,
    };
  });

  for (const h of hands) {
    const seat = seatAt(s, h.seat);
    const st = stat(fx, seat.userId);
    st.bestHand = Math.max(st.bestHand, h.category);
    addLog(s, 'info', `${seat.name} shows ${h.cards.map(cardToText).join(' ')} — ${h.description}`, now);
  }

  finishHand(s, fx, now, potResults, payouts, hands, false);
}

function finishUncontested(s: EngineState, fx: Effects, winner: number, now: number) {
  returnUncalled(s, now);
  collectBets(s);
  let total = 0;
  for (const seat of s.seats) if (seat && seat.inHand) total += seat.committed;
  const payouts = new Map<number, number>([[winner, total]]);
  finishHand(s, fx, now, [{ amount: total, winners: [winner], handName: null, label: 'Pot' }], payouts, [], true);
}

function finishHand(
  s: EngineState,
  fx: Effects,
  now: number,
  pots: PotResult[],
  payouts: Map<number, number>,
  hands: ShownHand[],
  uncontested: boolean,
) {
  const runoutStreets = s.runoutFrom == null ? 0 : s.runoutFrom === 0 ? 3 : s.runoutFrom === 3 ? 2 : s.runoutFrom === 4 ? 1 : 0;

  const result: HandResult = { handNo: s.handNo, uncontested, pots, payouts: [], hands };
  const shownCategory = new Map(hands.map((h) => [h.seat, h.category]));
  const record: HandRecord = { handNo: s.handNo, bigBlind: s.config.bigBlind, uncontested, players: [] };
  s.seats.forEach((seat, i) => {
    if (!seat || !seat.inHand) return;
    record.players.push({
      userId: seat.userId,
      isBot: !!seat.isBot,
      startStack: seat.stack + seat.committed,
      committed: seat.committed,
      won: payouts.get(i) ?? 0,
      folded: seat.folded,
      allIn: seat.allIn,
      category: shownCategory.get(i) ?? -1,
      vpip: !!seat.vpip,
      pfr: !!seat.pfr,
    });
  });
  fx.hands.push(record);
  for (const [i, amount] of payouts) {
    const seat = seatAt(s, i);
    seat.stack += amount;
    if (seat.stack > 0) seat.allIn = false;
    result.payouts.push({ seat: i, userId: seat.userId, name: seat.name, amount });
  }

  for (const seat of s.seats) {
    if (!seat || !seat.inHand) continue;
    stat(fx, seat.userId).played += 1;
    seat.bet = 0;
  }
  for (const p of result.payouts) {
    const st = stat(fx, p.userId);
    st.won += 1;
    st.biggestPot = Math.max(st.biggestPot, p.amount);
    const handName = pots.find((x) => x.winners.includes(p.seat))?.handName;
    addLog(s, 'win', `${p.name} wins ${formatChips(p.amount)}${handName ? ` with ${handName}` : ''}`, now);
  }

  s.result = result;
  s.phase = 'showdown';
  s.pots = [];
  s.currentBet = 0;
  clearTurn(s);
  s.nextHandAt =
    now + (uncontested ? TIMING.uncontestedMs : TIMING.showdownMs) + runoutStreets * TIMING.runoutStreetMs;
}

/* ------------------------------------------------------------------------ */
/* Player actions & clock                                                    */
/* ------------------------------------------------------------------------ */

export function applyAction(s: EngineState, fx: Effects, userId: string, action: PlayerAction, now: number) {
  if (!isBettingPhase(s.phase)) throw new GameError('no_hand', 'No hand is in progress');
  const i = seatIndexOf(s, userId);
  if (i < 0) throw new GameError('not_seated', 'You are not seated at this table');
  if (s.toAct !== i) throw new GameError('not_your_turn', 'It is not your turn');
  performAction(s, i, action, now, false);
  const seat = seatAt(s, i);
  seat.timeouts = 0;
  advanceFrom(s, fx, i, now);
  finalize(s, fx, now);
}

function autoAct(s: EngineState, fx: Effects, i: number, now: number, timedOut: boolean) {
  const seat = seatAt(s, i);
  const canCheck = seat.bet >= s.currentBet;
  if (timedOut) {
    seat.timeouts += 1;
    addLog(s, 'info', `${seat.name} ran out of time`, now);
  }
  performAction(s, i, { type: canCheck ? 'check' : 'fold' }, now, true);
  if (timedOut && seat.timeouts >= TIMING.timeoutsBeforeAway && !seat.away) {
    seat.away = true;
    seat.sittingOut = true;
    seat.sittingOutSince = now;
    addLog(s, 'info', `${seat.name} is away and will sit out`, now);
  }
  advanceFrom(s, fx, i, now);
}

const DEFAULT_BRAIN = { level: 'medium', tight: 0.5, aggr: 0.5, bluff: 0.1, iters: 160 } as const;

/** Let the bot in seat `i` make its move. */
function botAct(s: EngineState, fx: Effects, i: number, now: number, rng: Rng) {
  const seat = seatAt(s, i);
  const brain = s.bots?.[seat.userId] ?? { ...DEFAULT_BRAIN };
  try {
    performAction(s, i, decideBotAction(s, i, brain, rng), now, false);
  } catch {
    // Never let a bot stall the table: fall back to the safest legal move.
    performAction(s, i, { type: seat.bet >= s.currentBet ? 'check' : 'fold' }, now, false);
  }
  advanceFrom(s, fx, i, now);
}

/**
 * Every real player has left (or is leaving): play the rest of the hand out
 * instantly and release the departing seats so their chips are cashed out
 * and the table can close.
 */
function finishAbandonedHand(s: EngineState, fx: Effects, now: number) {
  if (humanSeats(s, false).length > 0 || humanSeats(s).length === 0) return;
  const rng = seededRng(s.handNo * 7919 + s.logSeq);
  for (let guard = 0; guard < 500 && isBettingPhase(s.phase) && s.toAct >= 0; guard++) {
    if (s.seats[s.toAct]?.isBot) botAct(s, fx, s.toAct, now, rng);
    else autoAct(s, fx, s.toAct, now, false);
  }
  if (s.phase === 'showdown') startHand(s, fx, now, rng);
}

/** Players marked away (or leaving) act instantly so the table never waits on them. */
function driveAutomatic(s: EngineState, fx: Effects, now: number) {
  for (let guard = 0; guard < 200; guard++) {
    if (!isBettingPhase(s.phase) || s.toAct < 0) return;
    const seat = s.seats[s.toAct];
    if (!seat || !(seat.away || seat.leaving)) return;
    autoAct(s, fx, s.toAct, now, false);
  }
}

function finalize(s: EngineState, fx: Effects, now: number) {
  driveAutomatic(s, fx, now);
  finishAbandonedHand(s, fx, now);
  scheduleIfReady(s, now);
  s.updatedAt = now;
}

/**
 * Advance timers: apply turn timeouts and deal the next hand when due.
 * Returns true when the state changed.
 */
export function tick(s: EngineState, fx: Effects, now: number, rng: Rng): boolean {
  let changed = false;
  for (let guard = 0; guard < 50; guard++) {
    if (isBettingPhase(s.phase) && s.toAct >= 0 && s.actionDeadline != null && now >= s.actionDeadline) {
      if (s.seats[s.toAct]?.isBot) botAct(s, fx, s.toAct, now, rng);
      else autoAct(s, fx, s.toAct, now, true);
      driveAutomatic(s, fx, now);
      changed = true;
      continue;
    }
    if ((s.phase === 'waiting' || s.phase === 'showdown') && s.nextHandAt != null && now >= s.nextHandAt) {
      startHand(s, fx, now, rng);
      driveAutomatic(s, fx, now);
      changed = true;
      continue;
    }
    break;
  }
  if (changed) finalize(s, fx, now);
  return changed;
}

/** Next moment (epoch ms) at which `tick` would change something, or null. */
export function nextDeadline(s: Pick<EngineState, 'phase' | 'actionDeadline' | 'nextHandAt' | 'toAct'>): number | null {
  if (isBettingPhase(s.phase) && s.toAct >= 0 && s.actionDeadline != null) return s.actionDeadline;
  if ((s.phase === 'waiting' || s.phase === 'showdown') && s.nextHandAt != null) return s.nextHandAt;
  return null;
}

/**
 * Close the table: cancel any hand in progress (everyone gets their committed
 * chips back) and cash every player out. Used by the inactivity janitor.
 */
export function closeTable(s: EngineState, fx: Effects, now: number, reason = 'Table closed for inactivity') {
  if (isBettingPhase(s.phase)) {
    for (const seat of s.seats) {
      if (!seat || !seat.inHand) continue;
      seat.stack += seat.committed;
      seat.bet = 0;
      seat.committed = 0;
    }
    addLog(s, 'info', `Hand #${s.handNo} cancelled — all bets returned`, now);
  }
  for (let i = 0; i < s.seats.length; i++) if (s.seats[i]) removeSeat(s, fx, i, now, 'was cashed out');
  s.phase = 'waiting';
  s.board = [];
  s.pots = [];
  s.result = null;
  s.shown = [];
  s.runoutFrom = null;
  s.currentBet = 0;
  s.deck = [];
  s.hole = {};
  s.nextHandAt = null;
  clearTurn(s);
  addLog(s, 'info', reason, now);
  s.updatedAt = now;
}

/* ------------------------------------------------------------------------ */
/* Queries (shared with the client)                                          */
/* ------------------------------------------------------------------------ */

type LegalInput = Pick<EngineState, 'phase' | 'toAct' | 'currentBet' | 'minRaise' | 'seats' | 'config'>;

export function getLegalActions(s: LegalInput, seatIndex: number): LegalActions {
  const none: LegalActions = {
    canAct: false,
    canFold: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    callIsAllIn: false,
    isBet: s.currentBet === 0,
    canRaise: false,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    canAllIn: false,
  };
  const seat = s.seats[seatIndex];
  if (!seat || !isBettingPhase(s.phase) || s.toAct !== seatIndex || !seat.inHand || seat.folded || seat.allIn)
    return none;
  const toCall = Math.max(0, s.currentBet - seat.bet);
  const callAmount = Math.min(toCall, seat.stack);
  const maxTo = seat.bet + seat.stack;
  const open =
    seat.stack > toCall && (!seat.hasActed || s.currentBet - seat.actedLevel >= s.minRaise);
  const minTo = Math.min(maxTo, s.currentBet === 0 ? s.config.bigBlind : s.currentBet + s.minRaise);
  return {
    canAct: true,
    canFold: true,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount,
    callIsAllIn: toCall > 0 && callAmount === seat.stack,
    isBet: s.currentBet === 0,
    canRaise: open,
    minRaiseTo: open ? minTo : 0,
    maxRaiseTo: open ? maxTo : 0,
    canAllIn: open || (toCall > 0 && seat.stack <= toCall),
  };
}

/** Sum of all chips in the middle, including bets on the current street. */
export function potTotal(s: Pick<EngineState, 'pots' | 'seats'>): number {
  let total = s.pots.reduce((a, p) => a + p.amount, 0);
  for (const seat of s.seats) if (seat && seat.inHand) total += seat.bet;
  return total;
}

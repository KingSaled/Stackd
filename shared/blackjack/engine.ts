/**
 * Blackjack against the house, server-authoritative like the poker engine.
 *
 * Rules: six-deck shoe (reshuffled at the cut card), blackjack pays 3:2, the
 * dealer peeks for blackjack with an ace or ten showing and stands on all 17s.
 * Players may double on any two cards and split pairs (equal value) up to four
 * hands; split aces get one card each. No insurance or surrender.
 *
 * Money: bets come straight out of the player's wallet when placed and winnings
 * go straight back in when the round settles, so there is no buy-in.
 */
import { freshDeck, shuffle, type Card, type Rng } from '../poker/cards';
import { GameError } from '../poker/engine';
import type { LogKind } from '../poker/types';
import type {
  BjAction,
  BjConfig,
  BjEffects,
  BjHand,
  BjPublicState,
  BjRoundPlayer,
  BjRoundRecord,
  BjSeat,
  BjSecretState,
  BjState,
} from './types';

export const BJ_DECKS = 6;
/** Reshuffle when this share of the shoe is left. */
export const BJ_CUT = 0.25;
export const BJ_SEATS = 6;
export const BJ_LIMITS = { minBet: 10, maxBet: 50_000 };
export const BJ_TIMERS = [10, 15, 20, 30];
export const BJ_MAX_HANDS = 4;
/** Betting stays open this long after the first bet if not everyone has bet. */
export const BET_WINDOW_MS = 10_000;
/** Players who sit through this many dealt rounds without betting lose their seat. */
export const MAX_MISSED = 5;

/** Client animation budgets, so timers start after the cards have landed. */
export const DEAL_CARD_MS = 190;
export const DEALER_CARD_MS = 600;
export const RESULT_HOLD_MS = 3600;

export interface BjIdentity {
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
/* Card maths                                                                */
/* ------------------------------------------------------------------------ */

export function cardPoints(card: Card): number {
  const r = card[0];
  if (r === 'A') return 11;
  if (r === 'T' || r === 'J' || r === 'Q' || r === 'K') return 10;
  return Number(r);
}

/** Best total of a hand and whether an ace still counts as 11 ("soft"). */
export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPoints(c);
    if (c[0] === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isNatural(hand: Pick<BjHand, 'cards' | 'split'>): boolean {
  return !hand.split && hand.cards.length === 2 && handTotal(hand.cards).total === 21;
}

export function totalLabel(cards: Card[]): string {
  const { total, soft } = handTotal(cards);
  if (cards.length === 2 && total === 21) return 'Blackjack';
  if (total > 21) return `${total}`;
  return soft && total < 21 ? `${total - 10}/${total}` : `${total}`;
}

export function canSplit(hand: BjHand, handCount: number): boolean {
  return (
    hand.cards.length === 2 &&
    !hand.splitAces &&
    handCount < BJ_MAX_HANDS &&
    cardPoints(hand.cards[0]) === cardPoints(hand.cards[1])
  );
}

export function canDouble(hand: BjHand): boolean {
  return hand.cards.length === 2 && !hand.splitAces && !hand.doubled && !hand.done;
}

/* ------------------------------------------------------------------------ */
/* State                                                                     */
/* ------------------------------------------------------------------------ */

export function sanitizeBjConfig(raw: Partial<BjConfig> = {}): BjConfig {
  const t = Number(raw.turnSeconds);
  return {
    game: 'blackjack',
    maxSeats: BJ_SEATS,
    minBet: BJ_LIMITS.minBet,
    maxBet: BJ_LIMITS.maxBet,
    turnSeconds: BJ_TIMERS.includes(t) ? t : 15,
  };
}

export function createBjState(config: BjConfig, now: number): BjState {
  return {
    v: 1,
    game: 'blackjack',
    config,
    roundNo: 0,
    phase: 'waiting',
    seats: Array.from({ length: config.maxSeats }, () => null),
    dealer: [],
    holeHidden: false,
    toAct: -1,
    handIdx: 0,
    turnStartedAt: null,
    actionDeadline: null,
    bettingDeadline: null,
    nextRoundAt: null,
    dealtAt: null,
    settledAt: null,
    dealerDraws: 0,
    dealerBlackjack: false,
    shoeLeft: 0,
    shoeSize: BJ_DECKS * 52,
    shuffled: false,
    log: [],
    logSeq: 0,
    updatedAt: now,
    shoe: [],
    hole: null,
  };
}

export function toBjPublic(s: BjState): BjPublicState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { shoe, hole, ...pub } = s;
  return JSON.parse(JSON.stringify({ ...pub, shoeLeft: shoe.length }));
}

export function toBjSecret(s: BjState): BjSecretState {
  return { shoe: s.shoe.slice(), hole: s.hole };
}

export function mergeBjState(pub: BjPublicState, secret: Partial<BjSecretState> | null | undefined): BjState {
  return { ...JSON.parse(JSON.stringify(pub)), shoe: (secret?.shoe ?? []).slice(), hole: secret?.hole ?? null };
}

export function bjSeatOf(s: Pick<BjPublicState, 'seats'>, userId: string): number {
  return s.seats.findIndex((x) => x?.userId === userId);
}

function log(s: BjState, kind: LogKind, text: string, now: number) {
  s.logSeq += 1;
  s.log.push({ id: s.logSeq, kind, text, at: now });
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
}

function pay(fx: BjEffects, userId: string, delta: number) {
  if (delta) fx.wallet[userId] = (fx.wallet[userId] ?? 0) + delta;
}

const money = (n: number) => n.toLocaleString('en-US');

function draw(s: BjState): Card {
  const c = s.shoe.pop();
  if (!c) throw new GameError('shoe_empty', 'The shoe ran out');
  return c;
}

/** Chips each player has on the table right now (pending bet or bets in play). */
export function chipsOnTable(seat: BjSeat): number {
  return seat.bet + seat.hands.reduce((a, h) => a + (h.outcome ? 0 : h.bet), 0);
}

function seatedPlayers(s: BjState) {
  return s.seats.filter((x): x is BjSeat => !!x);
}

/* ------------------------------------------------------------------------ */
/* Seats                                                                     */
/* ------------------------------------------------------------------------ */

export function bjSitDown(s: BjState, who: BjIdentity, seatIdx: number, now: number) {
  if (!Number.isInteger(seatIdx) || seatIdx < 0 || seatIdx >= s.seats.length) throw new GameError('bad_seat', 'That seat does not exist');
  if (bjSeatOf(s, who.userId) >= 0) throw new GameError('already_seated', 'You are already sitting at this table');
  if (s.seats[seatIdx]) throw new GameError('seat_taken', 'That seat is taken');
  s.seats[seatIdx] = {
    userId: who.userId,
    name: who.name,
    avatar: who.avatar,
    color: who.color,
    frame: who.frame ?? null,
    backdrop: who.backdrop ?? null,
    nameFx: who.nameFx ?? null,
    club: who.club ?? null,
    bet: 0,
    lastBet: 0,
    hands: [],
    leaving: false,
    missed: 0,
    timeouts: 0,
    joinedAt: now,
  };
  if (s.phase === 'waiting') openBetting(s);
  log(s, 'info', `${who.name} sat down`, now);
}

export function bjStandUp(s: BjState, fx: BjEffects, userId: string, rng: Rng, now: number) {
  const i = bjSeatOf(s, userId);
  if (i < 0) throw new GameError('not_seated', 'You are not seated');
  const seat = s.seats[i]!;
  if (seat.bet > 0) {
    pay(fx, userId, seat.bet);
    seat.bet = 0;
  }
  const inRound = s.phase === 'playing' && seat.hands.some((h) => !h.outcome);
  if (inRound) {
    // Hands still in play stand where they are and settle with the round.
    seat.leaving = true;
    for (const h of seat.hands) h.done = true;
    log(s, 'info', `${seat.name} left; their hands stand`, now);
    if (s.toAct === i) advance(s, fx, rng, now);
    return;
  }
  s.seats[i] = null;
  log(s, 'info', `${seat.name} left the table`, now);
  afterSeatsChanged(s, rng, now, fx);
}

function afterSeatsChanged(s: BjState, rng: Rng, now: number, fx: BjEffects) {
  const players = seatedPlayers(s);
  if (players.length === 0) {
    resetRound(s);
    s.phase = 'waiting';
    s.bettingDeadline = null;
    s.nextRoundAt = null;
    return;
  }
  if (s.phase === 'betting') maybeDeal(s, fx, rng, now);
}

/* ------------------------------------------------------------------------ */
/* Betting                                                                   */
/* ------------------------------------------------------------------------ */

function openBetting(s: BjState) {
  s.phase = 'betting';
  s.bettingDeadline = null;
  s.nextRoundAt = null;
}

export function bjPlaceBet(s: BjState, fx: BjEffects, userId: string, amount: number, rng: Rng, now: number) {
  const i = bjSeatOf(s, userId);
  if (i < 0) throw new GameError('not_seated', 'Take a seat first');
  // Betting for the next round can start once this round's results have been on screen for a moment.
  if (s.phase === 'settled' && s.settledAt != null && now >= s.settledAt + 1500 + s.dealerDraws * DEALER_CARD_MS) startRound(s, now, fx, rng);
  if (s.phase !== 'betting') throw new GameError('bad_phase', 'Bets are closed until this round ends');
  const seat = s.seats[i]!;
  if (seat.leaving) throw new GameError('bad_phase', 'You are leaving this table');
  if (!Number.isInteger(amount) || amount < s.config.minBet || amount > s.config.maxBet)
    throw new GameError('bad_bet', `Bets are ${money(s.config.minBet)} to ${money(s.config.maxBet)} chips`);
  pay(fx, userId, seat.bet - amount);
  seat.bet = amount;
  seat.lastBet = amount;
  if (s.bettingDeadline == null) s.bettingDeadline = now + BET_WINDOW_MS;
  maybeDeal(s, fx, rng, now);
}

export function bjClearBet(s: BjState, fx: BjEffects, userId: string, now: number) {
  const i = bjSeatOf(s, userId);
  if (i < 0) throw new GameError('not_seated', 'Take a seat first');
  if (s.phase !== 'betting') throw new GameError('bad_phase', 'Bets are locked in once cards are dealt');
  const seat = s.seats[i]!;
  if (seat.bet > 0) {
    pay(fx, userId, seat.bet);
    seat.bet = 0;
  }
  if (!seatedPlayers(s).some((x) => x.bet > 0)) s.bettingDeadline = null;
  s.updatedAt = now;
}

/** Deal as soon as every seated player has bet (or the betting window closed). */
function maybeDeal(s: BjState, fx: BjEffects, rng: Rng, now: number, windowClosed = false) {
  if (s.phase !== 'betting') return false;
  const players = seatedPlayers(s).filter((x) => !x.leaving);
  const betting = players.filter((x) => x.bet > 0);
  if (betting.length === 0) return false;
  if (!windowClosed && betting.length < players.length) return false;
  deal(s, fx, rng, now);
  return true;
}

/* ------------------------------------------------------------------------ */
/* Round flow                                                                */
/* ------------------------------------------------------------------------ */

function resetRound(s: BjState) {
  for (const seat of seatedPlayers(s)) seat.hands = [];
  s.dealer = [];
  s.hole = null;
  s.holeHidden = false;
  s.toAct = -1;
  s.handIdx = 0;
  s.turnStartedAt = null;
  s.actionDeadline = null;
  s.dealtAt = null;
  s.settledAt = null;
  s.dealerDraws = 0;
  s.dealerBlackjack = false;
  s.shuffled = false;
}

/** Clear the settled round and open betting for the next one. */
function startRound(s: BjState, now: number, fx: BjEffects, rng: Rng) {
  resetRound(s);
  s.nextRoundAt = null;
  // Seats of players who keep sitting out free up for others.
  s.seats.forEach((seat, i) => {
    if (seat && seat.missed >= MAX_MISSED) {
      log(s, 'info', `${seat.name} was away and gave up the seat`, now);
      s.seats[i] = null;
    }
  });
  if (seatedPlayers(s).length === 0) {
    s.phase = 'waiting';
    return;
  }
  openBetting(s);
  maybeDeal(s, fx, rng, now);
}

function deal(s: BjState, fx: BjEffects, rng: Rng, now: number) {
  resetRound(s);
  if (s.shoe.length < s.shoeSize * BJ_CUT) {
    const cards: Card[] = [];
    for (let d = 0; d < BJ_DECKS; d++) cards.push(...freshDeck());
    s.shoe = shuffle(cards, rng);
    s.shoeSize = s.shoe.length;
    s.shuffled = true;
  }
  s.roundNo += 1;
  s.phase = 'playing';
  s.bettingDeadline = null;
  s.dealtAt = now;
  log(s, 'hand', `Round #${s.roundNo}`, now);

  const order: number[] = [];
  s.seats.forEach((seat, i) => {
    if (!seat) return;
    if (seat.bet > 0 && !seat.leaving) {
      seat.hands = [{ cards: [], bet: seat.bet, doubled: false, split: false, splitAces: false, done: false, outcome: null, payout: 0 }];
      log(s, 'action', `${seat.name} bets ${money(seat.bet)}`, now);
      seat.bet = 0;
      seat.missed = 0;
      order.push(i);
    } else {
      seat.missed += 1;
    }
  });

  // Two passes round the table, dealer's up card after the first and the hole card after the second.
  for (const i of order) s.seats[i]!.hands[0].cards.push(draw(s));
  s.dealer.push(draw(s));
  for (const i of order) s.seats[i]!.hands[0].cards.push(draw(s));
  s.hole = draw(s);
  s.holeHidden = true;

  const cardsDealt = order.length * 2 + 2;
  const playFrom = now + cardsDealt * DEAL_CARD_MS + 350;

  // Dealer peeks under an ace or a ten.
  if (cardPoints(s.dealer[0]) >= 10 && handTotal([s.dealer[0], s.hole]).total === 21) {
    s.dealerBlackjack = true;
    for (const i of order) for (const h of s.seats[i]!.hands) h.done = true;
    log(s, 'board', 'Dealer has blackjack', now);
    settle(s, fx, rng, playFrom);
    return;
  }

  for (const i of order) {
    const h = s.seats[i]!.hands[0];
    if (handTotal(h.cards).total === 21) h.done = true;
  }
  s.toAct = -1;
  s.handIdx = 0;
  nextTurn(s, fx, rng, playFrom, -1);
}

/** Move to the next hand that still needs a decision, or let the dealer play. */
function nextTurn(s: BjState, fx: BjEffects, rng: Rng, now: number, fromSeat: number, fromHand = -1) {
  const n = s.seats.length;
  for (let i = Math.max(0, fromSeat); i < n; i++) {
    const seat = s.seats[i];
    if (!seat || seat.hands.length === 0) continue;
    const start = i === fromSeat ? fromHand + 1 : 0;
    for (let k = start; k < seat.hands.length; k++) {
      if (!seat.hands[k].done) {
        s.toAct = i;
        s.handIdx = k;
        s.turnStartedAt = Math.max(now, s.turnStartedAt ?? 0);
        s.actionDeadline = s.turnStartedAt + s.config.turnSeconds * 1000;
        return;
      }
    }
  }
  s.toAct = -1;
  s.handIdx = 0;
  s.turnStartedAt = null;
  s.actionDeadline = null;
  dealerPlays(s, fx, rng, now);
}

function advance(s: BjState, fx: BjEffects, rng: Rng, now: number) {
  nextTurn(s, fx, rng, now, s.toAct, s.handIdx);
}

function dealerPlays(s: BjState, fx: BjEffects, rng: Rng, now: number) {
  if (s.hole) {
    s.dealer.push(s.hole);
    s.hole = null;
  }
  s.holeHidden = false;
  // The dealer only draws if some hand is still alive and not a blackjack.
  const live = seatedPlayers(s).some((seat) => seat.hands.some((h) => handTotal(h.cards).total <= 21 && !isNatural(h)));
  let draws = 0;
  if (live) {
    while (handTotal(s.dealer).total < 17) {
      s.dealer.push(draw(s));
      draws++;
    }
  }
  s.dealerDraws = draws;
  const { total } = handTotal(s.dealer);
  log(s, 'board', total > 21 ? `Dealer busts with ${total}` : `Dealer stands on ${total}`, now);
  settle(s, fx, rng, now);
}

function settle(s: BjState, fx: BjEffects, _rng: Rng, now: number) {
  if (s.hole) {
    s.dealer.push(s.hole);
    s.hole = null;
  }
  s.holeHidden = false;
  const dealer = handTotal(s.dealer).total;
  const dealerBj = s.dealerBlackjack || (s.dealer.length === 2 && dealer === 21);
  const record: BjRoundRecord = { roundNo: s.roundNo, players: [] };
  for (const seat of seatedPlayers(s)) {
    let net = 0;
    const who: BjRoundPlayer = { userId: seat.userId, hands: 0, wins: 0, blackjacks: 0, pushes: 0, doubleWins: 0, splits: 0, wagered: 0, net: 0 };
    for (const h of seat.hands) {
      const t = handTotal(h.cards).total;
      if (t > 21) {
        h.outcome = 'bust';
        h.payout = 0;
      } else if (isNatural(h) && !dealerBj) {
        h.outcome = 'blackjack';
        h.payout = h.bet + Math.floor(h.bet * 1.5);
      } else if (dealerBj) {
        h.outcome = isNatural(h) ? 'push' : 'lose';
        h.payout = isNatural(h) ? h.bet : 0;
      } else if (dealer > 21 || t > dealer) {
        h.outcome = 'win';
        h.payout = h.bet * 2;
      } else if (t === dealer) {
        h.outcome = 'push';
        h.payout = h.bet;
      } else {
        h.outcome = 'lose';
        h.payout = 0;
      }
      h.done = true;
      pay(fx, seat.userId, h.payout);
      net += h.payout - h.bet;
      who.hands += 1;
      who.wagered += h.bet;
      if (h.outcome === 'win' || h.outcome === 'blackjack') who.wins += 1;
      if (h.outcome === 'blackjack') who.blackjacks += 1;
      if (h.outcome === 'push') who.pushes += 1;
      if (h.doubled && h.outcome === 'win') who.doubleWins += 1;
    }
    if (seat.hands.length) {
      who.splits = seat.hands.length - 1;
      who.net = net;
      record.players.push(who);
      const verb = net > 0 ? `wins ${money(net)}` : net < 0 ? `loses ${money(-net)}` : 'pushes';
      log(s, net > 0 ? 'win' : 'action', `${seat.name} ${verb}`, now);
    }
  }
  if (record.players.length) fx.rounds.push(record);
  s.phase = 'settled';
  s.toAct = -1;
  s.turnStartedAt = null;
  s.actionDeadline = null;
  s.settledAt = now;
  s.nextRoundAt = now + 500 + s.dealerDraws * DEALER_CARD_MS + RESULT_HOLD_MS;
  // Players who left mid-round have been paid; their seats free up now.
  s.seats.forEach((seat, i) => {
    if (seat?.leaving) s.seats[i] = null;
  });
  if (seatedPlayers(s).length === 0) {
    resetRound(s);
    s.phase = 'waiting';
    s.nextRoundAt = null;
  }
}

/* ------------------------------------------------------------------------ */
/* Player decisions                                                          */
/* ------------------------------------------------------------------------ */

export interface BjLegal {
  canAct: boolean;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canSplit: boolean;
  /** Extra chips a double or split needs. */
  cost: number;
}

const NO_ACTIONS: BjLegal = { canAct: false, canHit: false, canStand: false, canDouble: false, canSplit: false, cost: 0 };

export function bjLegal(s: BjPublicState, seatIdx: number): BjLegal {
  if (s.phase !== 'playing' || seatIdx < 0 || s.toAct !== seatIdx) return NO_ACTIONS;
  const seat = s.seats[seatIdx];
  const hand = seat?.hands[s.handIdx];
  if (!seat || !hand || hand.done) return NO_ACTIONS;
  return {
    canAct: true,
    canHit: !hand.splitAces,
    canStand: true,
    canDouble: canDouble(hand),
    canSplit: canSplit(hand, seat.hands.length),
    cost: hand.bet,
  };
}

export function bjAct(s: BjState, fx: BjEffects, userId: string, action: BjAction, rng: Rng, now: number) {
  const i = bjSeatOf(s, userId);
  if (i < 0) throw new GameError('not_seated', 'You are not seated');
  const legal = bjLegal(s, i);
  if (!legal.canAct) throw new GameError('not_your_turn', "It's not your turn");
  const seat = s.seats[i]!;
  const hand = seat.hands[s.handIdx];
  seat.timeouts = 0;
  const label = seat.hands.length > 1 ? ` (hand ${s.handIdx + 1})` : '';

  switch (action) {
    case 'hit': {
      if (!legal.canHit) throw new GameError('bad_action', "You can't hit that hand");
      hand.cards.push(draw(s));
      const t = handTotal(hand.cards).total;
      if (t >= 21) hand.done = true;
      log(s, 'action', `${seat.name} hits${label}: ${t > 21 ? `bust with ${t}` : t}`, now);
      break;
    }
    case 'stand':
      hand.done = true;
      log(s, 'action', `${seat.name} stands on ${handTotal(hand.cards).total}${label}`, now);
      break;
    case 'double': {
      if (!legal.canDouble) throw new GameError('bad_action', 'You can only double on your first two cards');
      pay(fx, userId, -hand.bet);
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(draw(s));
      hand.done = true;
      log(s, 'action', `${seat.name} doubles${label}: ${handTotal(hand.cards).total}`, now);
      break;
    }
    case 'split': {
      if (!legal.canSplit) throw new GameError('bad_action', 'Only pairs can be split');
      pay(fx, userId, -hand.bet);
      const aces = hand.cards[0][0] === 'A';
      const second: BjHand = {
        cards: [hand.cards.pop()!],
        bet: hand.bet,
        doubled: false,
        split: true,
        splitAces: aces,
        done: false,
        outcome: null,
        payout: 0,
      };
      hand.split = true;
      hand.splitAces = aces;
      hand.cards.push(draw(s));
      second.cards.push(draw(s));
      seat.hands.splice(s.handIdx + 1, 0, second);
      for (const h of [hand, second]) if (aces || handTotal(h.cards).total === 21) h.done = true;
      log(s, 'action', `${seat.name} splits${aces ? ' aces' : ''}`, now);
      break;
    }
    default:
      throw new GameError('bad_action', 'Unknown action');
  }
  if (hand.done) advance(s, fx, rng, now);
  else {
    s.turnStartedAt = now;
    s.actionDeadline = now + s.config.turnSeconds * 1000;
  }
}

/* ------------------------------------------------------------------------ */
/* Timers                                                                    */
/* ------------------------------------------------------------------------ */

export function bjNextDeadline(s: Pick<BjPublicState, 'phase' | 'actionDeadline' | 'bettingDeadline' | 'nextRoundAt' | 'toAct'>): number | null {
  if (s.phase === 'playing' && s.toAct >= 0) return s.actionDeadline;
  if (s.phase === 'betting') return s.bettingDeadline;
  if (s.phase === 'settled') return s.nextRoundAt;
  return null;
}

/** Apply every timer that has run out. Returns true if anything changed. */
export function bjTick(s: BjState, fx: BjEffects, rng: Rng, now: number): boolean {
  let changed = false;
  for (let guard = 0; guard < 40; guard++) {
    if (s.phase === 'playing' && s.toAct >= 0 && s.actionDeadline != null && now >= s.actionDeadline) {
      const seat = s.seats[s.toAct]!;
      const hand = seat.hands[s.handIdx];
      hand.done = true;
      seat.timeouts += 1;
      log(s, 'action', `${seat.name} ran out of time and stands`, now);
      // Someone who keeps timing out stands on every remaining hand this round.
      if (seat.timeouts >= 2) for (const h of seat.hands) h.done = true;
      advance(s, fx, rng, now);
      changed = true;
      continue;
    }
    if (s.phase === 'betting' && s.bettingDeadline != null && now >= s.bettingDeadline) {
      if (!maybeDeal(s, fx, rng, now, true)) s.bettingDeadline = null;
      changed = true;
      continue;
    }
    if (s.phase === 'settled' && s.nextRoundAt != null && now >= s.nextRoundAt) {
      startRound(s, now, fx, rng);
      changed = true;
      continue;
    }
    break;
  }
  if (changed) s.updatedAt = now;
  return changed;
}

/**
 * Close the table (inactivity janitor): every chip on the table goes back to
 * its owner (pending bets and stakes of an unfinished round) and all seats clear.
 */
export function bjCloseTable(s: BjState, fx: BjEffects, now: number) {
  for (const seat of seatedPlayers(s)) pay(fx, seat.userId, chipsOnTable(seat));
  s.seats = s.seats.map(() => null);
  resetRound(s);
  s.phase = 'waiting';
  s.bettingDeadline = null;
  s.nextRoundAt = null;
  log(s, 'info', 'Table closed for inactivity', now);
}

export function bjUpdateIdentity(s: BjState, who: BjIdentity) {
  const i = bjSeatOf(s, who.userId);
  if (i < 0) return;
  Object.assign(s.seats[i]!, {
    name: who.name,
    avatar: who.avatar,
    color: who.color,
    frame: who.frame ?? null,
    backdrop: who.backdrop ?? null,
    nameFx: who.nameFx ?? null,
    club: who.club ?? null,
  });
}

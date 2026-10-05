/**
 * Poker bots. Every bot gets a random skill level and its own personality
 * (how tight, how aggressive, how often it bluffs), so a table of bots never
 * plays the same way twice and there is no reliably "free money" seat.
 *
 * Bots only use information a real player would have: their own hole cards,
 * the board, the pot and the betting. Hand strength comes from a Monte Carlo
 * simulation against random opponent hands; stronger bots run more
 * simulations (less noise) and reason about pot odds, position and pressure.
 */
import type { Rng } from './cards';
import { estimateEquity } from './fast';
import { getLegalActions, potTotal } from './engine';
import type { BotBrainData, EngineState, PlayerAction } from './types';
import { AVATARS, COLORS } from '../economy';

export type BotLevel = 'easy' | 'medium' | 'hard';

export type BotBrain = BotBrainData;

export const BOT_NAMES = [
  'Ace', 'Bluffington', 'Chip', 'Dealer Dan', 'Lucky Lou', 'River Rita', 'Pocket Pete', 'Big Slick',
  'Nuts Nina', 'Kicker Kai', 'Gutshot Gus', 'Flush Fiona', 'Rounder', 'Maverick', 'Queenie', 'Jackpot',
  'Snake Eyes', 'Cool Hand', 'Duchess', 'Ivy', 'Felt Felix', 'Shuffle', 'Monty', 'Stacks',
];

const rand = (rng: Rng) => rng(1_000_000) / 1_000_000;
const between = (rng: Rng, a: number, b: number) => a + (b - a) * rand(rng);

export function isBotId(userId: string): boolean {
  return userId.startsWith('bot-');
}

/** Random skill level (weighted toward capable bots) and personality. */
export function createBotBrain(rng: Rng): BotBrain {
  const roll = rand(rng);
  const level: BotLevel = roll < 0.25 ? 'easy' : roll < 0.65 ? 'medium' : 'hard';
  switch (level) {
    case 'easy':
      return { level, tight: between(rng, 0.1, 0.4), aggr: between(rng, 0.1, 0.4), bluff: between(rng, 0.02, 0.08), iters: 60 };
    case 'medium':
      return { level, tight: between(rng, 0.35, 0.65), aggr: between(rng, 0.35, 0.65), bluff: between(rng, 0.06, 0.14), iters: 160 };
    default:
      return { level, tight: between(rng, 0.5, 0.75), aggr: between(rng, 0.55, 0.9), bluff: between(rng, 0.1, 0.2), iters: 320 };
  }
}

export function createBotIdentity(rng: Rng, takenNames: Set<string>) {
  const free = BOT_NAMES.filter((n) => !takenNames.has(n));
  const pool = free.length ? free : BOT_NAMES;
  let id = 'bot-';
  for (let i = 0; i < 10; i++) id += 'abcdefghijklmnopqrstuvwxyz0123456789'[rng(36)];
  return {
    userId: id,
    name: pool[rng(pool.length)],
    avatar: AVATARS[rng(AVATARS.length)],
    color: COLORS[rng(COLORS.length)],
  };
}

/** How long a bot "thinks" before acting (deterministic per decision so retries agree). */
export function botThinkMs(s: EngineState, seat: number, humansLive: boolean): number {
  if (!humansLive) return 450; // nobody human left in the hand: keep it moving
  const x = (s.logSeq * 7919 + seat * 104729 + s.handNo * 31) % 1600;
  return 900 + x;
}

/**
 * Pick an action for the bot in `seatIndex`. Always returns a legal action for
 * the current state (callers still validate through the engine).
 */
export function decideBotAction(s: EngineState, seatIndex: number, brain: BotBrain, rng: Rng): PlayerAction {
  const legal = getLegalActions(s, seatIndex);
  if (!legal.canAct) return { type: 'check' };
  const seat = s.seats[seatIndex]!;
  const hole = s.hole[String(seatIndex)] ?? [];
  const passive: PlayerAction = legal.canCheck ? { type: 'check' } : { type: 'fold' };
  if (hole.length !== 2) return passive;

  const bb = s.config.bigBlind;
  const pot = potTotal(s);
  const toCall = legal.callAmount;
  const opponents = s.seats.filter((x, i) => x && i !== seatIndex && x.inHand && !x.folded).length;
  const preflop = s.phase === 'preflop';
  const r = () => rand(rng);

  // --- Hand strength ------------------------------------------------------
  let eq = estimateEquity(hole, s.board, Math.max(1, Math.min(opponents, 5)), brain.iters, rng);
  if (brain.level === 'easy') eq += (r() - 0.5) * 0.24;
  else if (brain.level === 'medium') eq += (r() - 0.5) * 0.1;
  // Better bots respect big bets: a large bet usually means a strong hand.
  const pressure = toCall / Math.max(1, pot - toCall);
  if (brain.level !== 'easy') eq *= 1 - (brain.level === 'hard' ? 0.14 : 0.08) * Math.min(1.5, pressure);
  eq = Math.max(0, Math.min(1, eq));
  const fair = 1 / (opponents + 1);
  const rel = eq / fair; // 1 = an average hand against this many opponents

  // Late position (on or right before the button) plays a little looser.
  const n = s.seats.length;
  const fromButton = (seatIndex - s.dealer + n) % n;
  const late = fromButton === 0 || fromButton >= n - 1;

  // --- Bet sizing ---------------------------------------------------------
  const sized = (fraction: number): PlayerAction => {
    let target = legal.isBet ? fraction * pot : s.currentBet + fraction * (pot + toCall);
    target = Math.round(target / bb) * bb;
    target = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, target));
    // Committing most of the stack anyway: just shove.
    if (target >= legal.maxRaiseTo * 0.8) return { type: 'allin' };
    return { type: legal.isBet ? 'bet' : 'raise', amount: target };
  };

  // Rookie mistakes: occasionally does something odd.
  if (brain.level === 'easy' && r() < 0.06) {
    if (legal.canRaise && r() < 0.35) return sized(0.4 + r() * 0.6);
    return legal.canCheck ? { type: 'check' } : { type: 'call' };
  }

  const tightAdj = (brain.tight - 0.5) * 0.45;
  const valueBar = { easy: 1.75, medium: 1.45, hard: 1.3 }[brain.level] + tightAdj - (late ? 0.08 : 0);

  // --- Nobody has bet: check or bet ----------------------------------------
  if (legal.canCheck) {
    if (legal.canRaise && rel >= valueBar && r() < 0.4 + brain.aggr * 0.55) {
      return sized(0.45 + brain.aggr * 0.35 + (rel > 2.2 ? 0.2 : 0) + r() * 0.15);
    }
    const bluffChance = brain.bluff * (late ? 1.6 : 1) * (opponents <= 2 ? 1 : 0.35) * (preflop ? 0.5 : 1);
    if (legal.canRaise && r() < bluffChance) return sized(0.5 + r() * 0.3);
    return { type: 'check' };
  }

  // --- Facing a bet -------------------------------------------------------
  const potOdds = toCall / (pot + toCall);
  let callBar = potOdds * { easy: 0.72, medium: 0.95, hard: 1.03 }[brain.level] * (1 + tightAdj * 0.6);
  // Drawing hands get implied odds on early streets.
  if (!preflop && s.phase !== 'river' && brain.level !== 'easy') callBar *= 0.9;
  // Pre-flop, tight bots fold weak hands to raises even with a decent price.
  if (preflop && toCall > bb && rel < 0.8 + brain.tight * 0.55) callBar = Math.max(callBar, 0.95);

  const raiseBar = valueBar + 0.3 + (toCall > pot * 0.6 ? 0.35 : 0);
  if (legal.canRaise && rel >= raiseBar && r() < 0.3 + brain.aggr * 0.6) {
    return sized(0.65 + brain.aggr * 0.5 + r() * 0.2);
  }
  if (eq >= callBar) return { type: 'call' };
  // Semi-bluff raises with live draws from stronger bots.
  if (legal.canRaise && brain.level === 'hard' && !preflop && s.phase !== 'river' && eq > 0.28 && r() < brain.bluff) {
    return sized(0.7 + r() * 0.3);
  }
  // Calling stations call a bit too often.
  if (brain.level === 'easy' && toCall <= Math.max(bb * 3, pot * 0.25) && r() < 0.35) return { type: 'call' };
  // Short stacks don't fold tiny amounts.
  if (toCall <= bb && seat.stack > toCall && r() < 0.3) return { type: 'call' };
  return { type: 'fold' };
}

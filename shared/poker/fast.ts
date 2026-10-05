/**
 * Allocation-light 7-card scorer used for bot equity simulations. It returns
 * exactly the same score as `evaluateHand(...).score` (verified by tests) but
 * works directly on integer cards without enumerating 5-card combinations.
 */
import { freshDeck, type Card, type Rng } from './cards';
import { encode } from './evaluator';

const RANK_INDEX: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
const SUIT_INDEX: Record<string, number> = { c: 0, d: 1, h: 2, s: 3 };

/** Card as an integer: rank (2..14) * 4 + suit (0..3). */
export function cardInt(card: Card): number {
  return RANK_INDEX[card[0]] * 4 + SUIT_INDEX[card[1]];
}

function straightHigh(mask: number): number {
  for (let high = 14; high >= 6; high--) {
    const need = 0b11111 << (high - 4);
    if ((mask & need) === need) return high;
  }
  // Wheel: A-2-3-4-5
  const wheel = (1 << 14) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);
  return (mask & wheel) === wheel ? 5 : 0;
}

function topRanks(mask: number, count: number, exclude1 = 0, exclude2 = 0): number[] {
  const out: number[] = [];
  for (let r = 14; r >= 2 && out.length < count; r--) {
    if (r === exclude1 || r === exclude2) continue;
    if (mask & (1 << r)) out.push(r);
  }
  return out;
}

const counts = new Int8Array(15);

/** Score of the best 5-card hand among 5–7 integer cards. */
export function score7(cards: number[]): number {
  counts.fill(0);
  const suitCount = [0, 0, 0, 0];
  const suitMask = [0, 0, 0, 0];
  let rankMask = 0;
  for (const c of cards) {
    const r = c >> 2;
    const s = c & 3;
    counts[r]++;
    suitCount[s]++;
    suitMask[s] |= 1 << r;
    rankMask |= 1 << r;
  }
  let flush = -1;
  for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flush = s;
  if (flush >= 0) {
    const sf = straightHigh(suitMask[flush]);
    if (sf) return encode(sf === 14 ? 9 : 8, [sf]);
  }
  let quad = 0;
  let trip1 = 0;
  let trip2 = 0;
  let pair1 = 0;
  let pair2 = 0;
  for (let r = 14; r >= 2; r--) {
    const n = counts[r];
    if (n === 4) quad = r;
    else if (n === 3) {
      if (!trip1) trip1 = r;
      else if (!trip2) trip2 = r;
    } else if (n === 2) {
      if (!pair1) pair1 = r;
      else if (!pair2) pair2 = r;
    }
  }
  if (quad) return encode(7, [quad, topRanks(rankMask, 1, quad)[0]]);
  if (trip1 && (trip2 || pair1)) return encode(6, [trip1, Math.max(trip2, pair1)]);
  if (flush >= 0) return encode(5, topRanks(suitMask[flush], 5));
  const st = straightHigh(rankMask);
  if (st) return encode(4, [st]);
  if (trip1) return encode(3, [trip1, ...topRanks(rankMask, 2, trip1)]);
  if (pair1 && pair2) return encode(2, [pair1, pair2, topRanks(rankMask, 1, pair1, pair2)[0]]);
  if (pair1) return encode(1, [pair1, ...topRanks(rankMask, 3, pair1)]);
  return encode(0, topRanks(rankMask, 5));
}

/**
 * Monte Carlo probability of winning (ties split) against `opponents` random
 * hands, given our hole cards and the current board.
 */
export function estimateEquity(hole: Card[], board: Card[], opponents: number, iterations: number, rng: Rng): number {
  const known = new Set([...hole, ...board]);
  const deck = freshDeck()
    .filter((c) => !known.has(c))
    .map(cardInt);
  const mine = hole.map(cardInt);
  const shared = board.map(cardInt);
  const need = 5 - shared.length;
  const take = need + opponents * 2;
  const hand = new Array<number>(7);
  let wins = 0;
  for (let it = 0; it < iterations; it++) {
    for (let k = 0; k < take; k++) {
      const j = k + rng(deck.length - k);
      const tmp = deck[k];
      deck[k] = deck[j];
      deck[j] = tmp;
    }
    const boardCards = need ? shared.concat(deck.slice(0, need)) : shared;
    hand.length = 0;
    hand.push(mine[0], mine[1], ...boardCards);
    const my = score7(hand);
    let best = 0;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      hand.length = 0;
      hand.push(deck[need + o * 2], deck[need + o * 2 + 1], ...boardCards);
      const sc = score7(hand);
      if (sc > best) {
        best = sc;
        ties = sc === my ? 1 : 0;
      } else if (sc === best && sc === my) ties++;
    }
    if (my > best) wins += 1;
    else if (my === best) wins += 1 / (ties + 1);
  }
  return wins / iterations;
}

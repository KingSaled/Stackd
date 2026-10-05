/**
 * Deterministic Texas Hold'em hand evaluator.
 *
 * Every 5-card hand maps to a single integer score: higher score = better hand,
 * equal scores = exact tie (kickers included). For 6 or 7 cards we evaluate all
 * C(n,5) combinations and keep the best, which is simple, exhaustive and fast
 * enough for real-time play (21 combinations for 7 cards).
 */
import { RANK_NAMES, RANK_PLURALS, rankValue, suitOf, type Card } from './cards';

export const HAND_CATEGORIES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
  'Royal Flush',
] as const;

export interface HandEval {
  /** Comparable score: higher wins, equal ties. */
  score: number;
  /** 0 (high card) .. 9 (royal flush). */
  category: number;
  /** Short category name, e.g. "Full House". */
  name: string;
  /** Descriptive name, e.g. "Full House, Kings full of Sevens". */
  description: string;
  /** The five cards that make the hand. */
  best: Card[];
}

const BASE = 16;
const CATEGORY_WEIGHT = BASE ** 5;

function encode(category: number, ranks: number[]): number {
  let score = category * CATEGORY_WEIGHT;
  for (let i = 0; i < 5; i++) score += (ranks[i] ?? 0) * BASE ** (4 - i);
  return score;
}

interface Scored {
  category: number;
  ranks: number[];
}

function score5(cards: Card[]): Scored {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const flush = suits.every((s) => s === suits[0]);

  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const unique = [...counts.keys()].sort((a, b) => b - a);

  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) straightHigh = 5; // wheel
  }

  if (straightHigh && flush) return { category: straightHigh === 14 ? 9 : 8, ranks: [straightHigh] };
  if (groups[0][1] === 4) return { category: 7, ranks: [groups[0][0], groups[1][0]] };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { category: 6, ranks: [groups[0][0], groups[1][0]] };
  if (flush) return { category: 5, ranks: values };
  if (straightHigh) return { category: 4, ranks: [straightHigh] };
  if (groups[0][1] === 3) return { category: 3, ranks: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2 && groups[1][1] === 2)
    return { category: 2, ranks: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2)
    return { category: 1, ranks: [groups[0][0], groups[1][0], groups[2][0], groups[3][0]] };
  return { category: 0, ranks: values };
}

function describe(category: number, ranks: number[]): string {
  const n = (r: number) => RANK_NAMES[r];
  const p = (r: number) => RANK_PLURALS[r];
  switch (category) {
    case 9:
      return 'Royal Flush';
    case 8:
      return `Straight Flush, ${n(ranks[0])} High`;
    case 7:
      return `Four of a Kind, ${p(ranks[0])}`;
    case 6:
      return `Full House, ${p(ranks[0])} full of ${p(ranks[1])}`;
    case 5:
      return `Flush, ${n(ranks[0])} High`;
    case 4:
      return `Straight, ${n(ranks[0])} High`;
    case 3:
      return `Three of a Kind, ${p(ranks[0])}`;
    case 2:
      return `Two Pair, ${p(ranks[0])} and ${p(ranks[1])}`;
    case 1:
      return `Pair of ${p(ranks[0])}`;
    default:
      return `${n(ranks[0])} High`;
  }
}

/** Evaluate exactly five cards. */
export function evaluate5(cards: Card[]): HandEval {
  if (cards.length !== 5) throw new Error('evaluate5 requires exactly 5 cards');
  const { category, ranks } = score5(cards);
  return {
    score: encode(category, ranks),
    category,
    name: HAND_CATEGORIES[category],
    description: describe(category, ranks),
    best: cards.slice(),
  };
}

/** Evaluate the best 5-card hand out of 5, 6 or 7 cards. */
export function evaluateHand(cards: Card[]): HandEval {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluateHand requires 5-7 cards, got ${cards.length}`);
  }
  if (new Set(cards).size !== cards.length) throw new Error('Duplicate cards in hand');
  let best: HandEval | null = null;
  const n = cards.length;
  const pick: Card[] = new Array(5);
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            pick[0] = cards[a];
            pick[1] = cards[b];
            pick[2] = cards[c];
            pick[3] = cards[d];
            pick[4] = cards[e];
            const { category, ranks } = score5(pick);
            const score = encode(category, ranks);
            if (!best || score > best.score) {
              best = {
                score,
                category,
                name: HAND_CATEGORIES[category],
                description: describe(category, ranks),
                best: pick.slice(),
              };
            }
          }
  return best!;
}

/**
 * Friendly description of what a player currently holds, usable with fewer than
 * five known cards (e.g. pre-flop). Returns null when nothing can be said.
 */
export function describeHolding(cards: Card[]): { name: string; category: number } | null {
  if (cards.length >= 5) {
    const e = evaluateHand(cards);
    return { name: e.description, category: e.category };
  }
  if (cards.length === 0) return null;
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (groups[0][1] === 4) return { name: `Four of a Kind, ${RANK_PLURALS[groups[0][0]]}`, category: 7 };
  if (groups[0][1] === 3) return { name: `Three of a Kind, ${RANK_PLURALS[groups[0][0]]}`, category: 3 };
  if (groups[0][1] === 2 && groups[1]?.[1] === 2)
    return { name: `Two Pair, ${RANK_PLURALS[groups[0][0]]} and ${RANK_PLURALS[groups[1][0]]}`, category: 2 };
  if (groups[0][1] === 2) return { name: `Pair of ${RANK_PLURALS[groups[0][0]]}`, category: 1 };
  return { name: `${RANK_NAMES[values[0]]} High`, category: 0 };
}

/** Compare two hands: positive if a beats b, negative if b beats a, 0 for a tie. */
export function compareHands(a: Card[], b: Card[]): number {
  return evaluateHand(a).score - evaluateHand(b).score;
}

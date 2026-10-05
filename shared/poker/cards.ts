/**
 * Card primitives. A card is a two-character string: rank + suit, e.g. "As", "Td", "9c".
 */

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export type Card = string;

export const RANK_NAMES: Record<number, string> = {
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
  14: 'Ace',
};

export const RANK_PLURALS: Record<number, string> = {
  2: 'Twos',
  3: 'Threes',
  4: 'Fours',
  5: 'Fives',
  6: 'Sixes',
  7: 'Sevens',
  8: 'Eights',
  9: 'Nines',
  10: 'Tens',
  11: 'Jacks',
  12: 'Queens',
  13: 'Kings',
  14: 'Aces',
};

export const SUIT_SYMBOLS: Record<string, string> = {
  c: '♣',
  d: '♦',
  h: '♥',
  s: '♠',
};

/** Rank value 2..14 (ace high). */
export function rankValue(card: Card): number {
  const v = RANKS.indexOf(card[0]);
  if (v < 0) throw new Error(`Invalid card rank: ${card}`);
  return v + 2;
}

export function suitOf(card: Card): string {
  const s = card[1];
  if (!SUITS.includes(s)) throw new Error(`Invalid card suit: ${card}`);
  return s;
}

export function isValidCard(card: unknown): card is Card {
  return (
    typeof card === 'string' &&
    card.length === 2 &&
    RANKS.includes(card[0]) &&
    SUITS.includes(card[1])
  );
}

/** Display label for a rank character ("T" renders as "10"). */
export function rankLabel(card: Card): string {
  return card[0] === 'T' ? '10' : card[0];
}

export function cardToText(card: Card): string {
  return `${rankLabel(card)}${SUIT_SYMBOLS[card[1]] ?? card[1]}`;
}

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

/** Random integer in [0, n). */
export type Rng = (n: number) => number;

/** Unbiased Fisher–Yates shuffle using the supplied integer RNG. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** Deterministic RNG (mulberry32) for tests and replays. */
export function seededRng(seed: number): Rng {
  let t = seed >>> 0;
  return (n: number) => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    const r = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * n);
  };
}

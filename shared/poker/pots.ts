import type { Pot, Seat } from './types';

/**
 * Build the main pot and side pots from each player's total commitment this hand.
 *
 * Pots are layered at every distinct commitment level of players still in the
 * hand (not folded). Folded players' chips are dead money that feeds the pots
 * up to the level they reached, but they are never eligible to win.
 */
export function computePots(seats: (Seat | null)[], amountOf: (s: Seat) => number = (s) => s.committed): Pot[] {
  const contributors: { idx: number; amount: number; live: boolean }[] = [];
  seats.forEach((s, idx) => {
    if (!s || !s.inHand) return;
    const amount = amountOf(s);
    if (amount <= 0 && s.folded) return;
    contributors.push({ idx, amount: Math.max(0, amount), live: !s.folded });
  });
  const live = contributors.filter((c) => c.live);
  if (live.length === 0) return [];

  const levels = [...new Set(live.map((c) => c.amount))].filter((l) => l > 0).sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of contributors) amount += Math.min(c.amount, level) - Math.min(c.amount, prev);
    const eligible = live.filter((c) => c.amount >= level).map((c) => c.idx);
    if (amount > 0) {
      const last = pots[pots.length - 1];
      if (last && sameMembers(last.eligible, eligible)) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  // Dead money above the highest live commitment (only possible in unusual
  // stand-up / fold sequences) goes into the last pot.
  let leftover = 0;
  for (const c of contributors) leftover += Math.max(0, c.amount - prev);
  if (leftover > 0) {
    if (pots.length) pots[pots.length - 1].amount += leftover;
    else pots.push({ amount: leftover, eligible: live.map((c) => c.idx) });
  }
  return pots;
}

function sameMembers(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

export function totalPot(pots: Pot[]): number {
  return pots.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Split `amount` between winners. Odd chips go one at a time to the winners
 * closest to the left of the dealer button (standard house rule).
 */
export function splitPot(amount: number, winners: number[], dealer: number, seatCount: number): Map<number, number> {
  const order = winners
    .slice()
    .sort((a, b) => ((a - dealer - 1 + seatCount) % seatCount) - ((b - dealer - 1 + seatCount) % seatCount));
  const share = Math.floor(amount / order.length);
  let remainder = amount - share * order.length;
  const result = new Map<number, number>();
  for (const w of order) {
    let v = share;
    if (remainder > 0) {
      v += 1;
      remainder -= 1;
    }
    result.set(w, v);
  }
  return result;
}

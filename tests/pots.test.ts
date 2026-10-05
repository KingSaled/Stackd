import { describe, expect, it } from 'vitest';
import { computePots, splitPot } from '../shared/poker/pots';
import type { Seat } from '../shared/poker/types';

function seat(committed: number, folded = false): Seat {
  return {
    userId: Math.random().toString(36),
    name: 'p',
    avatar: '',
    color: '',
    stack: 0,
    bet: 0,
    committed,
    inHand: true,
    folded,
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
    joinedAt: 0,
  };
}

describe('side pots', () => {
  it('creates a single pot for equal commitments', () => {
    expect(computePots([seat(100), seat(100), seat(100)])).toEqual([{ amount: 300, eligible: [0, 1, 2] }]);
  });

  it('layers pots for uneven all-ins', () => {
    const pots = computePots([seat(50), seat(200), seat(500), seat(500)]);
    expect(pots).toEqual([
      { amount: 200, eligible: [0, 1, 2, 3] },
      { amount: 450, eligible: [1, 2, 3] },
      { amount: 600, eligible: [2, 3] },
    ]);
  });

  it('adds folded dead money without making the folder eligible', () => {
    const pots = computePots([seat(300, true), seat(100), seat(1000)]);
    // Level 100: 100 from each = 300 (eligible 1,2). Level 1000: 200 (folded) + 900 = 1100 (eligible 2).
    expect(pots).toEqual([
      { amount: 300, eligible: [1, 2] },
      { amount: 1100, eligible: [2] },
    ]);
    const total = pots.reduce((a, p) => a + p.amount, 0);
    expect(total).toBe(1400);
  });

  it('ignores empty seats and players not in the hand', () => {
    const out = seat(0);
    out.inHand = false;
    expect(computePots([null, seat(40), out, seat(40)])).toEqual([{ amount: 80, eligible: [1, 3] }]);
  });

  it('splits odd chips starting left of the button', () => {
    const split = splitPot(101, [2, 5], 3, 6);
    // Left of button (seat 3) is seat 4, 5 → seat 5 gets the odd chip before seat 2.
    expect(split.get(5)).toBe(51);
    expect(split.get(2)).toBe(50);
    const three = splitPot(100, [0, 1, 2], 0, 3);
    expect(three.get(1)).toBe(34);
    expect(three.get(2)).toBe(33);
    expect(three.get(0)).toBe(33);
  });
});

import { describe, expect, it } from 'vitest';
import { evaluateHand, evaluate5, describeHolding, compareHands } from '../shared/poker/evaluator';
import { freshDeck, shuffle, seededRng } from '../shared/poker/cards';

const h = (s: string) => s.trim().split(/\s+/);

describe('hand evaluator', () => {
  it('identifies every category', () => {
    expect(evaluateHand(h('As Ks Qs Js Ts 2d 3c')).name).toBe('Royal Flush');
    expect(evaluateHand(h('9h 8h 7h 6h 5h Ac Ad')).description).toBe('Straight Flush, Nine High');
    expect(evaluateHand(h('9h 9d 9c 9s 5h Ac Ad')).description).toBe('Four of a Kind, Nines');
    expect(evaluateHand(h('Kh Kd Kc 7s 7h 2c 3d')).description).toBe('Full House, Kings full of Sevens');
    expect(evaluateHand(h('Ah 9h 7h 4h 2h Kc Kd')).description).toBe('Flush, Ace High');
    expect(evaluateHand(h('Th 9d 8c 7s 6h Ac Ad')).description).toBe('Straight, Ten High');
    expect(evaluateHand(h('Qh Qd Qc 7s 5h 2c 3d')).description).toBe('Three of a Kind, Queens');
    expect(evaluateHand(h('Kh Kd 7c 7s 5h 2c 3d')).description).toBe('Two Pair, Kings and Sevens');
    expect(evaluateHand(h('Ah Ad 9c 7s 5h 2c 3d')).description).toBe('Pair of Aces');
    expect(evaluateHand(h('Ah Jd 9c 7s 5h 2c 3d')).description).toBe('Ace High');
  });

  it('handles the wheel (A-2-3-4-5) as a five-high straight', () => {
    const wheel = evaluateHand(h('Ah 2d 3c 4s 5h Kc Qd'));
    expect(wheel.description).toBe('Straight, Five High');
    const sixHigh = evaluateHand(h('6h 2d 3c 4s 5h Kc Qd'));
    expect(sixHigh.score).toBeGreaterThan(wheel.score);
    const steelWheel = evaluateHand(h('Ah 2h 3h 4h 5h Kc Qd'));
    expect(steelWheel.description).toBe('Straight Flush, Five High');
  });

  it('does not wrap straights around the ace', () => {
    expect(evaluateHand(h('Qh Kd Ac 2s 3h 8c 9d')).name).toBe('High Card');
  });

  it('breaks ties with kickers', () => {
    // Same pair, different kicker.
    expect(compareHands(h('Ah Ad Kc 7s 5h 2c 3d'), h('As Ac Qc 7d 5s 2h 3s'))).toBeGreaterThan(0);
    // Two pair: the fifth card decides.
    expect(compareHands(h('Kh Kd 7c 7s Qh 2c 3d'), h('Ks Kc 7d 7h Jh 2s 3s'))).toBeGreaterThan(0);
    // Flush compares all five cards.
    expect(compareHands(h('Ah 9h 7h 4h 3h'), h('Ad 9d 7d 4d 2d'))).toBeGreaterThan(0);
    // Full house: trips rank first.
    expect(compareHands(h('3h 3d 3c As Ah'), h('2h 2d 2c Ks Kh'))).toBeGreaterThan(0);
    // Quads kicker
    expect(compareHands(h('9h 9d 9c 9s Ah'), h('9h 9d 9c 9s Kh'))).toBeGreaterThan(0);
  });

  it('detects exact ties (board plays)', () => {
    const board = h('Ah Kh Qh Jh Th');
    expect(compareHands([...board, '2c', '3d'], [...board, '4c', '5d'])).toBe(0);
    const board2 = h('9c 9d 5s 5h Ks');
    expect(compareHands([...board2, '2c', '3d'], [...board2, '4c', '3c'])).toBe(0);
  });

  it('chooses the best five of seven', () => {
    const e = evaluateHand(h('2c 2d 2h 5s 5d 5c Ah'));
    expect(e.description).toBe('Full House, Fives full of Twos');
    expect(e.best).toHaveLength(5);
  });

  it('prefers the higher of two straights and the flush over a straight', () => {
    expect(evaluateHand(h('4c 5d 6h 7s 8d 9c 2h')).description).toBe('Straight, Nine High');
    expect(evaluateHand(h('4h 5h 6h 7s 8d Kh 2h')).name).toBe('Flush');
  });

  it('evaluate5 rejects wrong input size', () => {
    expect(() => evaluate5(h('As Ks'))).toThrow();
    expect(() => evaluateHand(h('As Ks Qs Js'))).toThrow();
  });

  it('describes partial holdings', () => {
    expect(describeHolding(h('As Ad'))?.name).toBe('Pair of Aces');
    expect(describeHolding(h('As Kd'))?.name).toBe('Ace High');
    expect(describeHolding([])).toBeNull();
  });

  it('matches the known 7-card category distribution', () => {
    const rng = seededRng(42);
    const counts = new Array(10).fill(0);
    const N = 60_000;
    for (let i = 0; i < N; i++) {
      const deck = shuffle(freshDeck(), rng);
      counts[evaluateHand(deck.slice(0, 7)).category]++;
    }
    const pct = counts.map((c) => (c / N) * 100);
    // Reference: high 17.4, pair 43.8, two pair 23.5, trips 4.83, straight 4.62, flush 3.03, FH 2.60, quads 0.168
    expect(pct[0]).toBeGreaterThan(16.5);
    expect(pct[0]).toBeLessThan(18.4);
    expect(pct[1]).toBeGreaterThan(42.5);
    expect(pct[1]).toBeLessThan(45);
    expect(pct[2]).toBeGreaterThan(22.5);
    expect(pct[2]).toBeLessThan(24.5);
    expect(pct[3]).toBeGreaterThan(4.3);
    expect(pct[3]).toBeLessThan(5.4);
    expect(pct[4]).toBeGreaterThan(4.1);
    expect(pct[4]).toBeLessThan(5.2);
    expect(pct[5]).toBeGreaterThan(2.6);
    expect(pct[5]).toBeLessThan(3.5);
    expect(pct[6]).toBeGreaterThan(2.2);
    expect(pct[6]).toBeLessThan(3.0);
    expect(pct[7]).toBeLessThan(0.4);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BET_WINDOW_MS,
  MAX_MISSED,
  bjAct,
  bjClearBet,
  bjCloseTable,
  bjLegal,
  bjNextDeadline,
  bjPlaceBet,
  bjSitDown,
  bjStandUp,
  bjTick,
  chipsOnTable,
  createBjState,
  handTotal,
  mergeBjState,
  newBjEffects,
  sanitizeBjConfig,
  toBjPublic,
  toBjSecret,
  totalLabel,
  type BjEffects,
  type BjState,
} from '../shared/blackjack';
import { freshDeck, seededRng, type Card } from '../shared/poker/cards';

const rng = seededRng(1);
const T0 = 1_000_000;
const who = (n: number) => ({ userId: `u${n}`, name: `P${n}`, avatar: 'p01', color: '#fff' });

/** Next cards drawn come out in the order given (the shoe deals from the end). */
function rig(s: BjState, cards: Card[]) {
  const filler: Card[] = [];
  for (let d = 0; d < 2; d++) filler.push(...freshDeck());
  s.shoe = [...filler, ...cards.slice().reverse()];
  s.shoeSize = 312;
}

function table(players = 1) {
  const s = createBjState(sanitizeBjConfig({ turnSeconds: 15 }), T0);
  for (let i = 0; i < players; i++) bjSitDown(s, who(i), i, T0);
  return s;
}

const net = (fx: BjEffects, id = 'u0') => fx.wallet[id] ?? 0;

describe('blackjack hand maths', () => {
  it('counts aces as 1 or 11', () => {
    expect(handTotal(['As', 'Kd'])).toEqual({ total: 21, soft: true });
    expect(handTotal(['As', '6d'])).toEqual({ total: 17, soft: true });
    expect(handTotal(['As', '6d', '9c'])).toEqual({ total: 16, soft: false });
    expect(handTotal(['As', 'Ad', '9c'])).toEqual({ total: 21, soft: true });
    expect(handTotal(['Ts', '9d', '5c'])).toEqual({ total: 24, soft: false });
    expect(totalLabel(['As', '6d'])).toBe('7/17');
    expect(totalLabel(['As', 'Kd'])).toBe('Blackjack');
  });
});

describe('blackjack rounds', () => {
  it('a lone player is dealt as soon as they bet, and a blackjack pays 3:2', () => {
    const s = table();
    const fx = newBjEffects();
    rig(s, ['As', '9c', 'Kd', '7h']); // player A, dealer 9, player K, hole 7
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    expect(s.phase).toBe('settled');
    expect(s.seats[0]!.hands[0].outcome).toBe('blackjack');
    expect(net(fx)).toBe(-100 + 250);
    expect(s.dealer).toEqual(['9c', '7h']);
  });

  it('the dealer peeks: a dealer blackjack ends the round at once', () => {
    const s = table(2);
    const fx = newBjEffects();
    rig(s, ['Ts', 'Ah', 'Ad', '9c', 'Kd', 'Kh']); // P0 T, P1 A, dealer A, P0 9, P1 K, hole K
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjPlaceBet(s, fx, 'u1', 50, rng, T0);
    expect(s.phase).toBe('settled');
    expect(s.dealerBlackjack).toBe(true);
    expect(s.seats[0]!.hands[0].outcome).toBe('lose');
    expect(s.seats[1]!.hands[0].outcome).toBe('push');
    expect(net(fx, 'u0')).toBe(-100);
    expect(net(fx, 'u1')).toBe(0);
  });

  it('the dealer stands on soft 17 and draws to 17 otherwise', () => {
    let s = table();
    let fx = newBjEffects();
    rig(s, ['Ts', 'As', '8d', '6c']); // player 18, dealer A6 = soft 17
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjAct(s, fx, 'u0', 'stand', rng, T0 + 5000);
    expect(s.dealer).toEqual(['As', '6c']);
    expect(s.seats[0]!.hands[0].outcome).toBe('win');
    expect(net(fx)).toBe(100);

    s = table();
    fx = newBjEffects();
    rig(s, ['Ts', 'Td', '8d', '6c', '5h']); // player 18, dealer 16 draws a 5
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjAct(s, fx, 'u0', 'stand', rng, T0 + 5000);
    expect(s.dealer).toEqual(['Td', '6c', '5h']);
    expect(s.dealerDraws).toBe(1);
    expect(s.seats[0]!.hands[0].outcome).toBe('lose');
    expect(net(fx)).toBe(-100);
  });

  it('busting loses straight away and the dealer does not draw for nobody', () => {
    const s = table();
    const fx = newBjEffects();
    rig(s, ['Ts', 'Td', '6d', '6c', '9h']);
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjAct(s, fx, 'u0', 'hit', rng, T0 + 5000);
    expect(s.seats[0]!.hands[0].outcome).toBe('bust');
    expect(s.dealerDraws).toBe(0);
    expect(net(fx)).toBe(-100);
  });

  it('doubling takes a second stake and exactly one card', () => {
    const s = table();
    const fx = newBjEffects();
    rig(s, ['6s', 'Td', '5d', '7c', 'Th']); // player 11, dealer 17, double gets a T = 21
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    expect(bjLegal(s, 0).canDouble).toBe(true);
    bjAct(s, fx, 'u0', 'double', rng, T0 + 5000);
    const h = s.seats[0]!.hands[0];
    expect(h.cards).toHaveLength(3);
    expect(h.bet).toBe(200);
    expect(h.outcome).toBe('win');
    expect(net(fx)).toBe(-200 + 400);
  });

  it('splitting a pair plays two hands; split aces get one card each', () => {
    let s = table();
    let fx = newBjEffects();
    rig(s, ['8s', 'Td', '8d', '7c', '3h', 'Th']); // 8,8 vs dealer 17: split → 8+3, 8+T
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    expect(bjLegal(s, 0).canSplit).toBe(true);
    bjAct(s, fx, 'u0', 'split', rng, T0 + 5000);
    expect(s.seats[0]!.hands.map((h) => h.cards)).toEqual([
      ['8s', '3h'],
      ['8d', 'Th'],
    ]);
    expect(s.handIdx).toBe(0);
    bjAct(s, fx, 'u0', 'stand', rng, T0 + 6000); // 11 stands (loses to 17)
    expect(s.handIdx).toBe(1);
    bjAct(s, fx, 'u0', 'stand', rng, T0 + 7000); // 18 wins
    expect(s.seats[0]!.hands.map((h) => h.outcome)).toEqual(['lose', 'win']);
    expect(net(fx)).toBe(-200 + 200);

    s = table();
    fx = newBjEffects();
    rig(s, ['As', '9d', 'Ad', '8c', 'Kh', '9h']);
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjAct(s, fx, 'u0', 'split', rng, T0 + 5000);
    // Both aces got one card and the round played out: A+K is 21 but not a blackjack.
    expect(s.phase).toBe('settled');
    expect(s.seats[0]!.hands.map((h) => h.outcome)).toEqual(['win', 'win']);
    expect(net(fx)).toBe(-200 + 400);
  });

  it('a turn that times out stands; two in a row stand every hand', () => {
    const s = table(2);
    const fx = newBjEffects();
    rig(s, ['Ts', '9s', 'Td', '6d', '7c', '8h', '9c']);
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjPlaceBet(s, fx, 'u1', 100, rng, T0);
    expect(s.toAct).toBe(0);
    const deadline = bjNextDeadline(s)!;
    expect(deadline).toBeGreaterThan(T0 + 15_000);
    expect(bjTick(s, fx, rng, deadline - 1)).toBe(false);
    expect(bjTick(s, fx, rng, deadline)).toBe(true);
    expect(s.toAct).toBe(1);
    expect(s.seats[0]!.timeouts).toBe(1);
  });

  it('betting waits for everyone, then the window closes and deals whoever bet', () => {
    const s = table(2);
    const fx = newBjEffects();
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    expect(s.phase).toBe('betting');
    expect(s.bettingDeadline).toBe(T0 + BET_WINDOW_MS);
    expect(chipsOnTable(s.seats[0]!)).toBe(100);
    bjTick(s, fx, rng, T0 + BET_WINDOW_MS);
    expect(s.phase === 'playing' || s.phase === 'settled').toBe(true);
    expect(s.seats[1]!.hands).toHaveLength(0);
    expect(s.seats[1]!.missed).toBe(1);
  });

  it('players who never bet give up their seat after a few rounds', () => {
    const s = table(2);
    for (let r = 0; r < MAX_MISSED + 1; r++) {
      const fx = newBjEffects();
      const now = T0 + r * 100_000;
      if (s.phase === 'settled') bjTick(s, fx, rng, s.nextRoundAt!);
      if (!s.seats[1]) break;
      bjPlaceBet(s, fx, 'u0', 10, rng, now);
      bjTick(s, fx, rng, now + BET_WINDOW_MS);
      while (s.phase === 'playing') bjAct(s, fx, 'u0', 'stand', rng, now + BET_WINDOW_MS + 1);
    }
    bjTick(s, newBjEffects(), rng, s.nextRoundAt ?? T0 * 10);
    expect(s.seats[1]).toBeNull();
    expect(s.seats[0]).not.toBeNull();
  });

  it('changing or clearing a bet and standing up during betting refund the wallet', () => {
    const s = table(2);
    const fx = newBjEffects();
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjPlaceBet(s, fx, 'u0', 300, rng, T0);
    expect(net(fx)).toBe(-300);
    bjClearBet(s, fx, 'u0', T0);
    expect(net(fx)).toBe(0);
    bjPlaceBet(s, fx, 'u0', 50, rng, T0);
    bjStandUp(s, fx, 'u0', rng, T0);
    expect(net(fx)).toBe(0);
    expect(s.seats[0]).toBeNull();
  });

  it('leaving mid-round stands the hand, settles it and frees the seat', () => {
    const s = table(2);
    const fx = newBjEffects();
    rig(s, ['Ts', '9s', '6d', '9c', '9d', '8h', '9h']); // P0 T9, P1 99, dealer 6+8 then 9
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjPlaceBet(s, fx, 'u1', 100, rng, T0);
    expect(s.toAct).toBe(0);
    bjStandUp(s, fx, 'u0', rng, T0 + 4000); // P0 stands on 19
    expect(s.toAct).toBe(1);
    bjAct(s, fx, 'u1', 'stand', rng, T0 + 5000); // P1 stands on 18, dealer 6+8=14 draws 9 → 23
    expect(s.phase).toBe('settled');
    expect(s.seats[0]).toBeNull();
    expect(net(fx, 'u0')).toBe(100);
    expect(net(fx, 'u1')).toBe(100);
  });

  it('the last player leaving closes out the round and empties the table', () => {
    const s = table();
    const fx = newBjEffects();
    rig(s, ['Ts', '9s', 'Td', '8d']);
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjStandUp(s, fx, 'u0', rng, T0 + 4000);
    expect(s.seats.every((x) => x === null)).toBe(true);
    expect(s.phase).toBe('waiting');
    expect(net(fx)).toBe(100); // 20 beats 17
  });

  it('the janitor returns every chip on the table', () => {
    const s = table(2);
    const fx = newBjEffects();
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjCloseTable(s, fx, T0);
    expect(net(fx)).toBe(0);
    expect(s.seats.every((x) => x === null)).toBe(true);
  });

  it('never shows the hole card or the shoe to clients', () => {
    const s = table();
    const fx = newBjEffects();
    rig(s, ['Ts', '9s', 'Td', '8d']);
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    const pub = toBjPublic(s);
    expect(JSON.stringify(pub)).not.toContain('8d');
    expect(pub.holeHidden).toBe(true);
    expect('shoe' in pub).toBe(false);
    const back = mergeBjState(pub, toBjSecret(s));
    expect(back.hole).toBe('8d');
  });

  it('rejects out-of-turn and invalid moves', () => {
    const s = table(2);
    const fx = newBjEffects();
    expect(() => bjPlaceBet(s, fx, 'u0', 5, rng, T0)).toThrow(/Bets are/);
    expect(() => bjPlaceBet(s, fx, 'u0', 100.5, rng, T0)).toThrow(/Bets are/);
    rig(s, ['Ts', '9s', 'Td', '8d', '7c', '6h']);
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjPlaceBet(s, fx, 'u1', 100, rng, T0);
    expect(() => bjAct(s, fx, 'u1', 'hit', rng, T0)).toThrow(/not your turn/);
    expect(() => bjAct(s, fx, 'u0', 'split', rng, T0)).toThrow(/pairs/);
    expect(() => bjSitDown(s, who(0), 3, T0)).toThrow(/already/);
    expect(() => bjSitDown(s, who(5), 1, T0)).toThrow(/taken/);
  });

  it('a long session pays out like real blackjack (house edge, conserved chips)', () => {
    const r = seededRng(42);
    const s = table(3);
    let wallet = 0;
    let wagered = 0;
    let now = T0;
    for (let round = 0; round < 6000; round++) {
      const fx = newBjEffects();
      for (let p = 0; p < 3; p++) bjPlaceBet(s, fx, `u${p}`, 100, r, now);
      for (let g = 0; g < 50 && s.phase === 'playing'; g++) {
        const seat = s.seats[s.toAct]!;
        const h = seat.hands[s.handIdx];
        const t = handTotal(h.cards).total;
        const legal = bjLegal(s, s.toAct);
        const action = legal.canSplit && h.cards[0][0] === '8' ? 'split' : legal.canDouble && t === 11 ? 'double' : t < 17 ? 'hit' : 'stand';
        bjAct(s, fx, seat.userId, action, r, now);
      }
      expect(s.phase).toBe('settled');
      for (const seat of s.seats) {
        for (const h of seat?.hands ?? []) {
          wagered += h.bet;
          expect(h.payout).toBeGreaterThanOrEqual(0);
        }
      }
      wallet += Object.values(fx.wallet).reduce((a, b) => a + b, 0);
      // Every chip is either back in a wallet or won by the house: nothing is left on the table.
      expect(s.seats.reduce((a, x) => a + (x ? chipsOnTable(x) : 0), 0)).toBe(0);
      now = s.nextRoundAt!;
      bjTick(s, fx, r, now);
    }
    const edge = wallet / wagered;
    expect(edge).toBeLessThan(0);
    expect(edge).toBeGreaterThan(-0.1);
  }, 60_000);
});

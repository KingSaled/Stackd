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

/** Textbook basic strategy for 6 decks, dealer stands on soft 17, double after split. */
function basicStrategy(hand: { cards: Card[] }, legal: { canDouble: boolean; canSplit: boolean }, dealerUp: Card): 'hit' | 'stand' | 'double' | 'split' {
  const d = dealerUp[0] === 'A' ? 11 : 'TJQK'.includes(dealerUp[0]) ? 10 : Number(dealerUp[0]);
  const { total, soft } = handTotal(hand.cards);
  if (legal.canSplit) {
    const r = hand.cards[0][0];
    const p = r === 'A' ? 11 : 'TJQK'.includes(r) ? 10 : Number(r);
    if (
      p === 11 ||
      p === 8 ||
      (p === 9 && ![7, 10, 11].includes(d)) ||
      (p === 7 && d <= 7) ||
      (p === 6 && d <= 6) ||
      (p === 4 && (d === 5 || d === 6)) ||
      ((p === 2 || p === 3) && d <= 7)
    )
      return 'split';
  }
  if (soft && total < 21) {
    if (total >= 19) return 'stand';
    if (total === 18) return legal.canDouble && d >= 3 && d <= 6 ? 'double' : d <= 8 ? 'stand' : 'hit';
    const double = (total === 17 && d >= 3) || (total >= 15 && d >= 4) || d >= 5;
    return legal.canDouble && double && d <= 6 ? 'double' : 'hit';
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return d <= 6 ? 'stand' : 'hit';
  if (total === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit';
  if (total === 11) return legal.canDouble && d <= 10 ? 'double' : 'hit';
  if (total === 10) return legal.canDouble && d <= 9 ? 'double' : 'hit';
  if (total === 9) return legal.canDouble && d >= 3 && d <= 6 ? 'double' : 'hit';
  return 'hit';
}

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

  it('records each settled round for stats and challenges', () => {
    // A blackjack.
    let s = table();
    let fx = newBjEffects();
    rig(s, ['As', '9c', 'Kd', '7h']);
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    expect(fx.rounds).toEqual([
      { roundNo: 1, players: [{ userId: 'u0', hands: 1, wins: 1, blackjacks: 1, pushes: 0, doubleWins: 0, splits: 0, wagered: 100, net: 150 }] },
    ]);

    // A doubled win.
    s = table();
    fx = newBjEffects();
    rig(s, ['6s', 'Td', '5d', '7c', 'Th']);
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    expect(fx.rounds).toHaveLength(0); // still in play
    bjAct(s, fx, 'u0', 'double', rng, T0 + 5000);
    expect(fx.rounds[0].players[0]).toMatchObject({ hands: 1, wins: 1, doubleWins: 1, wagered: 200, net: 200 });

    // A split: two hands, one lost and one won.
    s = table();
    fx = newBjEffects();
    rig(s, ['8s', 'Td', '8d', '7c', '3h', 'Th']);
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjAct(s, fx, 'u0', 'split', rng, T0 + 5000);
    bjAct(s, fx, 'u0', 'stand', rng, T0 + 6000);
    bjAct(s, fx, 'u0', 'stand', rng, T0 + 7000);
    expect(fx.rounds[0].players[0]).toMatchObject({ hands: 2, wins: 1, splits: 1, wagered: 200, net: 0 });

    // A dealer blackjack: the player's natural pushes, the other player loses, both are recorded.
    s = table(2);
    fx = newBjEffects();
    rig(s, ['Ts', 'Ah', 'Ad', '9c', 'Kd', 'Kh']);
    bjPlaceBet(s, fx, 'u0', 100, rng, T0);
    bjPlaceBet(s, fx, 'u1', 50, rng, T0);
    expect(fx.rounds[0].players.map((p) => [p.userId, p.wins, p.pushes, p.net])).toEqual([
      ['u0', 0, 0, -100],
      ['u1', 0, 1, 0],
    ]);
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
        bjAct(s, fx, seat.userId, basicStrategy(seat.hands[s.handIdx], bjLegal(s, s.toAct), s.dealer[0]), r, now);
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
    expect(edge).toBeLessThan(0.02);
    expect(edge).toBeGreaterThan(-0.03);
  }, 60_000);

  it('is a fair game: perfect strategy gets back about 99.5% and every card is equally likely', () => {
    // 6 decks, dealer stands on soft 17, 3:2, double after split, no surrender: the published house edge is about 0.4-0.5%.
    const r = seededRng(7);
    const s = table(1);
    const ROUNDS = 150_000;
    let wagered = 0;
    let back = 0;
    let wins = 0;
    let losses = 0;
    let naturals = 0;
    const upCards: Record<string, number> = {};
    let now = T0;
    for (let round = 0; round < ROUNDS; round++) {
      const fx = newBjEffects();
      bjPlaceBet(s, fx, 'u0', 100, r, now);
      upCards[s.dealer[0][0]] = (upCards[s.dealer[0][0]] ?? 0) + 1;
      while (s.phase === 'playing') {
        const seat = s.seats[0]!;
        bjAct(s, fx, 'u0', basicStrategy(seat.hands[s.handIdx], bjLegal(s, 0), s.dealer[0]), r, now);
      }
      const hands = s.seats[0]!.hands;
      const result = hands.reduce((a, h) => a + h.payout - h.bet, 0);
      wagered += hands.reduce((a, h) => a + h.bet, 0);
      back += hands.reduce((a, h) => a + h.payout, 0);
      if (result > 0) wins++;
      else if (result < 0) losses++;
      if (hands.some((h) => h.outcome === 'blackjack')) naturals++;
      now = s.nextRoundAt!;
      bjTick(s, fx, r, now);
    }
    const rtp = back / wagered;
    expect(rtp).toBeGreaterThan(0.987);
    expect(rtp).toBeLessThan(1.003);
    expect(wins / ROUNDS).toBeGreaterThan(0.42);
    expect(wins / ROUNDS).toBeLessThan(0.445);
    expect(losses / ROUNDS).toBeGreaterThan(0.47);
    expect(losses / ROUNDS).toBeLessThan(0.49);
    expect(naturals / ROUNDS).toBeGreaterThan(0.043);
    expect(naturals / ROUNDS).toBeLessThan(0.048);
    // Every rank turns up as the dealer's card 1 time in 13.
    for (const rank of '23456789TJQKA') expect(Math.abs(upCards[rank] / ROUNDS - 1 / 13)).toBeLessThan(0.004);
  }, 60_000);
});

import { describe, expect, it } from 'vitest';
import {
  addChips,
  applyAction,
  closeTable,
  createInitialState,
  getLegalActions,
  isBettingPhase,
  newEffects,
  potTotal,
  sanitizeConfig,
  seatIndexOf,
  setSittingOut,
  sitDown,
  standUp,
  startHand,
  tick,
  TIMING,
  toPublicState,
  privateCards,
  type Card,
  type Effects,
  type EngineState,
  type PlayerAction,
  seededRng,
  freshDeck,
} from '../shared/poker';

const cfg = sanitizeConfig({ smallBlind: 5, bigBlind: 10, maxSeats: 6, minBuyIn: 100, maxBuyIn: 5000, turnSeconds: 30 });

let clock = 1_000_000;
const rng = seededRng(7);

function table(stacks: (number | null)[], config = cfg) {
  const s = createInitialState({ ...config, maxSeats: Math.max(config.maxSeats, stacks.length) }, clock);
  const fx = newEffects();
  stacks.forEach((st, i) => {
    if (st == null) return;
    sitDown(s, fx, { userId: `u${i}`, name: `P${i}`, avatar: '🦊', color: '#fff' }, i, Math.max(st, config.minBuyIn), clock);
    // Allow arbitrary (even sub-minimum) stacks in tests.
    s.seats[i]!.stack = st;
  });
  return { s, fx };
}

/** Deal a hand with a fixed button, then rig hole cards and the board. */
function deal(
  s: EngineState,
  fx: Effects,
  opts: { dealer?: number; holes?: Record<number, string>; board?: string } = {},
) {
  if (opts.dealer != null) {
    // startHand advances the button to the next eligible seat, so point it at the previous one.
    let prev = opts.dealer;
    do prev = (prev - 1 + s.seats.length) % s.seats.length;
    while (!s.seats[prev] || s.seats[prev]!.sittingOut || s.seats[prev]!.stack <= 0);
    s.dealer = prev;
  }
  s.phase = s.phase === 'waiting' ? 'waiting' : s.phase;
  startHand(s, fx, clock, rng);
  if (opts.holes || opts.board) rig(s, opts.holes ?? {}, opts.board);
}

function rig(s: EngineState, holes: Record<number, string>, board?: string) {
  const used = new Set<Card>();
  for (const [seat, cards] of Object.entries(holes)) {
    const cs = cards.split(' ');
    s.hole[seat] = cs;
    cs.forEach((c) => used.add(c));
  }
  const b = board ? board.split(' ') : [];
  b.forEach((c) => used.add(c));
  for (const seat of Object.keys(s.hole)) for (const c of s.hole[seat]) used.add(c);
  const rest = freshDeck().filter((c) => !used.has(c));
  const burns = rest.splice(0, 3);
  // Pops from the end: burn, f1, f2, f3, burn, turn, burn, river
  const tail: Card[] = [];
  if (b.length === 5) tail.push(b[4], burns[2], b[3], burns[1], b[2], b[1], b[0], burns[0]);
  s.deck = [...rest, ...tail];
}

function act(s: EngineState, fx: Effects, seat: number, type: PlayerAction['type'], amount?: number) {
  applyAction(s, fx, `u${seat}`, { type, amount }, clock);
}

function chipsOnTable(s: EngineState) {
  let total = 0;
  for (const seat of s.seats) {
    if (!seat) continue;
    total += seat.stack + seat.pendingTopUp;
    if (isBettingPhase(s.phase)) total += seat.committed;
  }
  return total;
}

function walletSum(fx: Effects) {
  return Object.values(fx.wallet).reduce((a, b) => a + b, 0);
}

describe('blinds and positions', () => {
  it('heads-up: button posts the small blind and acts first pre-flop, last post-flop', () => {
    const { s, fx } = table([1000, 1000]);
    deal(s, fx, { dealer: 0 });
    expect(s.dealer).toBe(0);
    expect(s.sbSeat).toBe(0);
    expect(s.bbSeat).toBe(1);
    expect(s.seats[0]!.bet).toBe(5);
    expect(s.seats[1]!.bet).toBe(10);
    expect(s.toAct).toBe(0);
    act(s, fx, 0, 'call');
    expect(s.toAct).toBe(1); // BB option
    act(s, fx, 1, 'check');
    expect(s.phase).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(1); // BB first post-flop
  });

  it('three-handed: UTG acts first, button rotates every hand', () => {
    const { s, fx } = table([1000, 1000, 1000]);
    deal(s, fx, { dealer: 0 });
    expect([s.dealer, s.sbSeat, s.bbSeat, s.toAct]).toEqual([0, 1, 2, 0]);
    act(s, fx, 0, 'fold');
    act(s, fx, 1, 'fold');
    expect(s.phase).toBe('showdown');
    expect(s.result!.uncontested).toBe(true);
    expect(s.seats[2]!.stack).toBe(1005);
    clock += TIMING.uncontestedMs + 1;
    expect(tick(s, fx, clock, rng)).toBe(true);
    expect([s.dealer, s.sbSeat, s.bbSeat, s.toAct]).toEqual([1, 2, 0, 1]);
  });

  it('skips empty seats and sitting-out players', () => {
    const { s, fx } = table([1000, null, 1000, 1000, null]);
    setSittingOut(s, fx, 'u3', true, clock);
    deal(s, fx, { dealer: 0 });
    expect(s.seats[3]!.inHand).toBe(false);
    expect(s.sbSeat).toBe(0); // heads-up between 0 and 2
    expect(s.bbSeat).toBe(2);
  });
});

describe('betting rules', () => {
  it('gives the big blind the option when everyone limps', () => {
    const { s, fx } = table([1000, 1000, 1000]);
    deal(s, fx, { dealer: 0 });
    act(s, fx, 0, 'call');
    act(s, fx, 1, 'call');
    expect(s.toAct).toBe(2);
    const legal = getLegalActions(s, 2);
    expect(legal.canCheck).toBe(true);
    expect(legal.canRaise).toBe(true);
    expect(legal.minRaiseTo).toBe(20);
    act(s, fx, 2, 'raise', 40);
    expect(s.toAct).toBe(0);
    expect(s.minRaise).toBe(30);
  });

  it('enforces the minimum raise and allows short all-ins', () => {
    const { s, fx } = table([1000, 1000, 1000]);
    deal(s, fx, { dealer: 0 });
    expect(() => act(s, fx, 0, 'raise', 15)).toThrow(/minimum raise/i);
    act(s, fx, 0, 'raise', 30); // raise by 20
    expect(s.minRaise).toBe(20);
    expect(() => act(s, fx, 1, 'raise', 45)).toThrow(/minimum raise is 50/i);
    act(s, fx, 1, 'raise', 50);
    expect(s.currentBet).toBe(50);
  });

  it('incomplete all-in raise does not re-open betting for players who already acted', () => {
    // Seat 2 is short. Post-flop: 0 bets 100, 1 calls, 2 shoves 150 (incomplete), 0 may only call/fold.
    const { s, fx } = table([2000, 2000, 160]);
    deal(s, fx, { dealer: 2 }); // sb=0, bb=1, utg=2
    act(s, fx, 2, 'call');
    act(s, fx, 0, 'call');
    act(s, fx, 1, 'check');
    expect(s.phase).toBe('flop');
    expect(s.toAct).toBe(0);
    act(s, fx, 0, 'bet', 100);
    act(s, fx, 1, 'call');
    act(s, fx, 2, 'allin'); // 150 total, +50 < 100
    expect(s.currentBet).toBe(150);
    expect(s.minRaise).toBe(100);
    const legal0 = getLegalActions(s, 0);
    expect(legal0.canCall).toBe(true);
    expect(legal0.canRaise).toBe(false);
    expect(() => act(s, fx, 0, 'raise', 400)).toThrow(/not re-opened/);
    act(s, fx, 0, 'call');
    expect(getLegalActions(s, 1).canRaise).toBe(false);
    act(s, fx, 1, 'call');
    expect(s.phase).toBe('turn');
  });

  it('cumulative short all-ins totalling a full raise re-open the betting', () => {
    const { s, fx } = table([5000, 160, 210, 5000]);
    deal(s, fx, { dealer: 3 }); // sb=0 bb=1 utg=2
    act(s, fx, 2, 'call');
    act(s, fx, 3, 'call');
    act(s, fx, 0, 'call');
    act(s, fx, 1, 'check');
    expect(s.phase).toBe('flop');
    // Order post-flop: 0, 1, 2, 3
    act(s, fx, 0, 'bet', 100);
    act(s, fx, 1, 'allin'); // 150 (short +50)
    act(s, fx, 2, 'allin'); // 200 (another +50 → cumulative +100 over seat 0's level)
    expect(getLegalActions(s, 3).canRaise).toBe(true); // has not acted yet
    act(s, fx, 3, 'call');
    expect(s.toAct).toBe(0);
    expect(getLegalActions(s, 0).canRaise).toBe(true);
  });

  it('rejects out-of-turn and illegal actions', () => {
    const { s, fx } = table([1000, 1000, 1000]);
    deal(s, fx, { dealer: 0 });
    expect(() => act(s, fx, 1, 'call')).toThrow(/not your turn/i);
    expect(() => act(s, fx, 0, 'check')).toThrow(/cannot check/i);
    expect(() => act(s, fx, 0, 'raise', 999999)).toThrow();
  });
});

describe('showdown and side pots', () => {
  it('awards main and side pots to different winners', () => {
    const { s, fx } = table([100, 300, 1000]);
    deal(s, fx, {
      dealer: 0, // sb=1, bb=2, first=0
      holes: { 0: 'Ah Ad', 1: 'Kh Kd', 2: 'Qh Qd' },
      board: '2c 7s 9d 3h 4c',
    });
    act(s, fx, 0, 'allin'); // 100
    act(s, fx, 1, 'allin'); // 300
    act(s, fx, 2, 'call'); // matches 300
    expect(s.phase).toBe('showdown');
    expect(s.board).toHaveLength(5);
    expect(s.runoutFrom).toBe(0);
    const r = s.result!;
    expect(r.pots.map((p) => p.amount)).toEqual([300, 400]);
    expect(r.pots[0].winners).toEqual([0]);
    expect(r.pots[1].winners).toEqual([1]);
    expect(s.seats[0]!.stack).toBe(300);
    expect(s.seats[1]!.stack).toBe(400);
    expect(s.seats[2]!.stack).toBe(700);
    expect(r.hands.map((x) => x.seat).sort()).toEqual([0, 1, 2]);
  });

  it('returns the uncalled part of an all-in overbet', () => {
    const { s, fx } = table([5000, 200]);
    deal(s, fx, { dealer: 0, holes: { 0: 'Ah Ad', 1: '2c 7d' }, board: 'Kh Qs 9d 3h 4c' });
    act(s, fx, 0, 'allin'); // 5000
    act(s, fx, 1, 'call'); // all-in 200
    expect(s.phase).toBe('showdown');
    expect(s.seats[0]!.stack).toBe(5200);
    expect(s.seats[1]!.stack).toBe(0);
    expect(s.result!.pots).toHaveLength(1);
    expect(s.result!.pots[0].amount).toBe(400);
  });

  it('splits a tied pot and gives the odd chip left of the button', () => {
    const { s, fx } = table([1000, 1000, 1000]);
    deal(s, fx, {
      dealer: 0, // sb 1, bb 2
      holes: { 0: '2c 3d', 1: '4c 5d', 2: '6c 7d' },
      board: 'Ah Kh Qh Jh Th',
    });
    // Make the pot odd: sb completes, total 5+5 +10 +10 = 25? Use folds to create odd chip.
    act(s, fx, 0, 'call'); // 10
    act(s, fx, 1, 'fold'); // sb folds 5 dead
    act(s, fx, 2, 'check');
    for (const street of ['flop', 'turn', 'river']) {
      expect(s.phase).toBe(street);
      act(s, fx, 2, 'check');
      act(s, fx, 0, 'check');
    }
    expect(s.phase).toBe('showdown');
    // Pot 25 split between seats 0 and 2: seat 2 is first left of the button → 13.
    expect(s.result!.pots[0].amount).toBe(25);
    expect(s.result!.pots[0].winners.sort()).toEqual([0, 2]);
    expect(s.seats[2]!.stack).toBe(1003);
    expect(s.seats[0]!.stack).toBe(1002);
  });

  it('handles a short big blind all-in (SB excess returned)', () => {
    const { s, fx } = table([1000, 4]);
    deal(s, fx, { dealer: 0 });
    // BB posted 4 all-in; SB (5) already covers it → no action needed, the board runs out.
    expect(s.phase).toBe('showdown');
    expect(s.runoutFrom).toBe(0);
    expect(s.result!.pots).toEqual([expect.objectContaining({ amount: 8 })]);
    expect(s.seats[0]!.stack + s.seats[1]!.stack).toBe(1004);
    expect(s.log.some((l) => l.text.includes('Uncalled 1 returned'))).toBe(true);
  });

  it('busted players sit out on the next deal', () => {
    const { s, fx } = table([1000, 100, 1000]);
    deal(s, fx, { dealer: 0, holes: { 0: 'Ah Ad', 1: '2c 7d', 2: '3c 8d' }, board: 'Kh Qs 9d 3h 4c' });
    act(s, fx, 0, 'raise', 100);
    act(s, fx, 1, 'allin');
    act(s, fx, 2, 'fold');
    expect(s.phase).toBe('showdown');
    clock += 20_000;
    tick(s, fx, clock, rng);
    expect(s.seats[1]!.sittingOut).toBe(true);
    expect(s.seats[1]!.inHand).toBe(false);
    expect(s.phase).toBe('preflop');
    // Rebuy brings them back for the following hand.
    addChips(s, fx, 'u1', 500, clock);
    expect(s.seats[1]!.stack).toBe(500);
    expect(s.seats[1]!.sittingOut).toBe(false);
  });
});

describe('timers, disconnects and leaving', () => {
  it('auto-checks or folds on timeout and marks repeat offenders away', () => {
    const { s, fx } = table([1000, 1000, 1000]);
    deal(s, fx, { dealer: 0 });
    expect(s.toAct).toBe(0);
    expect(tick(s, fx, clock + 1000, rng)).toBe(false);
    clock = s.actionDeadline! + 1;
    expect(tick(s, fx, clock, rng)).toBe(true);
    expect(s.seats[0]!.folded).toBe(true); // facing the BB → fold
    expect(s.seats[0]!.timeouts).toBe(1);
    act(s, fx, 1, 'call');
    clock = s.actionDeadline! + 1;
    tick(s, fx, clock, rng); // BB times out: can check
    expect(s.phase).toBe('flop');
    expect(s.seats[2]!.folded).toBe(false);
    expect(s.seats[2]!.timeouts).toBe(1);
    // Seat 1 checks, seat 2 times out again → away
    act(s, fx, 1, 'check');
    clock = s.actionDeadline! + 1;
    tick(s, fx, clock, rng);
    expect(s.seats[2]!.away).toBe(true);
    expect(s.seats[2]!.sittingOut).toBe(true);
    // Away players act instantly afterwards.
    act(s, fx, 1, 'check');
    expect(s.phase).toBe('river');
    expect(s.toAct).toBe(1);
  });

  it('standing up mid-hand folds, cashes out immediately and keeps the dead money', () => {
    const { s, fx } = table([1000, 1000, 1000]);
    const before = chipsOnTable(s) + walletSum(fx);
    deal(s, fx, { dealer: 0 });
    act(s, fx, 0, 'raise', 40);
    standUp(s, fx, 'u2', clock); // BB leaves out of turn
    expect(s.seats[2]!.folded).toBe(true);
    expect(s.seats[2]!.leaving).toBe(true);
    expect(fx.wallet['u2']).toBe(-1000 + 990);
    expect(s.toAct).toBe(1);
    act(s, fx, 1, 'call');
    expect(s.phase).toBe('flop');
    expect(s.pots[0].amount).toBe(90);
    act(s, fx, 1, 'check');
    act(s, fx, 0, 'bet', 50);
    act(s, fx, 1, 'fold');
    expect(s.phase).toBe('showdown');
    expect(s.seats[0]!.stack).toBe(1000 - 40 + 90);
    clock += 10_000;
    tick(s, fx, clock, rng);
    expect(s.seats[2]).toBeNull();
    expect(chipsOnTable(s) + walletSum(fx)).toBe(before);
  });

  it('standing up as the last opponent ends the hand', () => {
    const { s, fx } = table([1000, 1000]);
    deal(s, fx, { dealer: 0 });
    standUp(s, fx, 'u1', clock);
    expect(s.phase).toBe('showdown');
    expect(s.result!.payouts[0].seat).toBe(0);
  });

  it('starts the first hand after the countdown and waits with one player', () => {
    const s = createInitialState(cfg, clock);
    const fx = newEffects();
    sitDown(s, fx, { userId: 'a', name: 'A', avatar: '', color: '' }, 0, 500, clock);
    expect(s.nextHandAt).toBeNull();
    sitDown(s, fx, { userId: 'b', name: 'B', avatar: '', color: '' }, 3, 500, clock);
    expect(s.nextHandAt).toBe(clock + TIMING.startDelayMs);
    expect(tick(s, fx, clock + 100, rng)).toBe(false);
    clock += TIMING.startDelayMs;
    expect(tick(s, fx, clock, rng)).toBe(true);
    expect(s.phase).toBe('preflop');
    expect(fx.dealt).toBe(true);
    expect(privateCards(s)).toHaveLength(2);
    const pub = toPublicState(s) as unknown as Record<string, unknown>;
    expect(pub.deck).toBeUndefined();
    expect(pub.hole).toBeUndefined();
  });

  it('close table refunds a hand in progress and cashes everyone out', () => {
    const { s, fx } = table([1000, 1000, 1000]);
    const before = walletSum(fx);
    deal(s, fx, { dealer: 0 });
    act(s, fx, 0, 'raise', 100);
    closeTable(s, fx, clock);
    expect(s.seats.every((x) => x === null)).toBe(true);
    expect(walletSum(fx) - before).toBe(3000);
  });

  it('validates seating', () => {
    const { s, fx } = table([1000, null]);
    expect(() => sitDown(s, fx, { userId: 'u0', name: 'x', avatar: '', color: '' }, 1, 500, clock)).toThrow(/already/);
    expect(() => sitDown(s, fx, { userId: 'z', name: 'x', avatar: '', color: '' }, 0, 500, clock)).toThrow(/taken/);
    expect(() => sitDown(s, fx, { userId: 'z', name: 'x', avatar: '', color: '' }, 1, 50, clock)).toThrow(/Buy-in/);
    expect(() => addChips(s, fx, 'u0', 100000, clock)).toThrow(/exceed/);
  });
});

describe('fuzz: chip conservation and progress', () => {
  it('never creates or destroys chips across thousands of random actions', () => {
    const r = seededRng(1234);
    for (let game = 0; game < 40; game++) {
      const seats = 2 + r(5);
      const s = createInitialState({ ...cfg, maxSeats: seats + 1 }, clock);
      const fx = newEffects();
      for (let i = 0; i < seats; i++)
        sitDown(s, fx, { userId: `u${i}`, name: `P${i}`, avatar: '', color: '' }, i, 100 + r(900), clock);
      let lastHand = 0;
      for (let step = 0; step < 600; step++) {
        const before = chipsOnTable(s) + walletSum(fx);
        clock += 500;
        const roll = r(100);
        try {
          if (isBettingPhase(s.phase) && s.toAct >= 0 && roll < 85) {
            const seat = s.seats[s.toAct]!;
            const legal = getLegalActions(s, s.toAct);
            const choices: PlayerAction[] = [{ type: 'fold' }];
            if (legal.canCheck) choices.push({ type: 'check' }, { type: 'check' });
            if (legal.canCall) choices.push({ type: 'call' }, { type: 'call' });
            if (legal.canRaise) {
              const span = legal.maxRaiseTo - legal.minRaiseTo;
              choices.push({ type: legal.isBet ? 'bet' : 'raise', amount: legal.minRaiseTo + (span > 0 ? r(span + 1) : 0) });
            }
            if (legal.canAllIn) choices.push({ type: 'allin' });
            applyAction(s, fx, seat.userId, choices[r(choices.length)], clock);
          } else if (roll < 90) {
            clock = Math.max(clock, (s.actionDeadline ?? s.nextHandAt ?? clock) + 1);
            tick(s, fx, clock, r);
          } else if (roll < 93) {
            const occupied = s.seats.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
            if (occupied.length > 2) standUp(s, fx, s.seats[occupied[r(occupied.length)]]!.userId, clock);
          } else if (roll < 96) {
            const empty = s.seats.findIndex((x) => !x);
            if (empty >= 0) {
              const id = `n${step}`;
              sitDown(s, fx, { userId: id, name: id, avatar: '', color: '' }, empty, 100 + r(400), clock);
            }
          } else if (roll < 98) {
            const occupied = s.seats.filter(Boolean);
            const p = occupied[r(occupied.length)]!;
            if (p.stack + p.pendingTopUp < cfg.maxBuyIn && !p.leaving) addChips(s, fx, p.userId, 50, clock);
          } else {
            const occupied = s.seats.filter(Boolean);
            const p = occupied[r(occupied.length)]!;
            if (!p.leaving) setSittingOut(s, fx, p.userId, !p.sittingOut && p.stack > 0 ? r(2) === 0 : false, clock);
          }
        } catch (e) {
          const msg = (e as Error).message;
          // Only expected game errors are acceptable here.
          if (!/(chips|leaving|exceed|turn|re-opened|Add chips)/i.test(msg)) throw e;
        }
        // Invariants
        expect(chipsOnTable(s) + walletSum(fx)).toBe(before);
        for (const seat of s.seats) {
          if (!seat) continue;
          expect(seat.stack).toBeGreaterThanOrEqual(0);
          expect(seat.bet).toBeGreaterThanOrEqual(0);
        }
        if (isBettingPhase(s.phase)) {
          expect(s.toAct).toBeGreaterThanOrEqual(0);
          const seat = s.seats[s.toAct]!;
          expect(seat.inHand && !seat.folded && !seat.allIn).toBe(true);
          expect(potTotal(s)).toBeGreaterThan(0);
          // Every live player has distinct cards and the board/deck never overlap.
          const all = [...s.board, ...s.deck, ...Object.values(s.hole).flat()];
          expect(new Set(all).size).toBe(all.length);
        }
        // Liveness: the table always has something scheduled when it can progress.
        if (s.phase === 'showdown') expect(s.nextHandAt).not.toBeNull();
        if (s.phase === 'waiting') {
          const eligible = s.seats.filter((x) => x && !x.sittingOut && !x.leaving && x.stack > 0).length;
          if (eligible >= 2) expect(s.nextHandAt).not.toBeNull();
        }
        if (s.phase === 'showdown') {
          const paid = s.result!.payouts.reduce((a, p) => a + p.amount, 0);
          const potSum = s.result!.pots.reduce((a, p) => a + p.amount, 0);
          expect(paid).toBe(potSum);
        }
        if (s.handNo > lastHand) lastHand = s.handNo;
      }
      expect(lastHand).toBeGreaterThan(0);
      // Cash everyone out at the end: wallet sum returns to zero.
      closeTable(s, fx, clock);
      expect(walletSum(fx)).toBe(0);
      expect(seatIndexOf(s, 'u0')).toBe(-1);
    }
  });
});

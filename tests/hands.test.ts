import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createInitialState,
  newEffects,
  sanitizeConfig,
  seededRng,
  sitDown,
  startHand,
  type HandRecord,
} from '../shared/poker';
import { chipTransfers, handPayload } from '../server/hands';

const player = (userId: string, committed: number, won: number, extra: Partial<HandRecord['players'][number]> = {}) => ({
  userId,
  isBot: userId.startsWith('bot-'),
  startStack: 1000,
  committed,
  won,
  folded: won === 0,
  allIn: false,
  category: -1,
  vpip: false,
  pfr: false,
  ...extra,
});

describe('chip transfers', () => {
  it('splits each loss across the winners by what they won', () => {
    const rec: HandRecord = {
      handNo: 1,
      bigBlind: 10,
      uncontested: false,
      players: [player('a', 300, 0), player('b', 100, 0), player('c', 300, 450), player('d', 300, 250)],
    };
    // Nets: a -300, b -100, c +150, d -50 → only c gains.
    expect(chipTransfers(rec)).toEqual([
      { from: 'a', to: 'c', amount: 300 },
      { from: 'b', to: 'c', amount: 100 },
      { from: 'd', to: 'c', amount: 50 },
    ]);
  });

  it('ignores chips won from or lost to bots', () => {
    const rec: HandRecord = {
      handNo: 2,
      bigBlind: 10,
      uncontested: true,
      players: [player('a', 200, 0), player('bot-x', 200, 300), player('c', 100, 200)],
    };
    // a's 200 is split between the bot (+100) and c (+100): only the half that went to c counts.
    expect(chipTransfers(rec)).toEqual([{ from: 'a', to: 'c', amount: 100 }]);
    const p = handPayload('T1', rec)!;
    expect(p.players.map((x) => x.user_id)).toEqual(['a', 'c']);
    expect([p.bots, p.humans]).toEqual([1, 2]);
  });

  it('skips hands with no real players', () => {
    expect(handPayload('T1', { handNo: 1, bigBlind: 10, uncontested: true, players: [player('bot-a', 10, 20), player('bot-b', 10, 0)] })).toBeNull();
  });
});

describe('hand summaries', () => {
  it('records VPIP, PFR, stacks and results for every player dealt in', () => {
    const cfg = sanitizeConfig({ smallBlind: 5, bigBlind: 10, maxSeats: 3, minBuyIn: 100, maxBuyIn: 1000, turnSeconds: 30 });
    const s = createInitialState(cfg, 0);
    const fx = newEffects();
    const rng = seededRng(3);
    for (const i of [0, 1, 2]) sitDown(s, fx, { userId: `u${i}`, name: `P${i}`, avatar: 'p01', color: '#fff' }, i, 500, 0, rng);
    startHand(s, fx, 10_000, rng);
    // Three-handed: the button acts first preflop, then the small blind, then the big blind.
    const order = [s.toAct];
    applyAction(s, fx, s.seats[s.toAct]!.userId, { type: 'raise', amount: 30 }, 10_001); // raiser: VPIP + PFR
    order.push(s.toAct);
    applyAction(s, fx, s.seats[s.toAct]!.userId, { type: 'call' }, 10_002); // caller: VPIP only
    order.push(s.toAct);
    applyAction(s, fx, s.seats[s.toAct]!.userId, { type: 'fold' }, 10_003); // folder: neither
    // Everyone left checks it down.
    let guard = 0;
    while (s.phase !== 'showdown' && guard++ < 20) applyAction(s, fx, s.seats[s.toAct]!.userId, { type: 'check' }, 10_010 + guard);
    expect(fx.hands).toHaveLength(1);
    const byId = Object.fromEntries(fx.hands[0].players.map((p) => [p.userId, p]));
    const [raiser, caller, folder] = order.map((i) => byId[`u${i}`]);
    expect([raiser.vpip, raiser.pfr]).toEqual([true, true]);
    expect([caller.vpip, caller.pfr]).toEqual([true, false]);
    expect([folder.vpip, folder.pfr, folder.folded]).toEqual([false, false, true]);
    expect(raiser.startStack).toBe(500);
    // Chips are conserved: everything put in was paid out.
    const total = fx.hands[0].players.reduce((a, p) => a + p.won - p.committed, 0);
    expect(total).toBe(0);
    expect(fx.hands[0].players.filter((p) => p.won > 0).every((p) => p.category >= 0)).toBe(true);
  });
});

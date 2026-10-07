import { describe, expect, it } from 'vitest';
import {
  addChips,
  applyAction,
  cardInt,
  createInitialState,
  decideBotAction,
  estimateEquity,
  evaluateHand,
  freshDeck,
  getLegalActions,
  isBettingPhase,
  mergeState,
  newEffects,
  reservationOf,
  sanitizeConfig,
  score7,
  seededRng,
  setSittingOut,
  shuffle,
  sitDown,
  standUp,
  startHand,
  tick,
  toPublicState,
  toSecretState,
  type BotBrain,
  type Effects,
  type EngineState,
  type PlayerAction,
} from '../shared/poker';
import { buildCommit } from '../server/service';

const cfg = sanitizeConfig({ smallBlind: 10, bigBlind: 20, maxSeats: 6, minBuyIn: 400, maxBuyIn: 2000, turnSeconds: 30, bots: true });
const me = { userId: 'human-1', name: 'Alex', avatar: '🦊', color: '#fff' };
const friend = { userId: 'human-2', name: 'Sam', avatar: '🐼', color: '#fff' };

function chipsInPlay(s: EngineState) {
  let total = 0;
  for (const seat of s.seats) {
    if (!seat) continue;
    total += seat.stack + seat.pendingTopUp;
    if (isBettingPhase(s.phase)) total += seat.committed;
  }
  return total;
}
const walletSum = (fx: Effects) => Object.values(fx.wallet).reduce((a, b) => a + b, 0);

describe('fast evaluator', () => {
  it('scores exactly like the reference evaluator', () => {
    const rng = seededRng(5);
    for (let i = 0; i < 20_000; i++) {
      const n = 5 + (i % 3);
      const cards = shuffle(freshDeck(), rng).slice(0, n);
      expect(score7(cards.map(cardInt))).toBe(evaluateHand(cards).score);
    }
  });

  it('estimates equity sensibly', () => {
    const rng = seededRng(9);
    expect(estimateEquity(['As', 'Ah'], [], 1, 3000, rng)).toBeGreaterThan(0.8);
    expect(estimateEquity(['7c', '2d'], [], 1, 3000, rng)).toBeLessThan(0.4);
    expect(estimateEquity(['As', 'Ks'], ['Qs', 'Js', 'Ts'], 3, 500, rng)).toBe(1);
  });
});

describe('bot seats', () => {
  it('fills the table with bots once a player sits, and keeps them out of the database', () => {
    const now = 1_000_000;
    const s = createInitialState(cfg, now);
    const fx = newEffects();
    sitDown(s, fx, me, 0, 1000, now, seededRng(1));
    expect(s.seats.filter((x) => x?.isBot)).toHaveLength(5);
    expect(new Set(s.seats.map((x) => x?.name)).size).toBe(6);
    expect(Object.keys(s.bots ?? {})).toHaveLength(5);
    expect(s.nextHandAt).not.toBeNull();
    // Bot brains (difficulty) are secret.
    expect(JSON.stringify(toPublicState(s))).not.toContain('"level"');
    expect(toSecretState(s).bots).toBeDefined();
    const commit = buildCommit(s, fx);
    expect(commit.playerCount).toBe(1);
    expect(commit.seats.map((x) => x.user_id)).toEqual(['human-1']);
    expect(commit.wallet).toEqual([{ user_id: 'human-1', delta: -1000 }]);
  });

  it('bots act on their own clock and only make legal moves', () => {
    const rng = seededRng(77);
    let now = 1_000_000;
    const s = createInitialState(cfg, now);
    const fx = newEffects();
    sitDown(s, fx, me, 0, 1000, now, rng);
    const base = chipsInPlay(s) + walletSum(fx) - fx.botChips;
    for (let step = 0; step < 4000; step++) {
      if (isBettingPhase(s.phase) && s.toAct >= 0) {
        const seat = s.seats[s.toAct]!;
        if (seat.isBot) {
          // The bot's decision must be accepted by the engine as-is.
          const probe = mergeState(toPublicState(s), toSecretState(s));
          const decision = decideBotAction(probe, s.toAct, s.bots![seat.userId], seededRng(step));
          expect(() => applyAction(probe, newEffects(), seat.userId, decision, now)).not.toThrow();
          expect(s.actionDeadline! - now).toBeLessThanOrEqual(2600);
        } else {
          const l = getLegalActions(s, s.toAct);
          applyAction(s, fx, me.userId, l.canCheck ? { type: 'check' } : { type: 'call' }, now);
          continue;
        }
      }
      now = Math.max(now + 100, (s.actionDeadline ?? s.nextHandAt ?? now) + 1);
      tick(s, fx, now, rng);
      expect(chipsInPlay(s) + walletSum(fx) - fx.botChips).toBe(base);
      // Rebuy when busted so the session keeps going.
      const hero = s.seats[0]!;
      if (hero.stack + hero.pendingTopUp === 0 && !(isBettingPhase(s.phase) && hero.inHand && !hero.folded)) {
        addChips(s, fx, me.userId, 1000, now);
        expect(chipsInPlay(s) + walletSum(fx) - fx.botChips).toBe(base);
      }
    }
    expect(s.handNo).toBeGreaterThan(20);
  });

  it('lets a player claim a bot seat: the bot finishes the hand, then the player is dealt in', () => {
    const rng = seededRng(3);
    let now = 1_000_000;
    const s = createInitialState(cfg, now);
    const fx = newEffects();
    sitDown(s, fx, me, 0, 1000, now, rng);
    now += 3000;
    tick(s, fx, now, rng);
    expect(isBettingPhase(s.phase)).toBe(true);
    const target = s.seats.findIndex((x) => x?.isBot && x.inHand);
    const botName = s.seats[target]!.name;
    sitDown(s, fx, friend, target, 800, now, rng);
    expect(s.seats[target]!.isBot).toBe(true);
    expect(reservationOf(s, friend.userId)).toBe(target);
    expect(fx.wallet[friend.userId]).toBe(-800);
    expect(buildCommit(s, fx).playerCount).toBe(2);
    // Nobody else can claim the same seat, and the friend can't claim a second one.
    expect(() => sitDown(s, fx, { ...friend, userId: 'human-3' }, target, 800, now, rng)).toThrow(/claimed/);
    expect(() => sitDown(s, fx, friend, (target + 1) % 6 || 1, 800, now, rng)).toThrow(/claimed/);
    // Play the hand out (the human folds, bots act on ticks).
    for (let i = 0; i < 300 && s.handNo === 1; i++) {
      if (s.toAct === 0) applyAction(s, fx, me.userId, { type: 'fold' }, now);
      now = Math.max(now + 100, (s.actionDeadline ?? s.nextHandAt ?? now) + 1);
      tick(s, fx, now, rng);
    }
    expect(s.handNo).toBe(2);
    const seat = s.seats[target]!;
    expect(seat.isBot).toBeFalsy();
    expect(seat.userId).toBe(friend.userId);
    expect(seat.stack + seat.bet).toBe(800); // may have posted a blind already
    expect(seat.inHand).toBe(true);
    expect(s.log.some((l) => l.text.includes(`took ${botName}'s seat`))).toBe(true);
  });

  it('a claimed seat can be cancelled for a refund, and an idle bot seat is taken immediately', () => {
    const rng = seededRng(4);
    let now = 1_000_000;
    const s = createInitialState(cfg, now);
    const fx = newEffects();
    sitDown(s, fx, me, 0, 1000, now, rng);
    // Between hands: taking a bot seat is instant.
    sitDown(s, fx, friend, 2, 900, now, rng);
    expect(s.seats[2]!.userId).toBe(friend.userId);
    now += 3000;
    tick(s, fx, now, rng);
    const target = s.seats.findIndex((x) => x?.isBot && x.inHand);
    const third = { ...friend, userId: 'human-3', name: 'Kai' };
    sitDown(s, fx, third, target, 700, now, rng);
    expect(fx.wallet['human-3']).toBe(-700);
    standUp(s, fx, 'human-3', now);
    expect(fx.wallet['human-3']).toBe(0);
    expect(reservationOf(s, 'human-3')).toBe(-1);
    expect(s.seats[target]!.isBot).toBe(true);
  });

  it('never deals bot-only hands', () => {
    const rng = seededRng(6);
    let now = 1_000_000;
    const s = createInitialState(cfg, now);
    const fx = newEffects();
    sitDown(s, fx, me, 0, 1000, now, rng);
    setSittingOut(s, fx, me.userId, true, now);
    expect(s.nextHandAt).toBeNull();
    now += 10_000;
    expect(tick(s, fx, now, rng)).toBe(false);
    expect(s.phase).toBe('waiting');
  });

  it('when the last real player leaves mid-hand, the hand finishes at once and they are cashed out', () => {
    const rng = seededRng(8);
    let now = 1_000_000;
    const s = createInitialState(cfg, now);
    const fx = newEffects();
    sitDown(s, fx, me, 0, 1000, now, rng);
    now += 3000;
    tick(s, fx, now, rng);
    expect(s.seats[0]!.inHand).toBe(true);
    standUp(s, fx, me.userId, now);
    expect(s.seats[0]).toBeNull();
    expect(s.phase).toBe('waiting');
    expect(buildCommit(s, fx).playerCount).toBe(0);
    expect(walletSum(fx)).toBeLessThanOrEqual(0);
    expect(walletSum(fx)).toBeGreaterThanOrEqual(-1000);
  });
});

describe('bot strength', () => {
  /** Ring game between brains (all seats driven by decideBotAction). Returns net chips per brain level. */
  function simulate(brains: BotBrain[], hands: number, seed: number) {
    const rng = seededRng(seed);
    const now = 1_000_000;
    const s = createInitialState({ ...cfg, bots: false, maxSeats: brains.length }, now);
    const fx = newEffects();
    const net = brains.map(() => 0);
    brains.forEach((_, i) => sitDown(s, fx, { userId: `p${i}`, name: `P${i}`, avatar: '', color: '' }, i, 1000, now, rng));
    for (let h = 0; h < hands; h++) {
      // Reset stacks every hand so busting doesn't end the experiment.
      s.seats.forEach((seat, i) => {
        net[i] += seat!.stack - 1000;
        seat!.stack = 1000;
      });
      s.phase = 'waiting';
      startHand(s, fx, now, rng);
      for (let g = 0; g < 200 && isBettingPhase(s.phase); g++) {
        const i = s.toAct;
        let a: PlayerAction = decideBotAction(s, i, brains[i], rng);
        try {
          applyAction(s, fx, `p${i}`, a, now);
        } catch {
          a = getLegalActions(s, i).canCheck ? { type: 'check' } : { type: 'fold' };
          applyAction(s, fx, `p${i}`, a, now);
        }
      }
    }
    s.seats.forEach((seat, i) => (net[i] += seat!.stack - 1000));
    return net;
  }

  it('hard bots beat easy bots over many hands', () => {
    const easy: BotBrain = { level: 'easy', tight: 0.25, aggr: 0.25, bluff: 0.05, iters: 60 };
    const hard: BotBrain = { level: 'hard', tight: 0.62, aggr: 0.7, bluff: 0.15, iters: 320 };
    let hardNet = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const net = simulate([hard, easy, easy, hard], 150, seed);
      hardNet += net[0] + net[3] - net[1] - net[2];
    }
    expect(hardNet).toBeGreaterThan(0);
  }, 120_000);

  it('plays a realistic share of hands and does not fold to everything', () => {
    // Six regulars: count how often they play pre-flop and fold when bet into.
    const brains: BotBrain[] = [
      { level: 'medium', tight: 0.5, aggr: 0.5, bluff: 0.1, iters: 160 },
      { level: 'hard', tight: 0.62, aggr: 0.7, bluff: 0.15, iters: 320 },
      { level: 'medium', tight: 0.4, aggr: 0.6, bluff: 0.08, iters: 160 },
      { level: 'hard', tight: 0.7, aggr: 0.6, bluff: 0.12, iters: 320 },
      { level: 'medium', tight: 0.6, aggr: 0.4, bluff: 0.1, iters: 160 },
      { level: 'hard', tight: 0.55, aggr: 0.8, bluff: 0.18, iters: 320 },
    ];
    const rng = seededRng(21);
    const now = 1_000_000;
    const s = createInitialState({ ...cfg, bots: false, maxSeats: 6 }, now);
    const fx = newEffects();
    brains.forEach((_, i) => sitDown(s, fx, { userId: `p${i}`, name: `P${i}`, avatar: '', color: '' }, i, 1000, now, rng));
    let dealt = 0;
    let played = 0;
    let raisedPre = 0;
    let facedRaise = 0;
    let foldedToRaise = 0;
    let facedBet = 0;
    let foldedToBet = 0;
    for (let h = 0; h < 250; h++) {
      s.seats.forEach((seat) => (seat!.stack = 1000));
      s.phase = 'waiting' as EngineState['phase'];
      fx.hands = [];
      startHand(s, fx, now, rng);
      for (let g = 0; g < 200 && isBettingPhase(s.phase); g++) {
        const i = s.toAct;
        const facing = s.currentBet > s.seats[i]!.bet;
        const a = decideBotAction(s, i, brains[i], rng);
        if (facing && s.phase === 'preflop' && s.currentBet > cfg.bigBlind) {
          facedRaise++;
          if (a.type === 'fold') foldedToRaise++;
        }
        if (facing && s.phase !== 'preflop') {
          facedBet++;
          if (a.type === 'fold') foldedToBet++;
        }
        applyAction(s, fx, `p${i}`, a, now);
      }
      for (const rec of fx.hands)
        for (const p of rec.players) {
          dealt++;
          if (p.vpip) played++;
          if (p.pfr) raisedPre++;
        }
    }
    const vpip = played / dealt;
    const pfr = raisedPre / dealt;
    expect(vpip).toBeGreaterThan(0.18);
    expect(vpip).toBeLessThan(0.4);
    // Regulars raise most of the hands they play instead of limping.
    expect(pfr / vpip).toBeGreaterThan(0.4);
    expect(foldedToRaise / facedRaise).toBeLessThan(0.82);
    expect(foldedToBet / facedBet).toBeGreaterThan(0.2);
    expect(foldedToBet / facedBet).toBeLessThan(0.6);
  }, 120_000);

  it('a player who raises every hand does not profit from bots', () => {
    const rng = seededRng(33);
    const now = 1_000_000;
    const brains: BotBrain[] = [0, 1, 2, 3, 4].map((k) => ({ level: k % 2 ? 'medium' : 'hard', tight: 0.55, aggr: 0.6, bluff: 0.1, iters: 200 }) as BotBrain);
    const s = createInitialState({ ...cfg, bots: false, maxSeats: 6 }, now);
    const fx = newEffects();
    for (let i = 0; i < 6; i++) sitDown(s, fx, { userId: `p${i}`, name: `P${i}`, avatar: '', color: '' }, i, 1000, now, rng);
    let maniac = 0;
    for (let h = 0; h < 300; h++) {
      maniac += s.seats[0]!.stack - 1000;
      s.seats.forEach((seat) => (seat!.stack = 1000));
      s.phase = 'waiting' as EngineState['phase'];
      startHand(s, fx, now, rng);
      for (let g = 0; g < 200 && isBettingPhase(s.phase); g++) {
        const i = s.toAct;
        let a: PlayerAction;
        if (i === 0) {
          const L = getLegalActions(s, 0);
          a = L.canRaise ? { type: 'allin' } : L.canCheck ? { type: 'check' } : { type: 'call' };
        } else a = decideBotAction(s, i, brains[i - 1], rng);
        applyAction(s, fx, `p${i}`, a, now);
      }
    }
    maniac += s.seats[0]!.stack - 1000;
    expect(maniac).toBeLessThan(0);
  }, 120_000);
});

/**
 * Development-only table playground (served at /dev in `npm run dev`).
 * Runs the real engine locally with fake players so the table UI, animations
 * and sounds can be exercised without a backend. Excluded from production builds.
 */
import { useMemo, useRef, useState } from 'react';
import {
  applyAction,
  createInitialState,
  getLegalActions,
  newEffects,
  sanitizeConfig,
  seatIndexOf,
  seededRng,
  sitDown,
  startHand,
  tick,
  toPublicState,
  type EngineState,
  type PlayerAction,
} from '../../shared/poker';
import { AVATARS, COLORS } from '../../shared/economy';
import { Stage } from '../components/table/Stage';
import { ActionBar } from '../components/table/ActionBar';
import { ChatPanel } from '../components/table/ChatPanel';
import { useStage } from '../hooks/useStage';
import { usePresentation } from '../hooks/usePresentation';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { seatPan, sound } from '../lib/sound';
import { serverNow } from '../lib/clock';
import { useEffect } from 'react';
import type { ReactionEvent } from '../hooks/useTable';

const NAMES = ['You', 'Maya', 'Leo', 'Priya', 'Sam', 'Jules', 'Kai', 'Noor', 'Ravi'];

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function build(scene: string, seats: number, seed: number): EngineState {
  const rng = seededRng(seed);
  const now = serverNow();
  const s = createInitialState(
    sanitizeConfig({ smallBlind: 25, bigBlind: 50, maxSeats: seats, minBuyIn: 1000, maxBuyIn: 10000, turnSeconds: 30 }),
    now,
  );
  const fx = newEffects();
  const full = new URLSearchParams(window.location.search).has('full');
  if (scene === 'bots') {
    const b = createInitialState(
      sanitizeConfig({ smallBlind: 25, bigBlind: 50, maxSeats: seats, minBuyIn: 1000, maxBuyIn: 10000, turnSeconds: 30, bots: true }),
      now,
    );
    const bfx = newEffects();
    sitDown(b, bfx, { userId: 'u0', name: 'You', avatar: '🦊', color: '#f5c451' }, 0, 3000, now, rng);
    tick(b, bfx, now + 5000, rng);
    // Let bots play until it's the hero's turn (or a few moves pass).
    for (let i = 0; i < 12 && b.toAct >= 0 && b.seats[b.toAct]?.isBot; i++) tick(b, bfx, (b.actionDeadline ?? now) + 1, rng);
    return b;
  }
  const count = scene === 'waiting' ? 1 : seats === 9 && !full ? 8 : seats;
  for (let i = 0; i < count; i++)
    sitDown(s, fx, { userId: `u${i}`, name: NAMES[i], avatar: AVATARS[(i * 5) % AVATARS.length], color: COLORS[(i * 3) % COLORS.length] }, i, 2000 + i * 650, now);
  if (scene === 'waiting') return s;
  s.dealer = seats - 1;
  startHand(s, fx, now, rng);
  const act = (a: PlayerAction) => applyAction(s, fx, s.seats[s.toAct]!.userId, a, now);
  if (scene === 'preflop') {
    while (s.toAct !== 0 && s.phase === 'preflop') act(s.seats[s.toAct]!.bet < s.currentBet ? { type: 'call' } : { type: 'check' });
    return s;
  }
  if (scene === 'allin') {
    act({ type: 'allin' });
    act({ type: 'allin' });
    while (s.phase === 'preflop') act({ type: 'fold' });
    return s;
  }
  // Everyone calls pre-flop.
  let guard = 0;
  while (s.phase === 'preflop' && guard++ < 50) {
    const seat = s.seats[s.toAct]!;
    if (s.toAct === 2 && seat.bet < 150) act({ type: 'raise', amount: 150 });
    else act(seat.bet < s.currentBet ? { type: 'call' } : { type: 'check' });
  }
  if (scene === 'flop') {
    act({ type: 'bet', amount: 200 });
    if (s.toAct !== 0) act({ type: 'fold' });
    return s;
  }
  // Showdown: check it down.
  guard = 0;
  while (s.phase !== 'showdown' && guard++ < 200) {
    const seat = s.seats[s.toAct]!;
    act(seat.bet < s.currentBet ? { type: 'call' } : { type: 'check' });
  }
  return s;
}

export default function Playground() {
  const params = new URLSearchParams(window.location.search);
  const scene = params.get('scene') ?? 'flop';
  const seats = Math.max(2, Math.min(9, Number(params.get('seats') ?? 6)));
  const [seed, setSeed] = useState(Number(params.get('seed') ?? 3));
  const [state, setState] = useState<EngineState>(() => build(scene, seats, seed));
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const metrics = useStage(wrap);
  const pub = useMemo(() => toPublicState(state), [state]);
  const pres = usePresentation(pub, 'u0');
  const wide = useMediaQuery('(min-width: 1100px)');
  const me = params.has('viewer') ? 'viewer' : 'u0';
  const mySeat = seatIndexOf(pub, me);
  const legal = getLegalActions(pub, mySeat);
  const myCards = mySeat >= 0 && state.hole['0'] ? { handNo: state.handNo, seat: 0, cards: state.hole['0'] } : null;

  useEffect(() => {
    for (const c of pres.cues) sound.play(c.sound, { delay: c.delay, count: c.count, pan: seatPan(c.seat) });
  }, [pres.cueId]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutate = (fn: (s: EngineState) => void) => {
    const next = clone(state);
    try {
      fn(next);
      next.updatedAt = Date.now();
      setState(next);
    } catch (e) {
      console.warn(e);
    }
  };

  const botAct = () =>
    mutate((s) => {
      if (s.toAct < 0) return;
      const l = getLegalActions(s, s.toAct);
      const a: PlayerAction = l.canCheck ? { type: 'check' } : Math.random() < 0.7 ? { type: 'call' } : { type: 'fold' };
      applyAction(s, newEffects(), s.seats[s.toAct]!.userId, a, serverNow());
    });

  return (
    <div className="table-page">
      <header className="table-top">
        <div className="table-top__title">
          <span className="table-top__name">Playground · {scene}</span>
          <span className="table-top__meta">Hand #{state.handNo} · {state.phase}</span>
        </div>
        <div className="table-top__actions">
          <button className="btn btn--sm btn--ghost" onClick={botAct} data-testid="bot">
            Bot acts
          </button>
          <button
            className="btn btn--sm btn--ghost"
            data-testid="tick"
            onClick={() => mutate((s) => tick(s, newEffects(), Math.max(serverNow(), (s.nextHandAt ?? 0) + 1, (s.actionDeadline ?? 0) + 1), seededRng(seed + s.handNo)))}
          >
            Tick
          </button>
          <button
            className="btn btn--sm btn--ghost"
            data-testid="react"
            onClick={() => setReactions((r) => [...r, { id: Date.now(), userId: `u${1 + Math.floor(Math.random() * 3)}`, emoji: '🔥', at: Date.now() }])}
          >
            React
          </button>
          <button
            className="btn btn--sm btn--gold"
            data-testid="reset"
            onClick={() => {
              setSeed(seed + 1);
              setState(build(scene, seats, seed + 1));
            }}
          >
            Reset
          </button>
        </div>
      </header>
      <div className="table-body">
        <div className="stage-wrap" ref={wrap}>
          <Stage
            state={pub}
            me={me}
            myCards={myCards}
            online={new Set(pub.seats.filter((s, i) => s && i !== 3).map((s) => s!.userId))}
            reactions={reactions}
            pres={pres}
            metrics={metrics}
            canSit={me === 'viewer'}
            onSeatClick={() => undefined}
          />
        </div>
        {wide && (
          <aside className="side-chat">
            <ChatPanel
              chat={[
                { id: 1, table_id: 'X', user_id: 'u1', name: 'Maya', avatar: '🐼', color: '#ff6b6b', kind: 'chat', body: 'gl everyone 🍀', created_at: '' },
                { id: 2, table_id: 'X', user_id: 'u0', name: 'You', avatar: '🦊', color: '#f5c451', kind: 'chat', body: 'nice hand', created_at: '' },
              ]}
              log={pub.log}
              me={me}
              canChat
              onSend={async () => undefined}
              onReact={() => undefined}
            />
          </aside>
        )}
      </div>
      <ActionBar
        state={pub}
        mySeat={mySeat}
        legal={legal}
        busy={false}
        preAction={null}
        setPreAction={() => undefined}
        onAct={(a) => mutate((s) => applyAction(s, newEffects(), me, a, serverNow()))}
        onSitIn={() => undefined}
        onSitOut={() => undefined}
        onAddChips={() => undefined}
        onStand={() => undefined}
        walletChips={12000}
        myCards={myCards?.cards ?? null}
      />
    </div>
  );
}

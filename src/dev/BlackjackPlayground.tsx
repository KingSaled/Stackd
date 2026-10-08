/**
 * Dev-only blackjack table (/dev/blackjack?scene=...). Runs the real engine in
 * the browser so the table, animations and bar can be played and screenshotted
 * without a server. Scenes: betting, dealt, turn, split, settled.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SeasonDecor } from '../components/season/SeasonDecor';
import '../styles/blackjack.css';
import { BlackjackStage } from '../components/blackjack/BlackjackStage';
import { BlackjackBar } from '../components/blackjack/BlackjackBar';
import { bjTimeline } from '../components/blackjack/timeline';
import { useStage } from '../hooks/useStage';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { ChatPanel } from '../components/table/ChatPanel';
import {
  bjAct,
  bjNextDeadline,
  bjPlaceBet,
  bjSitDown,
  bjStandUp,
  bjTick,
  createBjState,
  newBjEffects,
  sanitizeBjConfig,
  toBjPublic,
  type BjState,
} from '../../shared/blackjack';
import { freshDeck, seededRng, type Card } from '../../shared/poker/cards';

const PLAYERS = [
  { userId: 'u1', name: 'Maya', avatar: 'p07', color: '#ff6b6b', frame: 'frame-gold' },
  { userId: 'u2', name: 'Kai', avatar: 'p35', color: '#4dd4ff', frame: null },
  { userId: 'me', name: 'Saled', avatar: 'p24', color: '#f5c451', frame: 'frame-mythic', backdrop: 'bg-galaxy' },
  { userId: 'u3', name: 'Noor', avatar: 'p50', color: '#3ef0a8', frame: 'frame-neon', backdrop: 'bg-city' },
];

function rig(s: BjState, cards: Card[]) {
  const filler: Card[] = [];
  for (let d = 0; d < 5; d++) filler.push(...freshDeck());
  s.shoe = [...filler, ...cards.slice().reverse()];
  s.shoeSize = 312;
}

function build(scene: string): BjState {
  const rng = seededRng(7);
  const now = Date.now();
  const s = createBjState(sanitizeBjConfig({ turnSeconds: 20 }), now);
  const seats = [0, 1, 2, 4];
  PLAYERS.forEach((p, i) => bjSitDown(s, p, seats[i], now));
  const fx = newBjEffects();
  if (scene === 'betting') {
    bjPlaceBet(s, fx, 'u1', 250, rng, now);
    return s;
  }
  // seats 0 Maya, 1 Kai, 2 me, 4 Noor: first pass, dealer up, second pass, hole, then draws
  if (scene === 'turn') rig(s, ['Ts', '9h', '8d', '5c', '6d', '7c', '8s', 'Ad', 'Kh', 'Jd', '4c', '9d', 'Qs', '2h']);
  else if (scene === 'split') rig(s, ['Ts', '9h', '8d', '5c', '6d', '7c', '8s', '8h', 'Kh', 'Jd', '4c', '3d', 'Qs', '2h', '9c']);
  else rig(s, ['Ts', '9h', 'Ah', '5c', '6d', '7c', 'Kd', 'Ad', 'Kh', '8s', '4c', '9d', 'Qs', '2h']);
  const t = scene === 'dealt' ? now : now - 8000;
  for (const [id, amt] of [
    ['u1', 250],
    ['u2', 100],
    ['me', 500],
    ['u3', 1000],
  ] as const)
    bjPlaceBet(s, fx, id, amt, rng, t);
  if (scene === 'dealt') return s;
  // Maya stands, Kai hits, then it's my turn.
  bjAct(s, fx, 'u1', 'stand', rng, t + 4000);
  bjAct(s, fx, 'u2', 'hit', rng, t + 4500);
  if (s.toAct === 1) bjAct(s, fx, 'u2', 'stand', rng, t + 5000);
  if (scene === 'turn') return s;
  if (scene === 'split') {
    bjAct(s, fx, 'me', 'split', rng, t + 6000);
    return s;
  }
  // settled: play everyone out
  for (let g = 0; g < 20 && s.phase === 'playing'; g++) bjAct(s, fx, s.seats[s.toAct]!.userId, 'stand', rng, now - 2000);
  return s;
}

export default function BlackjackPlayground() {
  const scene = new URLSearchParams(window.location.search).get('scene') ?? 'turn';
  const [s, setS] = useState<BjState>(() => build(scene));
  const [, bump] = useState(0);
  const [pending, setPending] = useState(0);
  const [wallet, setWallet] = useState(48_250);
  const wrap = useRef<HTMLDivElement>(null);
  const m = useStage(wrap);
  const wide = useMediaQuery('(min-width: 1100px)');
  const pub = useMemo(() => toBjPublic(s), [s, s.updatedAt, s.logSeq]); // eslint-disable-line react-hooks/exhaustive-deps
  const rng = useMemo(() => seededRng(11), []);

  const mutate = (f: (st: BjState) => void) => {
    const fx = newBjEffects();
    const next: BjState = JSON.parse(JSON.stringify(s));
    f(next);
    next.updatedAt = Date.now() + Math.random();
    setWallet((w) => w + (fx.wallet.me ?? 0));
    setS(next);
    return fx;
  };

  // Bots in seats 0, 1 and 4 act after a short think; timers tick like the server would.
  useEffect(() => {
    const deadline = bjNextDeadline(pub);
    const ms = s.phase === 'playing' && s.toAct >= 0 && s.seats[s.toAct]?.userId !== 'me' ? Math.max(900, (s.turnStartedAt ?? 0) - Date.now() + 900) : deadline ? deadline - Date.now() : null;
    if (ms == null) return;
    const id = window.setTimeout(() => {
      const next: BjState = JSON.parse(JSON.stringify(s));
      const fx = newBjEffects();
      if (next.phase === 'playing' && next.toAct >= 0 && next.seats[next.toAct]?.userId !== 'me') {
        const seat = next.seats[next.toAct]!;
        const hand = seat.hands[next.handIdx];
        const total = hand.cards.reduce((a, c) => a + (c[0] === 'A' ? 11 : 'TJQK'.includes(c[0]) ? 10 : Number(c[0])), 0);
        bjAct(next, fx, seat.userId, total < 15 ? 'hit' : 'stand', rng, Date.now());
      } else bjTick(next, fx, rng, Date.now());
      for (const id of ['u1', 'u2', 'u3'])
        if (next.phase === 'betting' && next.seats.some((x) => x?.userId === id && x.bet === 0)) bjPlaceBet(next, fx, id, [250, 100, 1000][['u1', 'u2', 'u3'].indexOf(id)], rng, Date.now());
      setWallet((w) => w + (fx.wallet.me ?? 0));
      next.updatedAt = Date.now() + Math.random();
      setS(next);
    }, Math.max(50, ms));
    return () => clearTimeout(id);
  }, [s, pub, rng]);

  const tl = bjTimeline(pub);
  const resultsVisible = tl.resultsAt != null && Date.now() >= tl.resultsAt;
  useEffect(() => {
    if (tl.resultsAt == null || Date.now() >= tl.resultsAt) return;
    const id = window.setTimeout(() => bump((x) => x + 1), tl.resultsAt - Date.now() + 20);
    return () => clearTimeout(id);
  }, [tl.resultsAt]);

  useEffect(() => setPending(0), [s.roundNo]);
  const mySeat = pub.seats.findIndex((x) => x?.userId === 'me');
  return (
    <div className={`table-page bj-page ${wide ? 'table-page--wide' : ''}`}>
      <SeasonDecor />
      <header className="table-top">
        <div className="table-top__title">
          <span className="table-top__name">Playground · blackjack</span>
          <span className="table-top__meta">
            {pub.phase} · round #{pub.roundNo}
          </span>
        </div>
        <div className="table-top__actions">
          <button className="btn btn--ghost btn--sm" onClick={() => setS(build(scene))}>
            Reset
          </button>
        </div>
      </header>
      <div className="table-body">
        <div className="stage-wrap" ref={wrap}>
          {m.w > 0 && (
            <BlackjackStage
              state={pub}
              me="me"
              w={m.w}
              h={m.h}
              portrait={m.portrait}
              online={null}
              reactions={[]}
              canSit={mySeat < 0}
              pendingBet={pending}
              onSit={(i) => mutate((st) => bjSitDown(st, PLAYERS[2], i, Date.now()))}
            />
          )}
        </div>
        {wide && (
          <aside className="side-chat">
            <ChatPanel chat={[]} log={pub.log} me="me" canChat onSend={async () => undefined} onReact={() => undefined} />
          </aside>
        )}
      </div>
      <BlackjackBar
        state={pub}
        mySeat={mySeat}
        wallet={wallet}
        busy={false}
        resultsVisible={resultsVisible}
        pending={pending}
        setPending={setPending}
        onBet={(a) => mutate((st) => bjPlaceBet(st, newBjEffects(), 'me', a, rng, Date.now()))}
        onClear={() => undefined}
        onAct={(a) => mutate((st) => bjAct(st, newBjEffects(), 'me', a, rng, Date.now()))}
        onStand={() => mutate((st) => bjStandUp(st, newBjEffects(), 'me', rng, Date.now()))}
      />
    </div>
  );
}

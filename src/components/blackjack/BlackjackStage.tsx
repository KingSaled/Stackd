import { memo, useEffect, useReducer, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { PlusIcon, WifiSlashIcon, SignOutIcon } from '@phosphor-icons/react';
import { Portrait } from '../Avatar';
import { PlayingCard } from '../PlayingCard';
import { FlipCard } from '../FlipCard';
import { ChipStack } from '../Chips';
import { TimerRing } from '../TimerRing';
import { Emoji } from '../Emoji';
import { serverNow } from '../../lib/clock';
import { chips, chipsShort } from '../../lib/format';
import { sound } from '../../lib/sound';
import { frameClass } from '../../../shared/cosmetics';
import { handTotal, totalLabel } from '../../../shared/blackjack/engine';
import type { BjHand, BjOutcome, BjPublicState, BjSeat } from '../../../shared/blackjack/types';
import type { ReactionEvent } from '../../hooks/useTable';
import { bjLayout, cardOffset, type BjLayout, type Pt, type SeatSpot } from './layout';
import { bjTimeline } from './timeline';

/** Re-render exactly when the next scheduled card or result is due. */
function useEventClock(events: number[]) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const now = serverNow();
  let next = Infinity;
  for (const t of events) if (t > now && t < next) next = t;
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const id = window.setTimeout(force, Math.max(0, next - serverNow()) + 8);
    return () => clearTimeout(id);
  }, [next]);
  return now;
}

const OUTCOME: Record<BjOutcome, string> = {
  blackjack: 'Blackjack!',
  win: 'Win',
  push: 'Push',
  lose: 'Lose',
  bust: 'Bust',
};

type CardSize = 'board' | 'seat' | 'hero';

type CardOpts = { size?: CardSize; faceDown?: boolean; dim?: boolean; glow?: boolean; active?: boolean; silent?: boolean; z?: number };
type RenderCard = (key: string, card: string | null, at: Pt, rotate: number, appearAt: number, opts?: CardOpts) => React.ReactNode;
type Placed = { card: string; j: number; at: Pt; appear: number };
type HandCards = (seatIdx: number, hand: BjHand, k: number, H: number, base: Pt, frame: Pick<SeatSpot, 'across' | 'up'>, cw: number) => Placed[];

interface Props {
  state: BjPublicState;
  me: string;
  w: number;
  h: number;
  portrait: boolean;
  online: Set<string> | null;
  reactions: ReactionEvent[];
  canSit: boolean;
  onSit(seat: number): void;
  /** My bet before it is placed (previewed in my betting circle). */
  pendingBet?: number;
}

const HERO_FRAME: Pick<SeatSpot, 'across' | 'up'> = { across: { x: 1, y: 0 }, up: { x: 0, y: -1 } };

export function BlackjackStage({ state, me, w, h, portrait, online, reactions, canSit, onSit, pendingBet = 0 }: Props) {
  const L = bjLayout(w, h, portrait);
  const tl = bjTimeline(state);
  const now = useEventClock(tl.events);
  const round = state.roundNo;
  const showResults = tl.resultsAt != null && now >= tl.resultsAt;
  const mySeat = state.seats.findIndex((x) => x?.userId === me);

  // When each card was first drawn on screen: cards fly in from the dealer once, and cards that were
  // already on the table when the page opened (reloads, late joins) simply appear.
  const mountedAt = useRef(now);
  const born = useRef<{ round: number; at: Map<string, number> }>({ round, at: new Map() });
  if (born.current.round !== round) born.current = { round, at: new Map() };
  const sounded = useRef(new Set<string>());
  let dealSound = false;

  const renderCard: RenderCard = (key, card, at, rotate, appearAt, opts = {}) => {
    if (now < appearAt) return null;
    const k = `${round}:${key}`;
    let first = born.current.at.get(k);
    if (first == null) {
      first = now;
      born.current.at.set(k, first);
    }
    const start = appearAt > 0 ? appearAt : first;
    const onLoad = first - mountedAt.current < 400 && (appearAt === 0 || now - appearAt > 700);
    const animate = !onLoad && now - start < 700;
    if (animate && !opts.silent && !sounded.current.has(k)) {
      sounded.current.add(k);
      dealSound = true;
    }
    return (
      <motion.div
        key={k}
        className={clsx('bj-card', opts.active && 'is-active')}
        style={{ left: at.x, top: at.y, zIndex: opts.z }}
        initial={animate ? { x: L.deck.x - at.x, y: L.deck.y - at.y, rotate: rotate - 30, opacity: 0 } : false}
        animate={{ x: 0, y: 0, rotate, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 250, damping: 26, opacity: { duration: 0.12 } }}
      >
        {opts.faceDown ? (
          <PlayingCard card={null} faceUp={false} size={opts.size ?? 'seat'} />
        ) : (
          <FlipCard card={card} size={opts.size ?? 'seat'} dim={opts.dim} highlight={opts.glow} />
        )}
      </motion.div>
    );
  };

  // ------------------------------------------------------------------ dealer
  const dealerVisible = state.dealer.filter((_, i) => now >= tl.dealerCard(i));
  const holeHere = state.holeHidden && state.dealtAt != null && now >= tl.holeAt;
  const revealed = tl.revealAt != null && now >= tl.revealAt;
  const dealerShown = revealed ? dealerVisible : dealerVisible.slice(0, 1);
  const dealerSlots = state.holeHidden ? dealerVisible.length + (holeHere ? 1 : 0) : dealerVisible.length;
  const dealerStep = L.dealerCardW * 0.78;
  const dealerTotal = dealerShown.length ? handTotal(dealerShown).total : 0;
  const dealerBust = dealerTotal > 21;
  const dealerAt = (i: number, n: number): Pt => ({ x: L.dealer.x + (i - (n - 1) / 2) * dealerStep, y: L.dealer.y });
  const dealerBadgeAt: Pt = portrait
    ? { x: L.dealer.x + (Math.max(dealerSlots, 2) / 2) * dealerStep + L.dealerCardW * 0.55 + 28, y: L.dealer.y }
    : { x: L.dealer.x, y: L.dealer.y + L.dealerCardW * 0.7 + 16 };

  const dealerCards: React.ReactNode[] = [];
  for (let i = 0; i < dealerSlots; i++) {
    const at = dealerAt(i, dealerSlots);
    if (i === 1) dealerCards.push(renderCard('hole', revealed ? state.dealer[1] ?? null : null, at, 0, tl.holeAt, { size: 'board' }));
    else dealerCards.push(renderCard(`d${i}`, state.dealer[i] ?? null, at, 0, tl.dealerCard(i), { size: 'board' }));
  }

  // ------------------------------------------------------------------ hands
  /** Card positions for one of a seat's hands, centred on `base`, laid out in `frame`. */
  const handCards: HandCards = (seatIdx, hand, k, H, base, frame, cw) => {
    // Split hands sit side by side with room for a sideways double-down card.
    const shift = (k - (H - 1) / 2) * cw * (frame === HERO_FRAME ? 1.5 : 1.9);
    const center = { x: base.x + frame.across.x * shift, y: base.y + frame.across.y * shift };
    const mid = cardOffset((hand.cards.length - 1) / 2, frame, cw);
    return hand.cards.map((c, j) => {
      const off = cardOffset(j, frame, cw);
      return { card: c, j, at: { x: center.x + off.x - mid.x, y: center.y + off.y - mid.y }, appear: tl.playerCard(seatIdx, k, j) };
    });
  };

  const seatsView = state.seats.map((seat, i) => {
    const spot = L.seats[i];
    if (!seat)
      return (
        <div key={`e${i}`}>
          <BettingCircle at={spot.circle} amount={0} mine={false} />
          <EmptySeat at={spot.avatar} index={i} canSit={canSit} onSit={() => onSit(i)} />
        </div>
      );
    const isMe = seat.userId === me;
    const hands = seat.hands;
    const H = hands.length;
    const cw = L.cardW * (H > 1 ? 0.8 : 1);
    const inPlay = hands.reduce((a, x) => a + (x.outcome && showResults ? 0 : x.bet), 0);
    const ghost = isMe && seat.bet === 0 && inPlay === 0 && state.phase !== 'playing' && pendingBet > 0;
    const circleAmount = seat.bet > 0 ? seat.bet : inPlay > 0 ? inPlay : ghost ? pendingBet : 0;
    return (
      <div key={`s${i}`}>
        <BettingCircle at={spot.circle} amount={circleAmount} mine={isMe} ghost={ghost} />
        {portrait &&
          !isMe &&
          hands.map((hand, k) => {
            // Phones: other players show just their total; cards live in each player's own hero view.
            const visible = hand.cards.filter((_, j) => now >= tl.playerCard(i, k, j));
            if (!visible.length) return null;
            const shift = (k - (H - 1) / 2) * 30;
            return (
              <HandBadge
                key={`b${k}`}
                at={{ x: spot.cards.x + spot.across.x * shift, y: spot.cards.y + spot.across.y * shift }}
                hand={hand}
                cards={visible}
                active={state.phase === 'playing' && state.toAct === i && state.handIdx === k}
                outcome={showResults ? hand.outcome : null}
                small
              />
            );
          })}
        {!portrait && hands.map((hand, k) => {
          const placed = handCards(i, hand, k, H, spot.cards, spot, cw);
          const active = state.phase === 'playing' && state.toAct === i && state.handIdx === k;
          const visible = placed.filter((p) => now >= p.appear).map((p) => p.card);
          const outcome = showResults ? hand.outcome : null;
          const last = placed[placed.length - 1];
          const badgeAt = last ? { x: last.at.x + spot.up.x * cw * 1.05, y: last.at.y + spot.up.y * cw * 1.05 } : spot.cards;
          return (
            <div key={`h${k}`}>
              {placed.map((p) =>
                renderCard(`p${i}:${k}:${p.j}:${p.card}`, p.card, p.at, spot.rotate + (hand.doubled && p.j === 2 ? 90 : 0), p.appear, {
                  size: 'seat',
                  active,
                  z: 3 + p.j,
                  dim: outcome === 'lose' || outcome === 'bust',
                  glow: outcome === 'blackjack' || outcome === 'win',
                }),
              )}
              {visible.length > 0 && <HandBadge at={badgeAt} hand={hand} cards={visible} active={active} outcome={outcome} small={portrait} />}
            </div>
          );
        })}
        <SeatView
          seat={seat}
          at={spot.avatar}
          portrait={portrait}
          isMe={isMe}
          isTurn={state.phase === 'playing' && state.toAct === i}
          turnStartedAt={state.turnStartedAt}
          deadline={state.actionDeadline}
          offline={!!online && !online.has(seat.userId)}
          net={showResults && hands.length ? hands.reduce((a, x) => a + x.payout - x.bet, 0) : null}
          reactions={reactions.filter((r) => r.userId === seat.userId)}
        />
      </div>
    );
  });

  const mine = mySeat >= 0 ? state.seats[mySeat] : null;
  const hero = L.hero && !mine ? (
    <div className="bj-hero bj-hero--intro" style={{ left: L.hero.x, top: L.hero.y }}>
      <strong>{canSit ? 'Take a seat to play' : 'Watching this table'}</strong>
      <span>Blackjack pays 3 to 2</span>
      <span>Dealer stands on all 17s</span>
      <span>
        Bets {chipsShort(state.config.minBet)}–{chipsShort(state.config.maxBet)} from your wallet
      </span>
    </div>
  ) : L.hero && mine ? <HeroHand L={L} seat={mine} seatIdx={mySeat} state={state} now={now} showResults={showResults} renderCard={renderCard} handCards={handCards} pendingBet={pendingBet} /> : null;

  // ------------------------------------------------------------------ sounds
  useEffect(() => {
    if (dealSound) sound.play('deal');
  });
  const revealSounded = useRef(0);
  useEffect(() => {
    if (revealed && revealSounded.current !== round) {
      revealSounded.current = round;
      sound.play('flip');
    }
  }, [revealed, round]);
  const resultSounded = useRef(0);
  useEffect(() => {
    if (!showResults || resultSounded.current === round) return;
    resultSounded.current = round;
    if (!mine || !mine.hands.length) return;
    const net = mine.hands.reduce((a, x) => a + x.payout - x.bet, 0);
    if (mine.hands.some((x) => x.outcome === 'blackjack')) sound.play('bigwin');
    else if (net > 0) sound.play('win');
    else if (net === 0) sound.play('chip');
  }, [showResults, round, mine]);

  const style = {
    width: w,
    height: h,
    '--card-board': `${L.dealerCardW}px`,
    '--card-seat': `${L.cardW}px`,
    '--card-hero': `${L.hero?.cardW ?? L.cardW}px`,
    '--avatar': `${L.avatar}px`,
    '--fs': `${Math.max(10, Math.min(14, portrait ? w * 0.03 : L.R * 0.028))}px`,
  } as React.CSSProperties;

  const r0 = Math.min(16, L.R * 0.05);
  const tableStyle: React.CSSProperties = {
    left: L.cx - L.R,
    top: L.top,
    width: L.R * 2,
    height: L.R,
    borderRadius: `${r0}px ${r0}px ${L.R}px ${L.R}px / ${r0}px ${r0}px ${L.R}px ${L.R}px`,
  };
  const fr = L.R - L.rail;
  const feltStyle: React.CSSProperties = {
    left: L.rail,
    right: L.rail,
    top: L.rail * 0.6,
    bottom: L.rail,
    borderRadius: `${r0 * 0.6}px ${r0 * 0.6}px ${fr}px ${fr}px / ${r0 * 0.6}px ${r0 * 0.6}px ${fr - L.rail * 0.4}px ${fr - L.rail * 0.4}px`,
  };

  return (
    <div className={clsx('stage bj-stage', portrait ? 'stage--portrait' : 'stage--landscape')} style={style}>
      <div className="bj-table" style={tableStyle}>
        <div className="bj-felt" style={feltStyle}>
          <div className="felt-pattern" />
        </div>
      </div>
      {!portrait && <FeltPrint w={w} h={h} cx={L.cx} cy={L.top} r={L.printR} portrait={portrait} />}

      {dealerCards}
      {dealerShown.length > 0 && (
        <div className={clsx('bj-total bj-total--dealer', dealerBust && 'is-bust')} style={{ left: dealerBadgeAt.x, top: dealerBadgeAt.y }}>
          {revealed && dealerShown.length === 2 && dealerTotal === 21 ? 'Blackjack' : dealerBust ? `Bust ${dealerTotal}` : totalLabel(dealerShown)}
        </div>
      )}
      <AnimatePresence>
        {state.shuffled && state.dealtAt && now - state.dealtAt < 2500 && (
          <motion.div
            className="bj-shuffle"
            style={{ left: L.cx, top: L.dealer.y + L.dealerCardW * (portrait ? 1.1 : 1.5) }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            New shoe shuffled
          </motion.div>
        )}
      </AnimatePresence>

      {seatsView}
      {hero}
    </div>
  );
}

function HeroHand({
  L,
  seat,
  seatIdx,
  state,
  now,
  showResults,
  renderCard,
  handCards,
  pendingBet,
}: {
  L: BjLayout;
  seat: BjSeat;
  seatIdx: number;
  state: BjPublicState;
  now: number;
  showResults: boolean;
  renderCard: RenderCard;
  handCards: HandCards;
  pendingBet: number;
}) {
  const hero = L.hero!;
  const H = seat.hands.length;
  const cw = hero.cardW * (H > 1 ? 0.78 : 1);
  const base = { x: hero.x, y: hero.y };
  if (H === 0) {
    const amount = seat.bet || pendingBet;
    return (
      <div className="bj-hero" style={{ left: hero.x, top: hero.y }}>
        <span className="bj-hero__label">{seat.bet ? 'Your bet is in' : amount > 0 ? 'Your bet' : 'Place your bet'}</span>
        <span className={clsx('bj-hero__circle', !seat.bet && 'is-ghost')}>{amount > 0 && <ChipStack amount={amount} max={6} />}</span>
      </div>
    );
  }
  return (
    <>
      <div className="bj-hero__label bj-hero__label--top" style={{ left: hero.x, top: hero.y - cw * 0.7 - cw * 0.3 - 30 }}>
        {H > 1 ? 'Your hands' : 'Your hand'} · bet {chipsShort(seat.hands.reduce((a, x) => a + x.bet, 0))}
      </div>
      {seat.hands.map((hand, k) => {
        const placed = handCards(seatIdx, hand, k, H, base, HERO_FRAME, cw);
        const active = state.phase === 'playing' && state.toAct === seatIdx && state.handIdx === k;
        const visible = placed.filter((p) => now >= p.appear).map((p) => p.card);
        const outcome = showResults ? hand.outcome : null;
        return (
          <div key={`hero${k}`}>
            {placed.map((p) =>
              renderCard(`hero:${k}:${p.j}:${p.card}`, p.card, p.at, 0, p.appear, {
                size: 'hero',
                active,
                silent: true,
                z: 3 + p.j,
                dim: outcome === 'lose' || outcome === 'bust',
                glow: outcome === 'blackjack' || outcome === 'win',
              }),
            )}
            {visible.length > 0 && (
              <HandBadge at={{ x: base.x + (k - (H - 1) / 2) * cw * 1.5, y: base.y + cw * 0.7 + 26 }} hand={hand} cards={visible} active={active} outcome={outcome} />
            )}
          </div>
        );
      })}
    </>
  );
}

/** Gold print on the felt along the curve of the table. */
const FeltPrint = memo(function FeltPrint({ w, h, cx, cy, r, portrait }: { w: number; h: number; cx: number; cy: number; r: number; portrait: boolean }) {
  const path = (rr: number) => `M ${cx - rr} ${cy} A ${rr} ${rr} 0 0 0 ${cx + rr} ${cy}`;
  const big = Math.max(9, Math.min(r * (portrait ? 0.13 : 0.11), 30));
  return (
    <svg className="bj-print" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <path id="bj-arc-1" d={path(r)} />
        <path id="bj-arc-2" d={path(r - big * 1.15)} />
      </defs>
      <text className="bj-print__big" style={{ fontSize: big }}>
        <textPath href="#bj-arc-1" startOffset="50%" textAnchor="middle">
          BLACKJACK PAYS 3 TO 2
        </textPath>
      </text>
      {!portrait && (
        <text className="bj-print__small" style={{ fontSize: big * 0.48 }}>
          <textPath href="#bj-arc-2" startOffset="50%" textAnchor="middle">
            DEALER MUST STAND ON ALL 17s
          </textPath>
        </text>
      )}
    </svg>
  );
});

function BettingCircle({ at, amount, mine, ghost }: { at: Pt; amount: number; mine: boolean; ghost?: boolean }) {
  return (
    <div className={clsx('bj-circle', mine && 'is-mine', amount > 0 && 'has-bet', ghost && 'is-ghost')} style={{ left: at.x, top: at.y }}>
      <AnimatePresence>
        {amount > 0 && (
          <motion.div
            key={ghost ? 'ghost' : 'bet'}
            className="bj-circle__chips"
            initial={{ y: -10, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -18, opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          >
            <ChipStack amount={amount} max={4} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HandBadge({ at, hand, cards, active, outcome, small }: { at: Pt; hand: BjHand; cards: string[]; active: boolean; outcome: BjOutcome | null; small?: boolean }) {
  const { total } = handTotal(cards);
  const won = outcome === 'win' || outcome === 'blackjack';
  const label = outcome
    ? small
      ? won
        ? `+${chipsShort(hand.payout - hand.bet)}`
        : OUTCOME[outcome]
      : `${OUTCOME[outcome]}${won ? ` +${chipsShort(hand.payout - hand.bet)}` : ''}`
    : total > 21
      ? 'Bust'
      : small && totalLabel(cards) === 'Blackjack'
        ? 'BJ'
        : `${totalLabel(cards)}${hand.doubled && !small ? ' · x2' : ''}`;
  return (
    <motion.div
      key={outcome ?? 'live'}
      className={clsx('bj-total', small && 'bj-total--small', active && 'is-active', outcome && `is-${outcome}`, !outcome && total > 21 && 'is-bust')}
      style={{ left: at.x, top: at.y }}
      initial={outcome ? { scale: 0.5, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
    >
      {label}
    </motion.div>
  );
}

function EmptySeat({ at, index, canSit, onSit }: { at: Pt; index: number; canSit: boolean; onSit: () => void }) {
  return (
    <div className="seat seat--empty bj-seat" style={{ left: at.x, top: at.y }}>
      {canSit ? (
        <button className="seat__sit" onClick={onSit} aria-label={`Sit in seat ${index + 1}`}>
          <PlusIcon size={16} />
          <span>Sit</span>
        </button>
      ) : (
        <span className="seat__placeholder" />
      )}
    </div>
  );
}

const SeatView = memo(function SeatView({
  seat,
  at,
  portrait,
  isMe,
  isTurn,
  turnStartedAt,
  deadline,
  offline,
  net,
  reactions,
}: {
  seat: BjSeat;
  at: Pt;
  portrait: boolean;
  isMe: boolean;
  isTurn: boolean;
  turnStartedAt: number | null;
  deadline: number | null;
  offline: boolean;
  net: number | null;
  reactions: ReactionEvent[];
}) {
  const bet = seat.bet || seat.hands.reduce((a, x) => a + x.bet, 0);
  const status = seat.leaving ? 'Leaving' : bet > 0 ? `Bet ${chipsShort(bet)}` : 'Watching';
  const netText = net != null ? (net > 0 ? `+${chips(net)}` : net < 0 ? `−${chips(-net)}` : 'Push') : null;
  return (
    <div className={clsx('seat bj-seat', isMe && 'seat--me', isTurn && 'is-turn')} style={{ left: at.x, top: at.y, '--c': seat.color } as React.CSSProperties}>
      <div className={clsx('seat__avatar', frameClass(seat.frame) && 'is-framed')}>
        <Portrait avatar={seat.avatar} frame={seat.frame} backdrop={seat.backdrop} />
        {isTurn && turnStartedAt && deadline && <TimerRing startedAt={turnStartedAt} deadline={deadline} />}
        {offline && (
          <span className="seat__badge seat__badge--offline" title="Disconnected">
            <WifiSlashIcon size={11} />
          </span>
        )}
        {seat.leaving && (
          <span className="seat__badge" title="Leaving">
            <SignOutIcon size={11} />
          </span>
        )}
      </div>
      {portrait ? (
        (isMe || netText) && (
          <span className={clsx('bj-tag', isMe && 'is-me', net != null && net > 0 && 'is-up', net != null && net < 0 && 'is-down')}>{netText ?? 'You'}</span>
        )
      ) : (
        <div className="seat__plate">
          <span className="seat__name">{isMe ? 'You' : seat.name}</span>
          <span className={clsx('seat__stack', net != null && net > 0 && 'is-up', net != null && net < 0 && 'is-down')}>{netText ?? status}</span>
        </div>
      )}
      <AnimatePresence>
        {reactions.slice(-1).map((r) => (
          <motion.span
            key={r.id}
            className="bj-reaction"
            initial={{ opacity: 0, y: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], y: -50, scale: [0.4, 1.2, 1, 1] }}
            transition={{ duration: 2.4, times: [0, 0.15, 0.8, 1] }}
          >
            <Emoji char={r.emoji} />
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
});

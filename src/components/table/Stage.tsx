import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Plus, WifiOff, Moon, LogOut } from 'lucide-react';
import { memo, useMemo } from 'react';
import type { PublicState, Seat } from '../../../shared/poker/types';
import { seatIndexOf } from '../../../shared/poker/engine';
import { describeHolding } from '../../../shared/poker/evaluator';
import { seatPositions, stageGeometry, lerp, portraitSlots, type CardMode, type Point } from '../../lib/layout';
import { chips, chipsShort } from '../../lib/format';
import type { StageMetrics } from '../../hooks/useStage';
import type { MyCards, ReactionEvent } from '../../hooks/useTable';
import type { Presentation } from '../../hooks/usePresentation';
import { FlipCard } from '../FlipCard';
import { Emoji } from '../Emoji';
import { ChipStack } from '../Chips';
import { TimerRing } from '../TimerRing';
import { useSettings } from '../../store/settings';
import { useServerNow } from '../../hooks/useNow';

interface StageProps {
  state: PublicState;
  me: string;
  myCards: MyCards | null;
  online: Set<string> | null;
  reactions: ReactionEvent[];
  pres: Presentation & { resultVisible: boolean };
  metrics: StageMetrics;
  canSit: boolean;
  onSeatClick: (seat: number) => void;
}

const ACTION_LABEL: Record<string, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
  allin: 'All-in',
  sb: 'SB',
  bb: 'BB',
};

/** Vertical distance (in % of stage height) from the table center to the pot. */
const POT_OFFSET = (portrait: boolean) => (portrait ? 12.5 : 15);

function px(p: Point, w: number, h: number) {
  return { x: (p.x / 100) * w, y: (p.y / 100) * h };
}

/**
 * Where a seat's hole cards and bet chips go. On landscape tables both point at
 * the table center; on tall portrait tables side seats aim mostly horizontally
 * so their cards and chips stay clear of the (relatively wide) board.
 */
function seatGeometry(pos: Point, center: Point, portrait: boolean, w: number, h: number, avatar: number) {
  const side = portrait ? Math.min(1, Math.abs(pos.x - center.x) / 25) : 0;
  const target: Point = { x: center.x, y: pos.y + (center.y - pos.y) * (1 - 0.75 * side) };
  const s = px(pos, w, h);
  const tg = px(target, w, h);
  const d = { x: tg.x - s.x, y: tg.y - s.y };
  const len = Math.hypot(d.x, d.y) || 1;
  const u = { x: d.x / len, y: d.y / len };
  const betT = portrait ? 0.44 + 0.24 * side : 0.4;
  // Seats along the top keep their cards beside the avatar so bets and the pot stay readable.
  if (u.y > 0.75) {
    return { cardOffset: { x: avatar * 1.22, y: avatar * 0.08 }, betPos: lerp(pos, target, betT) };
  }
  // Cards pointing downwards must also clear the name plate under the avatar.
  const reach = avatar * (0.95 - 0.2 * side + 0.75 * Math.max(0, u.y));
  return {
    cardOffset: { x: u.x * reach, y: u.y * reach + avatar * 0.18 * side },
    betPos: lerp(pos, target, betT),
  };
}

export function Stage({ state, me, myCards, online, reactions, pres, metrics, canSit, onSeatClick }: StageProps) {
  const { w, h, portrait, aspect } = metrics;
  const n = state.seats.length;
  const mySeat = seatIndexOf(state, me);
  const rotation = mySeat >= 0 ? mySeat : 0;
  const positions = seatPositions(n, portrait, aspect);
  const slots = portrait ? portraitSlots(n) : null;
  const center = stageGeometry(portrait).center;
  const cPx = px(center, w, h);
  const posOf = (i: number): Point => {
    const d = (i - rotation + n) % n;
    return slots ? slots[d].pos : positions[d];
  };

  const result = state.phase === 'showdown' ? state.result : null;
  const resultVisible = pres.resultVisible;
  const payouts = useMemo(() => new Map((result?.payouts ?? []).map((p) => [p.seat, p.amount])), [result]);
  const shown = useMemo(() => new Map(state.shown.map((s) => [s.seat, s.cards])), [state.shown]);

  const winningCards = useMemo(() => {
    const set = new Set<string>();
    if (!result || result.uncontested) return set;
    const winners = new Set(result.pots.flatMap((p) => p.winners));
    for (const hnd of result.hands) if (winners.has(hnd.seat)) hnd.best.forEach((c) => set.add(c));
    return set;
  }, [result]);
  const highlightActive = resultVisible && winningCards.size > 0;

  const potAmount =
    state.phase === 'showdown'
      ? resultVisible
        ? 0
        : (result?.pots ?? []).reduce((a, p) => a + p.amount, 0)
      : state.pots.reduce((a, p) => a + p.amount, 0);
  const sidePots = state.phase !== 'showdown' && state.pots.length > 1 ? state.pots : [];

  const sizes = useMemo(() => {
    const unit = w / 100;
    const vu = h / 100;
    // Portrait sizes are bounded by both width and height so short phone
    // screens (browser toolbars visible) never overlap rows of seats.
    const card = (wPct: number, hPct: number, max: number) => Math.min(max, unit * wPct, (vu * hPct) / 1.4);
    return {
      '--card-board': `${portrait ? card(12.2, 11.5, 92) : Math.min(92, unit * 5.9)}px`,
      '--card-seat': `${portrait ? card(8.6, 8.8, 56) : Math.min(56, unit * 3.7)}px`,
      '--card-hero': `${portrait ? card(15, 12.5, 110) : Math.min(110, unit * 6.2)}px`,
      '--avatar': `${Math.min(84, portrait ? Math.min(unit * (n > 6 ? 11.5 : 12.5), vu * 8.5) : unit * 5.9)}px`,
      '--fs': `${Math.max(10.5, Math.min(15, portrait ? unit * 3.2 : unit * 1.25))}px`,
    } as React.CSSProperties;
  }, [w, h, portrait, n]);

  const avatarPx = parseFloat(String(sizes['--avatar' as keyof typeof sizes]));

  /** Card placement, bet spot and dealer-button spot for a seat. */
  const layoutOf = (i: number, isMe: boolean) => {
    const d = (i - rotation + n) % n;
    const pos = posOf(i);
    const s = px(pos, w, h);
    if (slots) {
      const slot = slots[d];
      const cardMode: CardMode = isMe ? 'hero' : slot.cards === 'hero' ? 'up' : slot.cards;
      return {
        pos,
        bet: slot.bet,
        cardMode,
        cardOffset: { x: 0, y: 0 },
        dealer: { x: s.x + slot.dealerSide * avatarPx * 0.78, y: s.y + avatarPx * 0.18 },
      };
    }
    const geo = seatGeometry(pos, center, portrait, w, h, avatarPx);
    // Landscape: dealer button on the left-hand side (the hero's cards sit to the right).
    const c = cPx;
    const dv = { x: c.x - s.x, y: c.y - s.y };
    const len = Math.hypot(dv.x, dv.y) || 1;
    const u = { x: dv.x / len, y: dv.y / len };
    const perp = { x: u.y, y: -u.x };
    return {
      pos,
      bet: geo.betPos,
      cardMode: (isMe ? 'hero' : 'toward') as CardMode,
      cardOffset: geo.cardOffset,
      dealer: {
        x: s.x + u.x * avatarPx * 0.55 + perp.x * avatarPx * 0.92,
        y: s.y + u.y * avatarPx * 0.55 + perp.y * avatarPx * 0.92,
      },
    };
  };

  if (!w || !h) return null;

  return (
    <div
      className={clsx('stage', portrait ? 'stage--portrait' : 'stage--landscape')}
      style={{ width: w, height: h, ...sizes }}
    >
      <div className="table-rail">
        <div className="table-felt">
          <div className="felt-pattern" />
          <div className="felt-logo">STACKD</div>
        </div>
      </div>

      {/* Board */}
      <div className="board" style={{ left: `${center.x}%`, top: `${center.y}%` }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const card = state.board[i];
          return (
            <div className="board__slot" key={i}>
              <AnimatePresence initial={false}>
                {card && (
                  <motion.div
                    key={`${state.handNo}-${card}`}
                    className="board__card"
                    initial={{ opacity: 0, y: -28, scale: 0.75 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8, y: -10, transition: { duration: 0.25 } }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22, delay: pres.boardDelays[i] ?? 0 }}
                  >
                    <FlipCard
                      card={card}
                      revealDelay={(pres.boardDelays[i] ?? 0) > 0 ? ((pres.boardDelays[i] ?? 0) + 0.12) * 1000 : 0}
                      size="board"
                      highlight={highlightActive && winningCards.has(card)}
                      dim={highlightActive && !winningCards.has(card)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Pot */}
      <div className="pot" style={{ left: `${center.x}%`, top: `${center.y - POT_OFFSET(portrait)}%` }}>
        <AnimatePresence>
          {potAmount > 0 && (
            <motion.div
              key={`pot-${state.handNo}`}
              className="pot__main"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
            >
              <ChipStack amount={potAmount} label={false} max={7} />
              <span className="pot__label">
                Pot <strong>{chips(potAmount)}</strong>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {sidePots.length > 0 && (
          <div className="pot__sides">
            {sidePots.map((p, i) => (
              <span key={i} className="pot__side">
                {i === 0 ? 'Main' : `Side ${i}`} {chipsShort(p.amount)}
              </span>
            ))}
          </div>
        )}
      </div>

      <CenterStatus state={state} resultVisible={resultVisible} portrait={portrait} center={center} />

      {/* Seats */}
      {state.seats.map((seat, i) => {
        const pos = posOf(i);
        if (!seat) {
          return (
            <EmptySeat key={`empty-${i}`} pos={pos} canSit={canSit} onClick={() => onSeatClick(i)} index={i} />
          );
        }
        const isMe = seat.userId === me;
        const mine = isMe && myCards && myCards.handNo === state.handNo && seat.inHand ? myCards.cards : null;
        const revealed = shown.get(i) ?? null;
        const sPx = px(pos, w, h);
        const toCenter = { x: cPx.x - sPx.x, y: cPx.y - sPx.y };
        const lay = layoutOf(i, isMe);
        return (
          <SeatView
            key={`${i}-${seat.userId}`}
            seat={seat}
            index={i}
            pos={pos}
            isMe={isMe}
            isTurn={state.toAct === i && state.phase !== 'showdown'}
            turnStartedAt={state.turnStartedAt}
            deadline={state.actionDeadline}
            handNo={state.handNo}
            mine={mine}
            revealed={revealed}
            offline={online != null && !seat.isBot && !online.has(seat.userId)}
            canClaim={canSit && !!seat.isBot && !seat.reservedFor}
            onClaim={() => onSeatClick(i)}
            winAmount={resultVisible ? payouts.get(i) ?? 0 : 0}
            displayStack={seat.stack - (resultVisible ? 0 : payouts.get(i) ?? 0)}
            dealDelays={pres.dealHand === state.handNo ? pres.dealDelays[i] ?? null : null}
            toCenter={toCenter}
            cardOffset={lay.cardOffset}
            cardMode={lay.cardMode}
            compact={portrait}
            highlight={highlightActive ? winningCards : null}
            board={state.board}
            showdown={state.phase === 'showdown'}
          />
        );
      })}

      {/* Bets in front of players */}
      <AnimatePresence>
        {state.seats.map((seat, i) => {
          if (!seat || seat.bet <= 0) return null;
          const pos = posOf(i);
          const betPos = layoutOf(i, seat.userId === me).bet;
          const from = px(pos, w, h);
          const to = px(betPos, w, h);
          return (
            <motion.div
              key={`bet-${state.handNo}-${state.phase}-${i}`}
              className="bet"
              style={{ left: `${betPos.x}%`, top: `${betPos.y}%` }}
              initial={{ x: from.x - to.x, y: from.y - to.y, opacity: 0, scale: 0.6 }}
              animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              exit={{ x: cPx.x - to.x, y: cPx.y - (POT_OFFSET(portrait) / 100) * h - to.y, opacity: 0, scale: 0.7, transition: { duration: 0.45, ease: 'easeIn' } }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
              <motion.span key={seat.bet} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="bet__inner">
                <ChipStack amount={seat.bet} />
              </motion.span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Dealer button */}
      {state.dealer >= 0 && state.seats[state.dealer] && state.phase !== 'waiting' && (
        <DealerButton at={layoutOf(state.dealer, state.seats[state.dealer]!.userId === me).dealer} />
      )}

      {/* Winnings flying from the pot */}
      <AnimatePresence>
        {resultVisible &&
          result?.payouts.map((p) => {
            const seatPos = posOf(p.seat);
            const potPos = { x: center.x, y: center.y - POT_OFFSET(portrait) };
            const a = px(potPos, w, h);
            const b = px(seatPos, w, h);
            return (
              <motion.div
                key={`payout-${result.handNo}-${p.seat}`}
                className="payout-fly"
                style={{ left: `${potPos.x}%`, top: `${potPos.y}%` }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: b.x - a.x, y: b.y - a.y, opacity: [1, 1, 0], scale: [1, 1.05, 0.7] }}
                transition={{ duration: 0.9, ease: [0.3, 0.7, 0.4, 1], times: [0, 0.75, 1] }}
              >
                <ChipStack amount={p.amount} label={false} max={7} />
              </motion.div>
            );
          })}
      </AnimatePresence>

      {/* Emoji reactions */}
      <div className="reactions-layer">
        <AnimatePresence>
          {reactions.map((r) => {
            const si = state.seats.findIndex((s) => s?.userId === r.userId);
            const pos = si >= 0 ? posOf(si) : { x: 92, y: 12 };
            return (
              <motion.div
                key={r.id}
                className="reaction-float"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                initial={{ opacity: 0, y: 0, scale: 0.3 }}
                animate={{ opacity: [0, 1, 1, 0], y: -avatarPx * 1.8, scale: [0.3, 1.4, 1.2, 1] }}
                transition={{ duration: 2.4, times: [0, 0.15, 0.75, 1], ease: 'easeOut' }}
              >
                <Emoji char={r.emoji} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CenterStatus({
  state,
  resultVisible,
  portrait,
  center,
}: {
  state: PublicState;
  resultVisible: boolean;
  portrait: boolean;
  center: Point;
}) {
  const now = useServerNow(250, state.nextHandAt != null);
  const result = state.phase === 'showdown' ? state.result : null;
  const top = center.y + (portrait ? 11.5 : 15);
  let content: React.ReactNode = null;
  let key = 'none';
  if (result && resultVisible) {
    key = `result-${result.handNo}`;
    const lines = result.pots
      .filter((p) => p.winners.length)
      .map((p, i) => {
        const names = p.winners.map((s) => state.seats[s]?.name ?? result.payouts.find((x) => x.seat === s)?.name ?? '—');
        const split = p.winners.length > 1;
        return (
          <div className="result__line" key={i}>
            {result.pots.length > 1 && <span className="result__pot">{p.label}</span>}
            <strong>{split ? `${names.join(' & ')} split` : `${names[0]} wins`}</strong> {chips(p.amount)}
            {p.handName && <span className="result__hand"> · {p.handName}</span>}
          </div>
        );
      });
    const nextIn = state.nextHandAt ? Math.max(0, Math.ceil((state.nextHandAt - now) / 1000)) : 0;
    content = (
      <div className="result">
        {lines}
        {nextIn > 0 && <div className="result__next">Next hand in {nextIn}s</div>}
      </div>
    );
  } else if (state.phase === 'waiting') {
    const seated = state.seats.filter(Boolean).length;
    key = state.nextHandAt ? 'starting' : `waiting-${seated}`;
    content = (
      <div className="status-pill">
        {state.nextHandAt
          ? `First hand in ${Math.max(0, Math.ceil((state.nextHandAt - now) / 1000))}…`
          : seated === 0
            ? 'Pick a seat to start'
            : 'Waiting for another player…'}
      </div>
    );
  }
  return (
    <div className="center-status" style={{ left: `${center.x}%`, top: `${top}%` }}>
      <AnimatePresence mode="wait">
        {content && (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DealerButton({ at }: { at: { x: number; y: number } }) {
  return (
    <motion.div
      className="dealer-btn"
      initial={false}
      animate={{ left: at.x, top: at.y }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
    >
      D
    </motion.div>
  );
}

function EmptySeat({ pos, canSit, onClick, index }: { pos: Point; canSit: boolean; onClick: () => void; index: number }) {
  return (
    <div className="seat seat--empty" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
      {canSit ? (
        <button className="seat__sit" onClick={onClick} aria-label={`Sit in seat ${index + 1}`}>
          <Plus size={18} />
          <span>Sit</span>
        </button>
      ) : (
        <span className="seat__placeholder" />
      )}
    </div>
  );
}

interface SeatViewProps {
  /** The viewer may take over this bot's seat. */
  canClaim: boolean;
  onClaim: () => void;
  seat: Seat;
  index: number;
  pos: Point;
  isMe: boolean;
  isTurn: boolean;
  turnStartedAt: number | null;
  deadline: number | null;
  handNo: number;
  mine: string[] | null;
  revealed: string[] | null;
  offline: boolean;
  winAmount: number;
  displayStack: number;
  dealDelays: [number, number] | null;
  toCenter: { x: number; y: number };
  cardOffset: { x: number; y: number };
  cardMode: CardMode;
  /** Phone layout: action label shown inside the name plate instead of a floating tag. */
  compact: boolean;
  highlight: Set<string> | null;
  board: string[];
  showdown: boolean;
}

const SeatView = memo(function SeatView(props: SeatViewProps) {
  const {
    seat,
    pos,
    isMe,
    isTurn,
    turnStartedAt,
    deadline,
    handNo,
    mine,
    revealed,
    offline,
    winAmount,
    displayStack,
    dealDelays,
    toCenter,
    cardOffset,
    cardMode,
    compact,
    highlight,
    board,
    showdown,
  } = props;
  const showHandStrength = useSettings((s) => s.showHandStrength);
  const hasCards = seat.inHand && !seat.folded;
  const faceCards = mine ?? revealed;
  const keepMine = isMe && seat.inHand && seat.folded && mine; // show my folded cards dimmed
  const cardsVisible = hasCards || keepMine;
  const strength = isMe && mine && showHandStrength && !seat.folded ? describeHolding([...mine, ...board]) : null;
  const status = seat.leaving ? 'Leaving' : seat.away ? 'Away' : seat.sittingOut ? (seat.stack <= 0 ? 'Busted' : 'Sitting out') : null;
  const label = seat.lastAction ? ACTION_LABEL[seat.lastAction.type] : null;
  const labelAmount =
    seat.lastAction && ['call', 'bet', 'raise', 'allin', 'sb', 'bb'].includes(seat.lastAction.type) && seat.lastAction.amount > 0
      ? chipsShort(seat.lastAction.amount)
      : '';

  const cardStyle: React.CSSProperties =
    cardMode === 'toward'
      ? { transform: `translate(calc(-50% + ${cardOffset.x}px), calc(-50% + ${cardOffset.y}px))` }
      : {};
  const actionText = label ? `${label}${labelAmount ? ` ${labelAmount}` : ''}` : null;
  // In the compact (phone) plate the first line shows what matters most right now.
  const plateLine = compact ? status ?? (strength && !seat.folded ? strength.name : null) ?? actionText ?? seat.name : seat.name;
  const plateTone = compact
    ? status
      ? 'status'
      : strength && !seat.folded
        ? 'strength'
        : actionText
          ? seat.lastAction?.type
          : null
    : null;

  return (
    <div
      className={clsx(
        'seat',
        isMe && 'seat--me',
        isTurn && 'is-turn',
        seat.folded && seat.inHand && 'is-folded',
        winAmount > 0 && 'is-winner',
        (seat.sittingOut || seat.away) && !seat.inHand && 'is-out',
        offline && 'is-offline',
        seat.allIn && 'is-allin',
      )}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, '--c': seat.color } as React.CSSProperties}
    >
      <div
        className={clsx('seat__cards', `seat__cards--${cardMode === 'toward' ? 'other' : cardMode}`, revealed && 'has-revealed')}
        style={cardStyle}
      >
        <AnimatePresence initial={false}>
          {cardsVisible &&
            [0, 1].map((k) => {
              const card = faceCards?.[k] ?? null;
              const delay = dealDelays ? dealDelays[k] : 0;
              const fromX = cardMode === 'toward' ? toCenter.x - cardOffset.x : toCenter.x;
              const fromY = cardMode === 'toward' ? toCenter.y - cardOffset.y : toCenter.y;
              return (
                <motion.div
                  key={`${handNo}-${k}`}
                  className={clsx('seat__card', `seat__card--${k}`)}
                  initial={dealDelays ? { x: fromX, y: fromY, opacity: 0, rotate: k ? 140 : -140, scale: 0.5 } : false}
                  animate={{ x: 0, y: 0, opacity: keepMine && !hasCards ? 0.45 : 1, rotate: 0, scale: 1 }}
                  exit={{
                    x: (fromX * 0.6),
                    y: (fromY * 0.6),
                    opacity: 0,
                    scale: 0.4,
                    rotate: k ? 60 : -60,
                    transition: { duration: 0.4, ease: 'easeIn' },
                  }}
                  transition={{ type: 'spring', stiffness: 210, damping: 24, delay }}
                >
                  <FlipCard
                    card={card}
                    revealDelay={dealDelays ? (delay + 0.4) * 1000 : 0}
                    size={isMe ? 'hero' : 'seat'}
                    highlight={!!(highlight && card && highlight.has(card))}
                    dim={!!(highlight && card && !highlight.has(card) && showdown)}
                  />
                </motion.div>
              );
            })}
        </AnimatePresence>
        {strength && !seat.folded && !compact && (
          <motion.div
            key={strength.name}
            className="seat__strength"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: dealDelays ? dealDelays[1] + 0.7 : 0.15 }}
          >
            {strength.name}
          </motion.div>
        )}
      </div>

      <div className="seat__avatar">
        <Emoji char={seat.avatar} className="seat__emoji" />
        {isTurn && turnStartedAt && deadline && !seat.isBot && <TimerRing startedAt={turnStartedAt} deadline={deadline} />}
        {isTurn && seat.isBot && (
          <span className="seat__thinking" aria-label="Thinking">
            <i />
            <i />
            <i />
          </span>
        )}
        {offline && (
          <span className="seat__badge seat__badge--offline" title="Disconnected">
            <WifiOff size={12} />
          </span>
        )}
        {!offline && seat.away && (
          <span className="seat__badge" title="Away">
            <Moon size={12} />
          </span>
        )}
        {seat.leaving && (
          <span className="seat__badge" title="Leaving">
            <LogOut size={12} />
          </span>
        )}
      </div>

      {seat.isBot && (seat.reservedFor || props.canClaim) && (
          seat.reservedFor ? (
            <span className="seat__claim seat__claim--reserved">
              <Emoji char={seat.reservedFor.avatar} /> next hand
            </span>
          ) : (
            <button className="seat__claim" onClick={props.onClaim} aria-label={`Take ${seat.name}'s seat`}>
              <Plus size={13} /> Sit
            </button>
          )
        )}
      <div className="seat__plate">
        {seat.isBot && <span className="seat__bot">BOT</span>}
        <span className={clsx('seat__name', plateTone && `seat__name--${plateTone}`)}>{plateLine}</span>
        <span className="seat__stack">{seat.allIn && displayStack === 0 ? 'ALL-IN' : chips(displayStack)}</span>
      </div>

      <AnimatePresence>
        {!compact && (status || label) && (
          <motion.span
            key={status ?? `${label}-${labelAmount}`}
            className={clsx('seat__tag', label && `seat__tag--${seat.lastAction?.type}`, status && 'seat__tag--status')}
            initial={{ opacity: 0, scale: 0.6, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
          >
            {status ?? `${label}${labelAmount ? ` ${labelAmount}` : ''}`}
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {winAmount > 0 && (
          <motion.div
            className="seat__win"
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -60, scale: [0.6, 1.2, 1, 1] }}
            transition={{ duration: 2.6, times: [0, 0.15, 0.8, 1], delay: 0.6 }}
          >
            +{chips(winAmount)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

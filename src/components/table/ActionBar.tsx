import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Minus, Plus, Coins, LogOut, Coffee, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LegalActions, PlayerAction, PublicState } from '../../../shared/poker/types';
import { potTotal } from '../../../shared/poker/engine';
import { chips } from '../../lib/format';
import { serverNow } from '../../lib/clock';
import { sound, vibrate } from '../../lib/sound';
import { PlayingCard } from '../PlayingCard';

export type PreAction = 'checkfold' | 'check' | 'callany' | null;

interface Props {
  state: PublicState;
  mySeat: number;
  legal: LegalActions;
  busy: boolean;
  preAction: PreAction;
  setPreAction: (p: PreAction) => void;
  onAct: (a: PlayerAction) => void;
  onSitIn: () => void;
  onSitOut: () => void;
  onAddChips: () => void;
  onStand: () => void;
  walletChips: number;
  /** The viewer's hole cards, echoed in the raise panel (which can cover the table on small screens). */
  myCards?: string[] | null;
  /** Seat claimed from a bot, waiting for the current hand to end. */
  claim?: { botName: string; buyIn: number } | null;
  onCancelClaim?: () => void;
}

export function ActionBar(props: Props) {
  const { state, mySeat, legal } = props;
  const seat = mySeat >= 0 ? state.seats[mySeat] : null;

  if (!seat && props.claim) {
    return (
      <div className="actionbar actionbar--idle">
        <div className="actionbar__hint">
          <span className="dot dot--live" /> You're taking {props.claim.botName}'s seat — you'll be dealt in when this hand ends
        </div>
        <button className="btn btn--ghost btn--sm" onClick={props.onCancelClaim} disabled={props.busy}>
          Cancel
        </button>
      </div>
    );
  }

  if (!seat) {
    return (
      <div className="actionbar actionbar--idle">
        <div className="actionbar__hint">
          <span className="dot dot--live" /> You're watching · tap an open <strong>Sit</strong> spot to join
        </div>
        <div className="actionbar__wallet">
          <Coins size={14} /> {chips(props.walletChips)}
        </div>
      </div>
    );
  }

  if (legal.canAct) return <TurnControls {...props} />;

  const inHand = seat.inHand && !seat.folded && !seat.allIn && state.phase !== 'showdown' && state.phase !== 'waiting';
  const busted = seat.stack + seat.pendingTopUp <= 0;

  return (
    <div className="actionbar actionbar--idle">
      {inHand ? (
        <div className="preactions">
          <PreToggle label="Check / Fold" active={props.preAction === 'checkfold'} onClick={() => props.setPreAction(props.preAction === 'checkfold' ? null : 'checkfold')} />
          <PreToggle label="Check" active={props.preAction === 'check'} onClick={() => props.setPreAction(props.preAction === 'check' ? null : 'check')} />
          <PreToggle label="Call any" active={props.preAction === 'callany'} onClick={() => props.setPreAction(props.preAction === 'callany' ? null : 'callany')} />
        </div>
      ) : (
        <div className="seatctl">
          {busted ? (
            <button className="btn btn--gold" onClick={props.onAddChips} disabled={props.busy}>
              <Coins size={16} /> Rebuy
            </button>
          ) : seat.sittingOut || seat.away ? (
            <button className="btn btn--mint" onClick={props.onSitIn} disabled={props.busy || seat.leaving}>
              <Play size={16} /> I'm back
            </button>
          ) : (
            <button className="btn btn--ghost" onClick={props.onSitOut} disabled={props.busy}>
              <Coffee size={16} /> Sit out
            </button>
          )}
          {!busted && (
            <button className="btn btn--ghost" onClick={props.onAddChips} disabled={props.busy || seat.leaving}>
              <Plus size={16} /> Chips
            </button>
          )}
          <button className="btn btn--ghost" onClick={props.onStand} disabled={props.busy || seat.leaving}>
            <LogOut size={16} /> {seat.leaving ? 'Leaving…' : 'Stand up'}
          </button>
        </div>
      )}
      <div className="actionbar__status">
        {seat.allIn && seat.inHand && state.phase !== 'showdown'
          ? 'All-in — good luck!'
          : seat.folded && state.phase !== 'showdown'
            ? 'Folded · waiting for next hand'
            : !seat.inHand && state.phase !== 'waiting' && state.phase !== 'showdown'
              ? seat.sittingOut
                ? 'Sitting out'
                : 'You will be dealt in next hand'
              : seat.pendingTopUp > 0
                ? `+${chips(seat.pendingTopUp)} added next hand`
                : ''}
      </div>
    </div>
  );
}

function PreToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={clsx('pretoggle', active && 'is-on')} onClick={onClick} aria-pressed={active}>
      <span className="pretoggle__box" />
      {label}
    </button>
  );
}

function TurnControls({ state, mySeat, legal, busy, onAct, myCards }: Props) {
  const seat = state.seats[mySeat]!;
  const [raising, setRaising] = useState(false);
  const bb = state.config.bigBlind;
  const pot = potTotal(state);
  const [amount, setAmount] = useState(legal.minRaiseTo);
  useEffect(() => {
    setAmount(legal.minRaiseTo);
    setRaising(false);
  }, [legal.minRaiseTo, state.turnStartedAt]);

  // Countdown warnings for the active player.
  useEffect(() => {
    if (!state.actionDeadline) return;
    let last = -1;
    const id = window.setInterval(() => {
      const left = Math.ceil((state.actionDeadline! - serverNow()) / 1000);
      if (left !== last && left <= 5 && left > 0) {
        sound.play(left <= 3 ? 'urgent' : 'tick');
        if (left === 5) vibrate(60);
      }
      last = left;
    }, 200);
    return () => clearInterval(id);
  }, [state.actionDeadline]);

  const presets = useMemo(() => {
    if (!legal.canRaise) return [];
    const potAfterCall = pot + legal.callAmount;
    const make = (label: string, to: number) => ({
      label,
      to: Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(to))),
    });
    const list = [
      make('Min', legal.minRaiseTo),
      make('½ Pot', state.currentBet + potAfterCall * 0.5),
      make('¾ Pot', state.currentBet + potAfterCall * 0.75),
      make('Pot', state.currentBet + potAfterCall),
      make('All-in', legal.maxRaiseTo),
    ];
    return list;
  }, [legal, pot, state.currentBet]);

  const clamp = (v: number) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v)));
  const isAllIn = amount >= legal.maxRaiseTo;
  const verb = legal.isBet ? 'Bet' : 'Raise to';

  const keyRef = useRef({ legal, amount, raising, busy });
  keyRef.current = { legal, amount, raising, busy };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && (t as HTMLInputElement).type !== 'range') return;
      const { legal: l, amount: a, raising: r, busy: b } = keyRef.current;
      if (b) return;
      const k = e.key.toLowerCase();
      if (k === 'f') onAct({ type: 'fold' });
      else if (k === 'c' || k === 'k') onAct(l.canCheck ? { type: 'check' } : { type: 'call' });
      else if (k === 'r' && l.canRaise) setRaising(true);
      else if (k === 'enter' && r) onAct(a >= l.maxRaiseTo ? { type: 'allin' } : { type: l.isBet ? 'bet' : 'raise', amount: a });
      else if (k === 'escape') setRaising(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAct]);

  return (
    <motion.div
      className="actionbar actionbar--turn"
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <AnimatePresence>
        {raising && legal.canRaise && (
          <motion.div
            className="raise"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <div className="raise__presets">
              {presets.map((p) => (
                <button
                  key={p.label}
                  className={clsx('chip-btn', amount === p.to && 'is-on')}
                  onClick={() => {
                    setAmount(p.to);
                    sound.play('click');
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="raise__slider">
              {myCards && myCards.length === 2 && (
                <span className="raise__hand" aria-label="Your cards">
                  <PlayingCard card={myCards[0]} size="mini" />
                  <PlayingCard card={myCards[1]} size="mini" />
                </span>
              )}
              <button className="icon-btn icon-btn--round" aria-label="Decrease" onClick={() => setAmount((v) => clamp(v - bb))}>
                <Minus size={16} />
              </button>
              <input
                type="range"
                min={legal.minRaiseTo}
                max={legal.maxRaiseTo}
                step={1}
                value={amount}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  // Snap to big blinds except at the very top (all-in).
                  const snapped = raw >= legal.maxRaiseTo ? legal.maxRaiseTo : Math.round(raw / bb) * bb;
                  setAmount(clamp(snapped));
                }}
                aria-label="Bet size"
                style={{ '--p': `${((amount - legal.minRaiseTo) / Math.max(1, legal.maxRaiseTo - legal.minRaiseTo)) * 100}%` } as React.CSSProperties}
              />
              <button className="icon-btn icon-btn--round" aria-label="Increase" onClick={() => setAmount((v) => clamp(v + bb))}>
                <Plus size={16} />
              </button>
              <input
                className="raise__input"
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/[^0-9]/g, ''));
                  if (Number.isFinite(v)) setAmount(Math.min(legal.maxRaiseTo, v));
                }}
                onBlur={() => setAmount((v) => clamp(v))}
                aria-label="Amount"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="actions">
        <button className="btn btn--fold" disabled={busy} onClick={() => onAct({ type: 'fold' })}>
          Fold <kbd>F</kbd>
        </button>
        {legal.canCheck ? (
          <button className="btn btn--call" disabled={busy} onClick={() => onAct({ type: 'check' })}>
            Check <kbd>C</kbd>
          </button>
        ) : (
          <button className="btn btn--call" disabled={busy} onClick={() => onAct({ type: 'call' })}>
            {legal.callIsAllIn ? 'All-in' : 'Call'} <span className="btn__amt">{chips(legal.callAmount)}</span>
            <kbd>C</kbd>
          </button>
        )}
        {legal.canRaise &&
          (raising ? (
            <button
              className={clsx('btn', isAllIn ? 'btn--allin' : 'btn--raise')}
              disabled={busy || amount < legal.minRaiseTo}
              onClick={() =>
                onAct(isAllIn ? { type: 'allin' } : { type: legal.isBet ? 'bet' : 'raise', amount })
              }
            >
              {isAllIn ? 'All-in' : verb} <span className="btn__amt">{chips(amount)}</span>
            </button>
          ) : (
            <button
              className="btn btn--raise"
              disabled={busy}
              onClick={() => {
                setRaising(true);
                sound.play('click');
              }}
            >
              {legal.isBet ? 'Bet' : 'Raise'} <kbd>R</kbd>
            </button>
          ))}
      </div>
      <div className="actionbar__meta">
        <span>
          Stack <strong>{chips(seat.stack)}</strong>
        </span>
        <span>
          Pot <strong>{chips(pot)}</strong>
        </span>
      </div>
    </motion.div>
  );
}

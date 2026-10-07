import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowCounterClockwiseIcon, CoinsIcon, HandIcon, HandPalmIcon, SignOutIcon, XIcon } from '@phosphor-icons/react';
import { Chip } from '../Chips';
import { chips, chipsShort } from '../../lib/format';
import { serverNow } from '../../lib/clock';
import { sound } from '../../lib/sound';
import { DEALER_CARD_MS, bjLegal, handTotal, totalLabel } from '../../../shared/blackjack/engine';
import type { BjAction, BjPublicState } from '../../../shared/blackjack/types';

export const BJ_CHIPS: { value: number; color: string; edge: string }[] = [
  { value: 10, color: '#2f6fd8', edge: '#e0ecff' },
  { value: 25, color: '#21a35f', edge: '#e2fff0' },
  { value: 100, color: '#22252e', edge: '#d9dce6' },
  { value: 500, color: '#7c5cf0', edge: '#ece6ff' },
  { value: 1_000, color: '#e8b923', edge: '#fff6d6' },
  { value: 5_000, color: '#f07a2a', edge: '#ffe8d6' },
  { value: 25_000, color: '#22b8d8', edge: '#e0f8ff' },
];

interface Props {
  state: BjPublicState;
  mySeat: number;
  wallet: number;
  busy: boolean;
  resultsVisible: boolean;
  pending: number;
  setPending(n: number): void;
  onBet(amount: number): void;
  onClear(): void;
  onAct(a: BjAction): void;
  onStand(): void;
}

export function BlackjackBar({ state, mySeat, wallet, busy, resultsVisible, pending, setPending, onBet, onClear, onAct, onStand }: Props) {
  const seat = mySeat >= 0 ? state.seats[mySeat] : null;
  const legal = useMemo(() => bjLegal(state, mySeat), [state, mySeat]);
  const { minBet, maxBet } = state.config;
  const [, force] = useState(0);

  // Betting opens again a moment after the results show.
  const openAt = state.phase === 'settled' && state.settledAt ? state.settledAt + 1500 + state.dealerDraws * DEALER_CARD_MS : 0;
  const canBetNow = !!seat && !seat.leaving && seat.bet === 0 && (state.phase === 'betting' || (state.phase === 'settled' && serverNow() >= openAt));
  // My turn starts once the deal animation has finished.
  const turnLive = legal.canAct && (state.turnStartedAt ?? 0) <= serverNow() + 50;
  useEffect(() => {
    const waits = [openAt, legal.canAct ? state.turnStartedAt ?? 0 : 0].filter((t) => t > serverNow());
    if (!waits.length) return;
    const id = window.setTimeout(() => force((x) => x + 1), Math.min(...waits) - serverNow() + 20);
    return () => clearTimeout(id);
  }, [openAt, legal.canAct, state.turnStartedAt]);

  // Keyboard: H hit, S stand, D double, P split, Enter deal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (turnLive && !busy) {
        if (k === 'h' && legal.canHit) onAct('hit');
        else if (k === 's' && legal.canStand) onAct('stand');
        else if (k === 'd' && legal.canDouble && wallet >= legal.cost) onAct('double');
        else if (k === 'p' && legal.canSplit && wallet >= legal.cost) onAct('split');
        else return;
        e.preventDefault();
      } else if (canBetNow && !busy && k === 'enter' && pending >= minBet) {
        e.preventDefault();
        onBet(pending);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turnLive, busy, legal, wallet, onAct, canBetNow, pending, minBet, onBet]);

  if (!seat) {
    return (
      <div className="actionbar actionbar--idle bj-bar">
        <span className="actionbar__hint">
          <HandPalmIcon size={18} /> Pick an open seat to play against the dealer.
        </span>
        <span className="actionbar__wallet">
          <CoinsIcon size={16} weight="fill" /> {chips(wallet)}
        </span>
      </div>
    );
  }

  const leave = (
    <button className="btn btn--ghost btn--sm bj-bar__leave" onClick={onStand} disabled={busy} title="Leave your seat">
      <SignOutIcon size={15} /> <span className="hide-sm">Stand up</span>
    </button>
  );

  // --- My turn ---------------------------------------------------------------
  if (turnLive) {
    const hand = seat.hands[state.handIdx];
    const short = wallet < legal.cost;
    return (
      <div className="actionbar actionbar--turn bj-bar">
        <div className="bj-bar__status">
          <span>
            {seat.hands.length > 1 ? `Hand ${state.handIdx + 1} of ${seat.hands.length}: ` : 'Your hand: '}
            <strong>{totalLabel(hand.cards)}</strong>
          </span>
          <span className="muted">Dealer shows {totalLabel(state.dealer.slice(0, 1))}</span>
        </div>
        <div className="actions bj-actions">
          <button className="btn btn--call" disabled={busy || !legal.canHit} onClick={() => onAct('hit')}>
            Hit <kbd>H</kbd>
          </button>
          <button className="btn btn--fold" disabled={busy} onClick={() => onAct('stand')}>
            Stand <kbd>S</kbd>
          </button>
          {legal.canDouble && (
            <button className="btn btn--raise" disabled={busy || short} onClick={() => onAct('double')} title={short ? 'Not enough chips in your wallet' : undefined}>
              Double <span className="btn__amt">+{chipsShort(legal.cost)}</span> <kbd>D</kbd>
            </button>
          )}
          {legal.canSplit && (
            <button className="btn btn--allin" disabled={busy || short} onClick={() => onAct('split')} title={short ? 'Not enough chips in your wallet' : undefined}>
              Split <span className="btn__amt">+{chipsShort(legal.cost)}</span> <kbd>P</kbd>
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- Betting -----------------------------------------------------------------
  if (canBetNow) {
    const cap = Math.min(maxBet, wallet);
    const add = (v: number) => {
      const next = Math.min(cap, pending + v);
      if (next !== pending) sound.play('chip');
      setPending(next);
    };
    const tooLow = pending < minBet;
    return (
      <div className="actionbar bj-bar bj-bar--bet">
        <div className="bj-chiptray" role="group" aria-label="Add chips to your bet">
          {BJ_CHIPS.map((c) => (
            <button key={c.value} className="bj-chipbtn" disabled={busy || pending + c.value > cap} onClick={() => add(c.value)} aria-label={`Add ${chips(c.value)}`}>
              <Chip color={c.color} edge={c.edge} />
              <span>{chipsShort(c.value)}</span>
            </button>
          ))}
        </div>
        <div className="bj-bar__row">
          <div className="bj-betinfo">
            <small>Your bet</small>
            <strong>{chips(pending)}</strong>
            <em>
              Wallet {chipsShort(wallet)} · {chipsShort(minBet)}–{chipsShort(maxBet)}
            </em>
          </div>
          <button className="icon-btn" disabled={busy || pending === 0} onClick={() => setPending(0)} aria-label="Clear bet" title="Clear">
            <XIcon size={16} />
          </button>
          <button className="btn btn--ghost btn--sm" disabled={busy || pending * 2 > cap || pending === 0} onClick={() => setPending(pending * 2)}>
            ×2
          </button>
          <button className="btn btn--ghost btn--sm" disabled={busy || pending < minBet * 2} onClick={() => setPending(Math.max(minBet, Math.floor(pending / 2 / 5) * 5))}>
            ½
          </button>
          {seat.lastBet > 0 && seat.lastBet !== pending && (
            <button className="btn btn--ghost btn--sm" disabled={busy || seat.lastBet > cap} onClick={() => setPending(seat.lastBet)} title="Same as last time">
              <ArrowCounterClockwiseIcon size={14} /> {chipsShort(seat.lastBet)}
            </button>
          )}
          <button className="btn btn--gold bj-deal" disabled={busy || tooLow || pending > cap} onClick={() => onBet(pending)}>
            {wallet < minBet ? 'Not enough chips' : tooLow ? `Min bet ${chipsShort(minBet)}` : `Deal ${chipsShort(pending)}`}
          </button>
          {leave}
        </div>
      </div>
    );
  }

  // --- Waiting -------------------------------------------------------------------
  let text: React.ReactNode;
  if (seat.bet > 0 && state.phase === 'betting') {
    text = (
      <>
        <strong>{chips(seat.bet)}</strong> bet placed. Dealing when everyone is in
        {state.bettingDeadline ? <Countdown to={state.bettingDeadline} /> : null}.
      </>
    );
  } else if (state.phase === 'playing') {
    const turn = state.seats[state.toAct];
    const mine = seat.hands.length ? seat.hands.map((x) => totalLabel(x.cards)).join(' · ') : null;
    text =
      legal.canAct
        ? 'Dealing…'
        : turn
          ? `${mine ? `You: ${mine}. ` : ''}Waiting for ${turn.name}…`
          : 'Dealer is playing…';
  } else if (state.phase === 'settled') {
    const net = seat.hands.reduce((a, x) => a + x.payout - x.bet, 0);
    text = !resultsVisible ? (
      'Dealer is playing…'
    ) : seat.hands.length === 0 ? (
      'Place a bet to join the next round.'
    ) : net > 0 ? (
      <span className="bj-result is-win">
        {seat.hands.some((x) => x.outcome === 'blackjack') ? 'Blackjack! ' : 'You win '}+{chips(net)}
      </span>
    ) : net < 0 ? (
      <span className="bj-result is-lose">You lose {chips(-net)}</span>
    ) : (
      <span className="bj-result">Push — your bet is back</span>
    );
  } else {
    text = 'Waiting for players…';
  }

  return (
    <div className="actionbar actionbar--idle bj-bar">
      <AnimatePresence mode="wait">
        <motion.span key={String(state.phase) + state.toAct + (resultsVisible ? 'r' : '')} className="actionbar__hint" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <HandIcon size={18} /> <span>{text}</span>
        </motion.span>
      </AnimatePresence>
      <div className="bj-bar__right">
        {seat.bet > 0 && state.phase === 'betting' && (
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={onClear}>
            Change bet
          </button>
        )}
        {leave}
      </div>
    </div>
  );
}

function Countdown({ to }: { to: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.ceil((to - serverNow()) / 1000));
  return <span className="bj-countdown"> ({s}s)</span>;
}

/** Total of the cards a player can currently see in their hand. */
export function visibleTotal(cards: string[]) {
  return handTotal(cards).total;
}

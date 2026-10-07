import { useEffect, useMemo, useState } from 'react';
import { ArrowCounterClockwiseIcon, CoinsIcon, HandIcon, HandPalmIcon, SignOutIcon, XIcon } from '@phosphor-icons/react';
import { Chip } from '../Chips';
import { Dock } from '../table/Dock';
import { chips, chipsShort } from '../../lib/format';
import { serverNow } from '../../lib/clock';
import { sound } from '../../lib/sound';
import { DEALER_CARD_MS, bjLegal, handTotal, totalLabel } from '../../../shared/blackjack/engine';
import type { BjAction, BjPublicState } from '../../../shared/blackjack/types';

export const BJ_CHIPS: { value: number; label: string; color: string; edge: string }[] = [
  { value: 10, label: '10', color: '#2f6fd8', edge: '#e0ecff' },
  { value: 25, label: '25', color: '#21a35f', edge: '#e2fff0' },
  { value: 100, label: '100', color: '#22252e', edge: '#d9dce6' },
  { value: 500, label: '500', color: '#7c5cf0', edge: '#ece6ff' },
  { value: 1_000, label: '1K', color: '#e8b923', edge: '#fff6d6' },
  { value: 5_000, label: '5K', color: '#f07a2a', edge: '#ffe8d6' },
  { value: 25_000, label: '25K', color: '#22b8d8', edge: '#e0f8ff' },
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
  // Nothing picked yet: the main button repeats the last bet in one tap.
  const rebetOk = !!seat && seat.lastBet >= minBet && seat.lastBet <= Math.min(maxBet, wallet);
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
      } else if (canBetNow && !busy && k === 'enter' && (pending >= minBet || (pending === 0 && rebetOk))) {
        e.preventDefault();
        onBet(pending || seat!.lastBet);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turnLive, busy, legal, wallet, onAct, canBetNow, pending, minBet, onBet, rebetOk, seat]);

  if (!seat) {
    return (
      <Dock
        mode="watch"
        className="bj-bar"
        main={
          <span className="actionbar__hint">
            <HandPalmIcon size={18} /> Pick an open seat to play against the dealer
          </span>
        }
        sub={
          <span className="actionbar__wallet">
            <CoinsIcon size={14} weight="fill" /> {chips(wallet)}
          </span>
        }
      />
    );
  }

  const leave = (
    <button className="dock-btn" onClick={onStand} disabled={busy} title="Leave your seat" aria-label="Stand up">
      <SignOutIcon size={14} /> <span className="hide-sm">Stand up</span>
    </button>
  );
  const walletInfo = (
    <span className="bj-wallet">
      <CoinsIcon size={13} weight="fill" /> {chipsShort(wallet)}
      <span className="hide-sm"> · bets {chipsShort(minBet)}–{chipsShort(maxBet)}</span>
    </span>
  );

  // --- My turn ---------------------------------------------------------------
  if (turnLive) {
    const hand = seat.hands[state.handIdx];
    const short = wallet < legal.cost;
    return (
      <Dock
        mode="turn"
        turn
        className="bj-bar"
        main={
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
        }
        sub={
          <span className="bj-bar__status">
            <span>
              {seat.hands.length > 1 ? `Hand ${state.handIdx + 1} of ${seat.hands.length}` : 'Your hand'} <strong>{totalLabel(hand.cards)}</strong>
            </span>
            <span>
              Dealer shows <strong>{totalLabel(state.dealer.slice(0, 1))}</strong>
            </span>
          </span>
        }
      />
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
      <Dock
        mode="bet"
        className="bj-bar"
        main={
          <div className="bj-betrow">
            <div className="bj-chiptray" role="group" aria-label="Add chips to your bet">
              {BJ_CHIPS.map((c) => (
                <button key={c.value} className="bj-chipbtn" disabled={busy || pending + c.value > cap} onClick={() => add(c.value)} aria-label={`Add ${chips(c.value)}`}>
                  <Chip color={c.color} edge={c.edge} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
            {pending === 0 && rebetOk ? (
              <button className="btn btn--gold bj-deal" disabled={busy} onClick={() => onBet(seat.lastBet)}>
                <ArrowCounterClockwiseIcon size={16} weight="bold" /> Rebet {chipsShort(seat.lastBet)}
              </button>
            ) : (
              <button className="btn btn--gold bj-deal" disabled={busy || tooLow || pending > cap} onClick={() => onBet(pending)}>
                {wallet < minBet ? 'Wallet empty' : pending === 0 ? 'Add chips' : tooLow ? `Min ${chipsShort(minBet)}` : `Deal ${chipsShort(pending)}`}
              </button>
            )}
          </div>
        }
        sub={
          <div className="dock__split">
            <div className="bj-tools">
              <button className="dock-btn" disabled={busy || pending === 0} onClick={() => setPending(0)} aria-label="Clear bet" title="Clear">
                <XIcon size={12} weight="bold" /> <span className="hide-sm">Clear</span>
              </button>
              <button className="dock-btn" disabled={busy || pending * 2 > cap || pending === 0} onClick={() => setPending(pending * 2)} aria-label="Double the bet">
                ×2
              </button>
              <button className="dock-btn" disabled={busy || pending < minBet * 2} onClick={() => setPending(Math.max(minBet, Math.floor(pending / 2 / 5) * 5))} aria-label="Halve the bet">
                ½
              </button>
              {seat.lastBet > 0 && pending > 0 && (
                <button className="dock-btn" disabled={busy || seat.lastBet > cap || seat.lastBet === pending} onClick={() => setPending(seat.lastBet)} title="Same as last time" aria-label="Same bet as last time">
                  <ArrowCounterClockwiseIcon size={12} weight="bold" /> {chipsShort(seat.lastBet)}
                </button>
              )}
            </div>
            {walletInfo}
            {leave}
          </div>
        }
      />
    );
  }

  // --- Waiting -------------------------------------------------------------------
  let text: React.ReactNode;
  if (seat.bet > 0 && state.phase === 'betting') {
    text = (
      <>
        <strong>{chips(seat.bet)}</strong> bet placed · dealing when everyone is in
        {state.bettingDeadline ? <Countdown to={state.bettingDeadline} /> : null}
      </>
    );
  } else if (state.phase === 'playing') {
    const turn = state.seats[state.toAct];
    const mine = seat.hands.length ? seat.hands.map((x) => totalLabel(x.cards)).join(' · ') : null;
    text = legal.canAct ? 'Dealing…' : turn ? `${mine ? `You: ${mine} · ` : ''}Waiting for ${turn.name}…` : 'Dealer is playing…';
  } else if (state.phase === 'settled') {
    const net = seat.hands.reduce((a, x) => a + x.payout - x.bet, 0);
    text = !resultsVisible ? (
      'Dealer is playing…'
    ) : seat.hands.length === 0 ? (
      'Place a bet to join the next round'
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
    <Dock
      mode={`wait:${state.phase}:${state.toAct}:${resultsVisible ? 'r' : ''}:${seat.bet > 0 ? 'b' : ''}`}
      className="bj-bar"
      main={
        <span className="actionbar__hint bj-bar__text">
          <HandIcon size={18} /> <span>{text}</span>
        </span>
      }
      sub={
        <div className="dock__split">
          <div className="bj-tools">
            {seat.bet > 0 && state.phase === 'betting' && (
              <button className="dock-btn" disabled={busy} onClick={onClear}>
                Change bet
              </button>
            )}
          </div>
          {walletInfo}
          {leave}
        </div>
      }
    />
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

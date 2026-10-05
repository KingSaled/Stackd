/**
 * Turns discrete state updates into a staged, animated presentation:
 *  - deal animation timing for a new hand,
 *  - staggered board card reveals (with dramatic pauses during all-in run-outs),
 *  - when to reveal showdown results (after the last card lands),
 *  - which sounds to play and when.
 *
 * Computed synchronously during render from the previous state so motion
 * components get the right delays on their first mount.
 */
import { useEffect, useRef, useState } from 'react';
import type { PublicState } from '../../shared/poker/types';
import type { SoundName } from '../lib/sound';

export interface SoundCue {
  sound: SoundName;
  delay: number;
  count?: number;
}

export interface Presentation {
  /** Hand number whose deal should be animated (-1: none). */
  dealHand: number;
  /** Per-seat [card1, card2] deal delays in seconds. */
  dealDelays: Record<number, [number, number]>;
  /** Board card reveal delays (seconds, relative to arrival). */
  boardDelays: number[];
  /** performance.now() timestamp at which results become visible. */
  resultAt: number;
  cues: SoundCue[];
  cueId: number;
}

const STREET_PAUSE = 0.55;
const RUNOUT_PAUSE = 1.5;

function compute(prev: PublicState | null, next: PublicState, before: Presentation, myUserId: string): Presentation {
  const now = performance.now();
  const p: Presentation = { ...before, cues: [], cueId: before.cueId };
  if (!prev) {
    p.dealHand = -1;
    p.boardDelays = next.board.map(() => 0);
    p.resultAt = now;
    return p;
  }

  const newHand = next.handNo !== prev.handNo;
  const cues: SoundCue[] = [];

  if (newHand && next.phase !== 'waiting') {
    p.dealHand = next.handNo;
    p.dealDelays = {};
    p.boardDelays = [];
    p.resultAt = now;
    const n = next.seats.length;
    const order: number[] = [];
    for (let k = 1; k <= n; k++) {
      const i = (next.dealer + k) % n;
      if (next.seats[i]?.inHand) order.push(i);
    }
    order.forEach((seat, j) => {
      const d1 = 0.12 + j * 0.085;
      const d2 = 0.12 + (order.length + j) * 0.085;
      p.dealDelays[seat] = [d1, d2];
      cues.push({ sound: 'deal', delay: d1 }, { sound: 'deal', delay: d2 });
    });
    cues.push({ sound: 'chip', delay: 0.05 });
  }

  // Board reveals.
  const prevLen = newHand ? 0 : prev.board.length;
  let lastCard = 0;
  if (next.board.length > prevLen) {
    const delays = p.boardDelays.slice(0, prevLen);
    const runout = next.runoutFrom != null;
    const streetOf = (i: number) => (i < 3 ? 0 : i === 3 ? 1 : 2);
    let base = newHand ? 1 : 0.25;
    let lastStreet = -1;
    for (let i = prevLen; i < next.board.length; i++) {
      const st = streetOf(i);
      if (lastStreet !== -1 && st !== lastStreet) base += runout ? RUNOUT_PAUSE : STREET_PAUSE;
      lastStreet = st;
      delays[i] = base + (st === 0 ? i * 0.14 : 0);
      cues.push({ sound: 'flip', delay: delays[i] + 0.02 });
      lastCard = Math.max(lastCard, delays[i]);
    }
    p.boardDelays = delays;
  }

  // Betting sounds.
  if (!newHand) {
    next.seats.forEach((seat, i) => {
      const before = prev.seats[i];
      if (!seat) return;
      if (!before || before.userId !== seat.userId) {
        cues.push({ sound: 'join', delay: 0 });
        return;
      }
      const a = seat.lastAction;
      const b = before.lastAction;
      if (!a || (b && a.type === b.type && a.amount === b.amount)) return;
      switch (a.type) {
        case 'check':
          cues.push({ sound: 'check', delay: 0 });
          break;
        case 'call':
          cues.push({ sound: 'chips', delay: 0, count: 3 });
          break;
        case 'bet':
        case 'raise':
          cues.push({ sound: 'chips', delay: 0, count: 5 });
          break;
        case 'allin':
          cues.push({ sound: 'allin', delay: 0 });
          break;
        case 'fold':
          cues.push({ sound: 'fold', delay: 0 });
          break;
      }
    });
    const prevBets = prev.seats.reduce((a, s) => a + (s?.bet ?? 0), 0);
    if (prev.phase !== next.phase && prevBets > 0) cues.push({ sound: 'chips', delay: 0.15, count: 4 });
  }

  // Results.
  const resultIsNew =
    next.phase === 'showdown' &&
    next.result &&
    (prev.phase !== 'showdown' || prev.result?.handNo !== next.result.handNo);
  if (resultIsNew && next.result) {
    const flip = next.result.uncontested ? 0.45 : 1.0;
    const wait = Math.max(flip, lastCard ? lastCard + 0.75 : 0);
    p.resultAt = now + wait * 1000;
    const mine = next.result.payouts.find((x) => x.userId === myUserId);
    if (mine) {
      const big = mine.amount >= next.config.bigBlind * 50;
      cues.push({ sound: big ? 'bigwin' : 'win', delay: wait + 0.1 });
    } else {
      cues.push({ sound: 'pot', delay: wait + 0.1 });
    }
  }

  // My turn.
  const mySeat = next.seats.findIndex((s) => s?.userId === myUserId);
  if (
    mySeat >= 0 &&
    next.toAct === mySeat &&
    (prev.toAct !== mySeat || prev.turnStartedAt !== next.turnStartedAt)
  ) {
    cues.push({ sound: 'turn', delay: Math.max(0.2, lastCard + 0.2) });
  }

  if (cues.length) {
    p.cues = cues;
    p.cueId = before.cueId + 1;
  }
  return p;
}

export function usePresentation(state: PublicState | null, myUserId: string) {
  const lastState = useRef<PublicState | null>(null);
  const pres = useRef<Presentation>({ dealHand: -1, dealDelays: {}, boardDelays: [], resultAt: 0, cues: [], cueId: 0 });
  if (state && state !== lastState.current) {
    pres.current = compute(lastState.current, state, pres.current, myUserId);
    lastState.current = state;
  }
  const current = pres.current;

  // Re-render exactly when results should appear.
  const [, force] = useState(0);
  const resultVisible = performance.now() >= current.resultAt;
  useEffect(() => {
    if (resultVisible) return;
    const id = window.setTimeout(() => force((x) => x + 1), Math.max(0, current.resultAt - performance.now()) + 5);
    return () => clearTimeout(id);
  }, [current.resultAt, resultVisible]);

  return { ...current, resultVisible };
}

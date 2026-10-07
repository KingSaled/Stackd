/**
 * When each card of a blackjack round becomes visible, in server time, so every
 * viewer sees the same staged deal: one card to each player, the dealer's up
 * card, a second card to each player, then the face-down hole card. When the
 * round settles the hole card turns over and the dealer's draws follow one by
 * one; results show once the dealer is done.
 */
import { DEAL_CARD_MS, DEALER_CARD_MS } from '../../../shared/blackjack/engine';
import type { BjPublicState } from '../../../shared/blackjack/types';

export interface BjTimeline {
  playerCard(seat: number, hand: number, idx: number): number;
  dealerCard(idx: number): number;
  holeAt: number;
  /** When the hole card turns face up (null while it is still hidden). */
  revealAt: number | null;
  resultsAt: number | null;
  /** Every timestamp at which something new appears. */
  events: number[];
}

export function bjTimeline(s: BjPublicState): BjTimeline {
  const order: number[] = [];
  s.seats.forEach((seat, i) => {
    if (seat && seat.hands.length > 0) order.push(i);
  });
  const base = s.dealtAt ?? 0;
  const slot = (k: number) => base + k * DEAL_CARD_MS;
  const n = order.length;
  const settled = s.phase === 'settled' && s.settledAt != null;
  const reveal = settled ? s.settledAt! : null;

  const playerCard = (seat: number, hand: number, idx: number) => {
    const pos = order.indexOf(seat);
    if (pos < 0 || hand > 0 || idx > 1) return 0;
    // After a split the first hand's second card was drawn later, mid-round.
    if (idx === 1 && (s.seats[seat]?.hands.length ?? 0) > 1) return 0;
    return idx === 0 ? slot(pos) : slot(n + 1 + pos);
  };
  const holeAt = slot(2 * n + 1);
  const dealerCard = (idx: number) => {
    if (idx === 0) return slot(n);
    if (idx === 1) return holeAt;
    return reveal == null ? 0 : reveal + 500 + (idx - 2) * DEALER_CARD_MS;
  };
  const resultsAt = settled ? s.settledAt! + 500 + s.dealerDraws * DEALER_CARD_MS + 250 : null;

  const events: number[] = [];
  if (s.dealtAt) for (let k = 0; k <= 2 * n + 1; k++) events.push(slot(k));
  if (reveal != null) {
    events.push(reveal);
    for (let k = 2; k < s.dealer.length; k++) events.push(dealerCard(k));
  }
  if (resultsAt) events.push(resultsAt);
  return { playerCard, dealerCard, holeAt, revealAt: reveal, resultsAt, events };
}

import type { Card } from './cards';
import type { EngineState, PublicState, SecretState } from './types';

/** Strip every secret (deck, unrevealed hole cards) from the engine state. */
export function toPublicState(s: EngineState): PublicState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { deck: _deck, hole: _hole, bots: _bots, ...pub } = s;
  return JSON.parse(JSON.stringify(pub)) as PublicState;
}

export function toSecretState(s: EngineState): SecretState {
  return { deck: s.deck.slice(), hole: JSON.parse(JSON.stringify(s.hole)), bots: JSON.parse(JSON.stringify(s.bots ?? {})) };
}

export function mergeState(pub: PublicState, secret: SecretState | null | undefined): EngineState {
  return {
    ...(JSON.parse(JSON.stringify(pub)) as PublicState),
    deck: secret?.deck?.slice() ?? [],
    hole: secret?.hole ? JSON.parse(JSON.stringify(secret.hole)) : {},
    bots: secret?.bots ? JSON.parse(JSON.stringify(secret.bots)) : {},
  };
}

export interface PrivateCards {
  userId: string;
  seat: number;
  handNo: number;
  cards: Card[];
}

/** Each dealt-in player's own hole cards, delivered privately. */
export function privateCards(s: EngineState): PrivateCards[] {
  const out: PrivateCards[] = [];
  s.seats.forEach((seat, i) => {
    const cards = s.hole[String(i)];
    if (seat && !seat.isBot && seat.inHand && cards?.length) out.push({ userId: seat.userId, seat: i, handNo: s.handNo, cards: cards.slice() });
  });
  return out;
}

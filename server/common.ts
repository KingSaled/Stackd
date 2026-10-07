/** Helpers shared by the poker and blackjack table services. */
import { randomInt } from 'node:crypto';
import { GameError } from '../shared/poker/engine';
import type { Rng } from '../shared/poker/cards';
import type { StoredTable } from './repo';

export const cryptoRng: Rng = (n) => randomInt(n);

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomId(rng: Rng = cryptoRng, length = 6): string {
  let id = '';
  for (let i = 0; i < length; i++) id += ROOM_ALPHABET[rng(ROOM_ALPHABET.length)];
  return id;
}

export function normalizeRoomId(raw: unknown): string {
  const id = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(id)) throw new GameError('not_found', 'Table not found');
  return id;
}

export interface ServiceOptions {
  rng?: Rng;
  now?: () => number;
}

export function isBlackjackTable(rec: Pick<StoredTable, 'state'>): boolean {
  return (rec.state as unknown as { game?: string }).game === 'blackjack';
}

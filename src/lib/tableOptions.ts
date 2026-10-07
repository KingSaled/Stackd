import { BLIND_PRESETS } from '../../shared/economy';
import type { TableConfig } from '../../shared/poker/types';

/** Choices shared by the Create table and Quick play dialogs. */
export const POKER_TIMERS = [15, 20, 30, 45, 60];
export const SEAT_CHOICES = [2, 3, 4, 5, 6, 7, 8, 9];
export const BUYIN_PRESETS: { label: string; min: number; max: number }[] = [
  { label: 'Short', min: 20, max: 50 },
  { label: 'Standard', min: 40, max: 100 },
  { label: 'Deep', min: 100, max: 250 },
];

/** A poker table setup as the dialogs edit it. */
export interface PokerSetup {
  /** Index into BLIND_PRESETS. */
  blind: number;
  seats: number;
  /** Index into BUYIN_PRESETS. */
  buyin: number;
  timer: number;
  bots: boolean;
}

export function pokerTableConfig(p: PokerSetup): Partial<TableConfig> {
  const b = BLIND_PRESETS[p.blind] ?? BLIND_PRESETS[1];
  const bi = BUYIN_PRESETS[p.buyin] ?? BUYIN_PRESETS[1];
  return {
    smallBlind: b.sb,
    bigBlind: b.bb,
    maxSeats: p.seats,
    minBuyIn: b.bb * bi.min,
    maxBuyIn: b.bb * bi.max,
    turnSeconds: p.timer,
    bots: p.bots,
  };
}

/** Blinds written compactly for buttons: 1K/2K. */
export const compactChips = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));

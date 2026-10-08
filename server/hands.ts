/**
 * Turns finished hands from the engine into the payload stored by the
 * record_hands() database function: per-player stats for achievements, and
 * how many chips moved from each losing player to each winning player (the
 * input for chip-dumping checks). Bots are left out of both.
 */
import { isBotId, type HandRecord } from '../shared/poker';
import type { BjRoundRecord } from '../shared/blackjack/types';

export interface HandPlayerPayload {
  user_id: string;
  won: number;
  net: number;
  committed: number;
  start: number;
  category: number;
  allin: boolean;
  vpip: boolean;
  pfr: boolean;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface HandPayload {
  table_id: string;
  hand_no: number;
  big_blind: number;
  uncontested: boolean;
  bots: number;
  humans: number;
  players: HandPlayerPayload[];
  transfers: Transfer[];
}

/**
 * Split every loser's loss across the winners in proportion to what each won.
 * Chips won from or lost to bots are not transfers between people.
 */
export function chipTransfers(rec: HandRecord): Transfer[] {
  const nets = rec.players.map((p) => ({ id: p.userId, bot: p.isBot || isBotId(p.userId), net: p.won - p.committed }));
  const winners = nets.filter((p) => p.net > 0);
  const gain = winners.reduce((sum, p) => sum + p.net, 0);
  if (gain <= 0) return [];
  const out: Transfer[] = [];
  for (const loser of nets) {
    if (loser.net >= 0 || loser.bot) continue;
    for (const w of winners) {
      if (w.bot || w.id === loser.id) continue;
      const amount = Math.round((-loser.net * w.net) / gain);
      if (amount > 0) out.push({ from: loser.id, to: w.id, amount });
    }
  }
  return out;
}

export function handPayload(tableId: string, rec: HandRecord): HandPayload | null {
  const humans = rec.players.filter((p) => !p.isBot && !isBotId(p.userId));
  if (humans.length === 0) return null;
  return {
    table_id: tableId,
    hand_no: rec.handNo,
    big_blind: rec.bigBlind,
    uncontested: rec.uncontested,
    bots: rec.players.length - humans.length,
    humans: humans.length,
    players: humans.map((p) => ({
      user_id: p.userId,
      won: p.won,
      net: p.won - p.committed,
      committed: p.committed,
      start: p.startStack,
      category: p.category,
      allin: p.allIn,
      vpip: p.vpip,
      pfr: p.pfr,
    })),
    transfers: chipTransfers(rec),
  };
}

export interface BjRoundPayload {
  table_id: string;
  round_no: number;
  players: {
    user_id: string;
    hands: number;
    wins: number;
    blackjacks: number;
    pushes: number;
    double_wins: number;
    splits: number;
    wagered: number;
    net: number;
  }[];
}

/** A settled blackjack round, as stored by the record_bj_rounds() database function. */
export function bjRoundPayload(tableId: string, rec: BjRoundRecord): BjRoundPayload | null {
  if (rec.players.length === 0) return null;
  return {
    table_id: tableId,
    round_no: rec.roundNo,
    players: rec.players.map((p) => ({
      user_id: p.userId,
      hands: p.hands,
      wins: p.wins,
      blackjacks: p.blackjacks,
      pushes: p.pushes,
      double_wins: p.doubleWins,
      splits: p.splits,
      wagered: p.wagered,
      net: p.net,
    })),
  };
}

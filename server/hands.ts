/**
 * Turns finished hands from the engine into the payload stored by the
 * record_hands() database function: per-player stats for achievements, and
 * how many chips moved from each losing player to each winning player (the
 * input for chip-dumping checks). Bots are left out of both.
 */
import { isBotId, type HandRecord } from '../shared/poker';

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

/**
 * Pre-flop starting-hand strength. The 169 hand classes are ranked by
 * simulated equity, blending heads-up strength with multi-way playability.
 * `preflopPercentile` says what share of all starting hands are this good or
 * better: 0.005 for aces, 1 for the very worst hand.
 */
import type { Card } from './cards';

const ORDER =
  'AA KK QQ JJ TT 99 AKs AQs 88 AJs AKo KQs AQo ATs KJs 77 AJo KTs KQo A9s QJs ATo A8s QTs KJo 66 K9s A7s KTo JTs A5s A9o QJo A6s A4s Q9s A8o QTo A3s K8s 55 J9s A2s K9o JTo K7s K6s A7o Q8s T9s A5o A6o K5s A4o Q9o K8o J8s K4s 44 J9o T8s A3o Q7s Q6s K7o K3s 98s J7s Q8o A2o K6o K2s T9o Q5s T7s J8o 33 97s Q4s K5o Q3s T8o J5s J6s 87s Q7o K4o T6s 98o Q2s K3o 96s J4s Q6o 86s J7o J3s 22 Q5o K2o 76s T7o T5s J2s Q4o 97o T4s 95s 87o Q3o J5o 75s 65s J6o 85s T3s T6o Q2o T2s 54s 94s 96o J4o 84s 74s 64s 93s 76o 86o J3o 92s T5o T4o J2o 53s 73s 65o 95o 83s 63s 85o T3o 82s 75o 43s T2o 94o 52s 54o 62s 84o 74o 72s 42s 93o 64o 32s 92o 53o 73o 83o 63o 43o 82o 52o 72o 62o 42o 32o';

const RANKS = '23456789TJQKA';
const PERCENTILE = new Map<string, number>();
{
  let combos = 0;
  for (const k of ORDER.split(' ')) {
    combos += k.length === 2 ? 6 : k.endsWith('s') ? 4 : 12;
    PERCENTILE.set(k, combos / 1326);
  }
}

export function handClass(hole: Card[]): string {
  const [a, b] = hole;
  const ra = RANKS.indexOf(a[0]);
  const rb = RANKS.indexOf(b[0]);
  const hi = ra >= rb ? a : b;
  const lo = ra >= rb ? b : a;
  if (hi[0] === lo[0]) return hi[0] + lo[0];
  return hi[0] + lo[0] + (hi[1] === lo[1] ? 's' : 'o');
}

export function preflopPercentile(hole: Card[]): number {
  return PERCENTILE.get(handClass(hole)) ?? 1;
}

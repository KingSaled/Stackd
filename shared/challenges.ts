/**
 * Daily and weekly challenges.
 *
 * Every period each player gets one challenge per slot (poker, blackjack, and one
 * that counts hands from either game), plus a bonus for finishing all three. Which
 * challenge fills a slot is picked by the database from the pool below, the same
 * for every player: the pick depends only on the challenge id and the period.
 *
 * The database keeps the authoritative copy of each challenge's counter, target and
 * reward in public.challenges. The server copies this list there on deploy (see
 * server/catalog.ts), and tests keep the two in sync.
 *
 * Periods reset at 08:00 UTC (4 am New York, 1 am Los Angeles, morning in Europe),
 * so nobody's evening session is split by a reset. Weeks start on Monday.
 */
export type ChallengePeriod = 'daily' | 'weekly';
export type ChallengeSlot = 'poker' | 'blackjack' | 'any' | 'bonus';

export interface Challenge {
  id: string;
  period: ChallengePeriod;
  slot: ChallengeSlot;
  name: string;
  description: string;
  /** Counter in the player's stats that drives it (counted from the start of the period). */
  counter: string;
  target: number;
  /** Chips paid when claimed. */
  reward: number;
  /** Phosphor icon name (see components/IconSet). */
  icon: string;
}

/** Hour of the day (UTC) when daily challenges roll over. */
export const CHALLENGE_RESET_HOUR_UTC = 8;

export const CHALLENGES: Challenge[] = [
  // ---- Daily: poker (one is picked each day)
  { id: 'd_poker_hands', period: 'daily', slot: 'poker', name: 'Deal Me In', description: 'Play 20 poker hands.', counter: 'hands', target: 20, reward: 1_000, icon: 'Cards' },
  { id: 'd_poker_wins', period: 'daily', slot: 'poker', name: 'Take It Down', description: 'Win 3 poker pots.', counter: 'wins', target: 3, reward: 1_500, icon: 'HandCoins' },
  { id: 'd_poker_showdown', period: 'daily', slot: 'poker', name: 'Cards Up', description: 'Win 2 pots at showdown.', counter: 'showdown_wins', target: 2, reward: 1_500, icon: 'Eye' },
  { id: 'd_poker_steal', period: 'daily', slot: 'poker', name: 'Smooth Operator', description: 'Win 2 pots without a showdown.', counter: 'uncontested_wins', target: 2, reward: 1_500, icon: 'Detective' },
  { id: 'd_poker_allin', period: 'daily', slot: 'poker', name: 'Nerves of Steel', description: 'Go all-in 2 times.', counter: 'allins', target: 2, reward: 1_500, icon: 'Lightning' },

  // ---- Daily: blackjack
  { id: 'd_bj_hands', period: 'daily', slot: 'blackjack', name: "Dealer's Table", description: 'Play 15 blackjack hands.', counter: 'bj_hands', target: 15, reward: 1_000, icon: 'Cards' },
  { id: 'd_bj_wins', period: 'daily', slot: 'blackjack', name: 'Beat the House', description: 'Win 5 blackjack hands.', counter: 'bj_wins', target: 5, reward: 1_500, icon: 'Crown' },
  { id: 'd_bj_double', period: 'daily', slot: 'blackjack', name: 'Double Trouble', description: 'Win a hand after doubling down.', counter: 'bj_double_wins', target: 1, reward: 1_500, icon: 'TrendUp' },
  { id: 'd_bj_split', period: 'daily', slot: 'blackjack', name: 'Two of a Kind', description: 'Split a pair.', counter: 'bj_splits', target: 1, reward: 1_500, icon: 'SquaresFour' },

  // ---- Daily: either game
  { id: 'd_any_play', period: 'daily', slot: 'any', name: 'Warm-Up', description: 'Play 20 hands, in poker or blackjack.', counter: 'plays', target: 20, reward: 1_000, icon: 'Fire' },
  { id: 'd_any_wins', period: 'daily', slot: 'any', name: 'On a Roll', description: 'Win 6 hands, in poker or blackjack.', counter: 'wins_any', target: 6, reward: 1_500, icon: 'ChartLineUp' },
  { id: 'd_any_marathon', period: 'daily', slot: 'any', name: 'Marathon', description: 'Play 50 hands, in poker or blackjack.', counter: 'plays', target: 50, reward: 2_500, icon: 'Hourglass' },

  // ---- Daily bonus for finishing the set
  { id: 'd_sweep', period: 'daily', slot: 'bonus', name: 'Daily Sweep', description: 'Claim all 3 daily challenges.', counter: 'daily_challenges', target: 3, reward: 1_000, icon: 'Trophy' },

  // ---- Weekly: poker
  { id: 'w_poker_hands', period: 'weekly', slot: 'poker', name: "Grinder's Week", description: 'Play 150 poker hands.', counter: 'hands', target: 150, reward: 5_000, icon: 'Hourglass' },
  { id: 'w_poker_wins', period: 'weekly', slot: 'poker', name: 'Pot Machine', description: 'Win 25 poker pots.', counter: 'wins', target: 25, reward: 7_500, icon: 'Coins' },
  { id: 'w_poker_showdown', period: 'weekly', slot: 'poker', name: 'The Closer', description: 'Win 10 pots at showdown.', counter: 'showdown_wins', target: 10, reward: 7_500, icon: 'Eye' },
  { id: 'w_poker_strong', period: 'weekly', slot: 'poker', name: 'Big Hand Energy', description: 'Win at showdown with a straight or better, 3 times.', counter: 'win_strong', target: 3, reward: 8_000, icon: 'Diamond' },

  // ---- Weekly: blackjack
  { id: 'w_bj_hands', period: 'weekly', slot: 'blackjack', name: 'Regular at the Felt', description: 'Play 100 blackjack hands.', counter: 'bj_hands', target: 100, reward: 5_000, icon: 'Cards' },
  { id: 'w_bj_wins', period: 'weekly', slot: 'blackjack', name: 'House Rules', description: 'Win 40 blackjack hands.', counter: 'bj_wins', target: 40, reward: 7_500, icon: 'Crown' },
  { id: 'w_bj_naturals', period: 'weekly', slot: 'blackjack', name: 'Naturals', description: 'Get 3 blackjacks.', counter: 'bj_blackjacks', target: 3, reward: 7_500, icon: 'ShootingStar' },
  { id: 'w_bj_doubles', period: 'weekly', slot: 'blackjack', name: 'Double Down Week', description: 'Win 5 doubled-down hands.', counter: 'bj_double_wins', target: 5, reward: 6_500, icon: 'TrendUp' },

  // ---- Weekly: either game
  { id: 'w_any_play', period: 'weekly', slot: 'any', name: 'Season Ticket', description: 'Play 250 hands, in poker or blackjack.', counter: 'plays', target: 250, reward: 6_000, icon: 'Armchair' },
  { id: 'w_any_daily', period: 'weekly', slot: 'any', name: 'Show Up', description: 'Claim your daily bonus 5 times.', counter: 'daily_claims', target: 5, reward: 5_000, icon: 'CalendarCheck' },
  { id: 'w_any_dedicated', period: 'weekly', slot: 'any', name: 'Dedicated', description: 'Claim 6 daily challenges.', counter: 'daily_challenges', target: 6, reward: 6_000, icon: 'Medal' },

  // ---- Weekly bonus for finishing the set
  { id: 'w_sweep', period: 'weekly', slot: 'bonus', name: 'Weekly Sweep', description: 'Claim all 3 weekly challenges.', counter: 'weekly_challenges', target: 3, reward: 5_000, icon: 'Trophy' },
];

export const CHALLENGE_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));

/** Display order of the slots inside a period. */
export const SLOT_ORDER: ChallengeSlot[] = ['poker', 'blackjack', 'any', 'bonus'];

export const SLOT_LABEL: Record<ChallengeSlot, string> = {
  poker: 'Poker',
  blackjack: 'Blackjack',
  any: 'Any game',
  bonus: 'Bonus',
};

/** What a player sees for one active challenge (the database's row, from my_challenges()). */
export interface ChallengeStatus {
  id: string;
  period: ChallengePeriod;
  slot: ChallengeSlot;
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
  /** Identifies this day or week; changes at each reset. */
  periodKey: string;
  /** When this challenge expires (ISO time). */
  endsAt: string;
}

export const isComplete = (c: Pick<ChallengeStatus, 'progress' | 'target'>) => c.progress >= c.target;
export const isClaimable = (c: ChallengeStatus) => isComplete(c) && !c.claimed;

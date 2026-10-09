/**
 * Daily and weekly challenges.
 *
 * Every period each player gets one challenge per slot (poker, blackjack, and one
 * that counts any game, minigames included), plus a bonus for finishing all three. Which
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
  /**
   * Most progress that counts in one day (weekly challenges), so a week's goal takes
   * several days of play and can't be finished in one long session.
   */
  dailyCap?: number;
  /** Chips paid when claimed. */
  reward: number;
  /** Phosphor icon name (see components/IconSet). */
  icon: string;
}

/** Hour of the day (UTC) when daily challenges roll over. */
export const CHALLENGE_RESET_HOUR_UTC = 8;

/** Minigame rounds count as one "round" each: a case, a coin flip, or a Crash or Roulette round you bet on. */
const MG = 'Crash, Coin Flip, Roulette or Cases';

export const CHALLENGES: Challenge[] = [
  // ---- Daily: poker (one is picked each day)
  { id: 'd_poker_hands', period: 'daily', slot: 'poker', name: 'Deal Me In', description: 'Play 20 poker hands.', counter: 'hands', target: 20, reward: 1_000, icon: 'Cards' },
  { id: 'd_poker_wins', period: 'daily', slot: 'poker', name: 'Take It Down', description: 'Win 3 poker pots.', counter: 'wins', target: 3, reward: 1_500, icon: 'HandCoins' },
  { id: 'd_poker_showdown', period: 'daily', slot: 'poker', name: 'Cards Up', description: 'Win 2 pots at showdown.', counter: 'showdown_wins', target: 2, reward: 1_500, icon: 'Eye' },
  { id: 'd_poker_steal', period: 'daily', slot: 'poker', name: 'Smooth Operator', description: 'Win 2 pots without a showdown.', counter: 'uncontested_wins', target: 2, reward: 1_500, icon: 'Detective' },
  { id: 'd_poker_allin', period: 'daily', slot: 'poker', name: 'Nerves of Steel', description: 'Go all-in 2 times.', counter: 'allins', target: 2, reward: 1_500, icon: 'Lightning' },
  { id: 'd_poker_raise', period: 'daily', slot: 'poker', name: 'Take the Lead', description: 'Raise before the flop in 5 hands.', counter: 'pfr_hands', target: 5, reward: 1_500, icon: 'ArrowFatUp' },
  { id: 'd_poker_allin_win', period: 'daily', slot: 'poker', name: 'Shove and Pray', description: 'Win a pot after going all-in.', counter: 'allin_wins', target: 1, reward: 2_000, icon: 'Fire' },

  // ---- Daily: blackjack
  { id: 'd_bj_hands', period: 'daily', slot: 'blackjack', name: "Dealer's Table", description: 'Play 15 blackjack hands.', counter: 'bj_hands', target: 15, reward: 1_000, icon: 'Cards' },
  { id: 'd_bj_wins', period: 'daily', slot: 'blackjack', name: 'Beat the House', description: 'Win 5 blackjack hands.', counter: 'bj_wins', target: 5, reward: 1_500, icon: 'Crown' },
  { id: 'd_bj_double', period: 'daily', slot: 'blackjack', name: 'Double Trouble', description: 'Win a hand after doubling down.', counter: 'bj_double_wins', target: 1, reward: 1_500, icon: 'TrendUp' },
  { id: 'd_bj_split', period: 'daily', slot: 'blackjack', name: 'Two of a Kind', description: 'Split a pair.', counter: 'bj_splits', target: 1, reward: 1_500, icon: 'SquaresFour' },
  { id: 'd_bj_natural', period: 'daily', slot: 'blackjack', name: 'Natural Talent', description: 'Get a blackjack.', counter: 'bj_blackjacks', target: 1, reward: 1_500, icon: 'ShootingStar' },
  { id: 'd_bj_shift', period: 'daily', slot: 'blackjack', name: 'Double Shift', description: 'Play 40 blackjack hands.', counter: 'bj_hands', target: 40, reward: 2_000, icon: 'Hourglass' },

  // ---- Daily: any game (tables or minigames)
  { id: 'd_any_play', period: 'daily', slot: 'any', name: 'Warm-Up', description: 'Play 20 hands, in poker or blackjack.', counter: 'plays', target: 20, reward: 1_000, icon: 'Fire' },
  { id: 'd_any_wins', period: 'daily', slot: 'any', name: 'On a Roll', description: 'Win 6 hands, in poker or blackjack.', counter: 'wins_any', target: 6, reward: 1_500, icon: 'ChartLineUp' },
  { id: 'd_any_marathon', period: 'daily', slot: 'any', name: 'Marathon', description: 'Play 50 hands, in poker or blackjack.', counter: 'plays', target: 50, reward: 2_500, icon: 'Hourglass' },
  { id: 'd_mg_rounds', period: 'daily', slot: 'any', name: 'Side Action', description: `Play 10 minigame rounds (${MG}).`, counter: 'mg_rounds', target: 10, reward: 1_000, icon: 'GameController' },
  { id: 'd_mg_wins', period: 'daily', slot: 'any', name: 'Lucky Streak', description: `Win 5 minigame rounds (${MG}).`, counter: 'mg_wins', target: 5, reward: 1_500, icon: 'Clover' },
  { id: 'd_crash_2x', period: 'daily', slot: 'any', name: 'Hold Your Nerve', description: 'Cash out at 2x or higher in Crash, 3 times.', counter: 'crash_2x', target: 3, reward: 1_500, icon: 'RocketLaunch' },
  { id: 'd_flip_wins', period: 'daily', slot: 'any', name: 'Call It', description: 'Win 2 coin flips.', counter: 'coinflip_wins', target: 2, reward: 1_500, icon: 'Coin' },

  // ---- Daily bonus for finishing the set
  { id: 'd_sweep', period: 'daily', slot: 'bonus', name: 'Daily Sweep', description: 'Claim all 3 daily challenges.', counter: 'daily_challenges', target: 3, reward: 1_000, icon: 'Trophy' },

  // ---- Weekly: poker. Daily caps spread each one over 4-6 days of play.
  { id: 'w_poker_hands', period: 'weekly', slot: 'poker', name: "Grinder's Week", description: 'Play 500 poker hands.', counter: 'hands', target: 500, dailyCap: 100, reward: 12_000, icon: 'Hourglass' },
  { id: 'w_poker_wins', period: 'weekly', slot: 'poker', name: 'Pot Machine', description: 'Win 80 poker pots.', counter: 'wins', target: 80, dailyCap: 16, reward: 15_000, icon: 'Coins' },
  { id: 'w_poker_showdown', period: 'weekly', slot: 'poker', name: 'The Closer', description: 'Win 35 pots at showdown.', counter: 'showdown_wins', target: 35, dailyCap: 7, reward: 15_000, icon: 'Eye' },
  { id: 'w_poker_strong', period: 'weekly', slot: 'poker', name: 'Big Hand Energy', description: 'Win at showdown with a straight or better, 8 times.', counter: 'win_strong', target: 8, dailyCap: 2, reward: 18_000, icon: 'Diamond' },
  { id: 'w_poker_steal', period: 'weekly', slot: 'poker', name: 'Table Captain', description: 'Win 40 pots without a showdown.', counter: 'uncontested_wins', target: 40, dailyCap: 8, reward: 14_000, icon: 'Detective' },

  // ---- Weekly: blackjack
  { id: 'w_bj_hands', period: 'weekly', slot: 'blackjack', name: 'Regular at the Felt', description: 'Play 400 blackjack hands.', counter: 'bj_hands', target: 400, dailyCap: 80, reward: 12_000, icon: 'Cards' },
  { id: 'w_bj_wins', period: 'weekly', slot: 'blackjack', name: 'House Rules', description: 'Win 150 blackjack hands.', counter: 'bj_wins', target: 150, dailyCap: 30, reward: 15_000, icon: 'Crown' },
  { id: 'w_bj_naturals', period: 'weekly', slot: 'blackjack', name: 'Naturals', description: 'Get 12 blackjacks.', counter: 'bj_blackjacks', target: 12, dailyCap: 3, reward: 16_000, icon: 'ShootingStar' },
  { id: 'w_bj_doubles', period: 'weekly', slot: 'blackjack', name: 'Double Down Week', description: 'Win 15 doubled-down hands.', counter: 'bj_double_wins', target: 15, dailyCap: 3, reward: 15_000, icon: 'TrendUp' },

  // ---- Weekly: any game
  { id: 'w_any_play', period: 'weekly', slot: 'any', name: 'Season Ticket', description: 'Play 1,000 hands, in poker or blackjack.', counter: 'plays', target: 1000, dailyCap: 200, reward: 15_000, icon: 'Armchair' },
  { id: 'w_any_daily', period: 'weekly', slot: 'any', name: 'Show Up', description: 'Claim your daily bonus 6 times.', counter: 'daily_claims', target: 6, reward: 12_000, icon: 'CalendarCheck' },
  { id: 'w_any_dedicated', period: 'weekly', slot: 'any', name: 'Dedicated', description: 'Claim 15 daily challenges.', counter: 'daily_challenges', target: 15, reward: 15_000, icon: 'Medal' },
  { id: 'w_any_days', period: 'weekly', slot: 'any', name: 'Regular', description: 'Play on 6 different days (any game counts).', counter: 'active_days', target: 6, reward: 12_000, icon: 'CalendarDots' },
  { id: 'w_mg_rounds', period: 'weekly', slot: 'any', name: 'High Roller Week', description: `Play 150 minigame rounds (${MG}).`, counter: 'mg_rounds', target: 150, dailyCap: 30, reward: 12_000, icon: 'GameController' },
  { id: 'w_crash_5x', period: 'weekly', slot: 'any', name: 'Moonshot', description: 'Cash out at 5x or higher in Crash, 5 times.', counter: 'crash_5x', target: 5, dailyCap: 1, reward: 16_000, icon: 'RocketLaunch' },

  // ---- Weekly bonus for finishing the set
  { id: 'w_sweep', period: 'weekly', slot: 'bonus', name: 'Weekly Sweep', description: 'Claim all 3 weekly challenges.', counter: 'weekly_challenges', target: 3, reward: 10_000, icon: 'Trophy' },
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
  /** Most progress that counts per day (weekly challenges), and how much has counted today. */
  dailyCap?: number | null;
  today?: number;
}

/** "Up to 100 a day" for weekly challenges with a daily cap. */
export const dailyCapLabel = (cap: number) => `Up to ${cap.toLocaleString('en-US')} a day`;

export const isComplete = (c: Pick<ChallengeStatus, 'progress' | 'target'>) => c.progress >= c.target;
export const isClaimable = (c: ChallengeStatus) => isComplete(c) && !c.claimed;

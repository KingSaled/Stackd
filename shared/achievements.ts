/**
 * Achievements. Progress is counted from the day achievements launched (nothing
 * is awarded retroactively). The database holds the authoritative copy of each
 * achievement's counter, target and reward in public.achievements
 * (supabase/schema.sql); tests keep the two in sync.
 */
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Counter in public.player_counters that drives this achievement. */
  counter: string;
  target: number;
  /** Chips paid once when unlocked. */
  reward: number;
  tier: AchievementTier;
  /** Phosphor icon name (see components/IconSet). */
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_hand', name: 'Take a Seat', description: 'Play your first hand.', counter: 'hands', target: 1, reward: 500, tier: 'bronze', icon: 'Armchair' },
  { id: 'hands_100', name: 'Regular', description: 'Play 100 hands.', counter: 'hands', target: 100, reward: 2_000, tier: 'silver', icon: 'Cards' },
  { id: 'hands_1000', name: 'Grinder', description: 'Play 1,000 hands.', counter: 'hands', target: 1_000, reward: 10_000, tier: 'gold', icon: 'Hourglass' },
  { id: 'first_win', name: 'Ship It', description: 'Win your first pot.', counter: 'wins', target: 1, reward: 500, tier: 'bronze', icon: 'HandCoins' },
  { id: 'wins_100', name: 'Pot Collector', description: 'Win 100 pots.', counter: 'wins', target: 100, reward: 5_000, tier: 'silver', icon: 'Coins' },
  { id: 'wins_500', name: 'Shark', description: 'Win 500 pots.', counter: 'wins', target: 500, reward: 20_000, tier: 'gold', icon: 'FishSimple' },
  { id: 'showdown_25', name: 'Show Me', description: 'Win 25 pots at showdown.', counter: 'showdown_wins', target: 25, reward: 3_000, tier: 'silver', icon: 'Eye' },
  { id: 'steal_25', name: 'Pickpocket', description: 'Win 25 pots without a showdown.', counter: 'uncontested_wins', target: 25, reward: 3_000, tier: 'silver', icon: 'Detective' },
  { id: 'allin_win', name: 'All In', description: 'Win a hand after going all-in.', counter: 'allin_wins', target: 1, reward: 1_000, tier: 'bronze', icon: 'Lightning' },
  { id: 'allin_10', name: 'Fearless', description: 'Win 10 hands after going all-in.', counter: 'allin_wins', target: 10, reward: 5_000, tier: 'gold', icon: 'Fire' },
  { id: 'double_up', name: 'Double Up', description: 'Double your stack in a single hand.', counter: 'double_ups', target: 1, reward: 1_500, tier: 'bronze', icon: 'TrendUp' },
  { id: 'big_win_10k', name: 'Big Score', description: 'Profit 10,000 chips in one hand.', counter: 'biggest_win', target: 10_000, reward: 3_000, tier: 'silver', icon: 'ChartLineUp' },
  { id: 'big_win_100k', name: 'Whale', description: 'Profit 100,000 chips in one hand.', counter: 'biggest_win', target: 100_000, reward: 15_000, tier: 'gold', icon: 'Crown' },
  { id: 'win_straight', name: 'Straight Shooter', description: 'Win at showdown with a straight.', counter: 'win_straight', target: 1, reward: 1_000, tier: 'bronze', icon: 'Crosshair' },
  { id: 'win_flush', name: 'Suited Up', description: 'Win at showdown with a flush.', counter: 'win_flush', target: 1, reward: 1_000, tier: 'bronze', icon: 'Spade' },
  { id: 'win_full_house', name: 'Full House', description: 'Win at showdown with a full house.', counter: 'win_full_house', target: 1, reward: 2_000, tier: 'silver', icon: 'House' },
  { id: 'win_quads', name: 'Quads', description: 'Win at showdown with four of a kind.', counter: 'win_quads', target: 1, reward: 5_000, tier: 'gold', icon: 'SquaresFour' },
  { id: 'win_straight_flush', name: 'Straight Flush', description: 'Win at showdown with a straight flush.', counter: 'win_straight_flush', target: 1, reward: 15_000, tier: 'gold', icon: 'ShootingStar' },
  { id: 'win_royal', name: 'Royal Flush', description: 'Win at showdown with a royal flush.', counter: 'win_royal', target: 1, reward: 50_000, tier: 'platinum', icon: 'CrownSimple' },
  { id: 'bot_wins_25', name: 'Bot Buster', description: 'Win 25 pots at tables with bots.', counter: 'bot_table_wins', target: 25, reward: 2_000, tier: 'silver', icon: 'Robot' },
  { id: 'full_ring_50', name: 'Packed House', description: 'Play 50 hands with 6 or more real players dealt in.', counter: 'full_ring_hands', target: 50, reward: 3_000, tier: 'silver', icon: 'Users' },
  { id: 'streak_7', name: 'Creature of Habit', description: 'Reach a 7-day daily bonus streak.', counter: 'best_streak', target: 7, reward: 3_000, tier: 'silver', icon: 'CalendarCheck' },
  { id: 'style_1', name: 'Style Points', description: 'Buy your first item in the Cosmetic Shop.', counter: 'cosmetics_bought', target: 1, reward: 1_000, tier: 'bronze', icon: 'PaintBrush' },
  { id: 'style_5', name: 'Collector', description: 'Own 5 items from the Cosmetic Shop.', counter: 'cosmetics_bought', target: 5, reward: 10_000, tier: 'gold', icon: 'Diamond' },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Counters that keep the highest value seen instead of a running total. */
export const MAX_COUNTERS = ['biggest_win', 'best_streak'] as const;

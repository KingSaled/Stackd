/**
 * Player-facing release notes. Add a new entry at the TOP for each release;
 * every player sees the newest entry once (tracked on their account).
 */
export interface ChangelogEntry {
  /** Unique id, e.g. "2026-10-06". */
  version: string;
  date: string;
  title: string;
  items: { icon: string; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026-10-06',
    date: 'October 6, 2026',
    title: 'Bots, a new table and a whole new sound',
    items: [
      { icon: '🤖', text: 'Play against bots: tick "Fill empty seats with bots" when creating a table. Every bot has a hidden skill level, so watch out for the sharks.' },
      { icon: '🪑', text: "Friends can take any bot's seat with the Sit button — they're dealt in as soon as the current hand ends." },
      { icon: '🎰', text: 'Redesigned table: stitched leather rail, brass trim, woven felt, new cards and chips.' },
      { icon: '✨', text: 'Smoother animations: cards arc in from the deck and lift as they flip, chips toss and settle, winnings stream to the winner.' },
      { icon: '🎧', text: 'All-new sound design: realistic chips, cards and knocks, with stereo placement by seat.' },
      { icon: '📱', text: 'Better phone layout for full tables, and the same avatars on every device.' },
      { icon: '💬', text: 'Chat and the hand log now stay pinned to the newest message.' },
      { icon: '🏆', text: 'The leaderboard now only ranks saved accounts.' },
    ],
  },
];

export const LATEST_CHANGELOG = CHANGELOG[0];

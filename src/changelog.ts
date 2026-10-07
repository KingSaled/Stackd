/**
 * Player-facing release notes. Add a new entry at the TOP for each release
 * with a version that sorts after the previous one (the release date, plus a
 * letter for a second release on the same day: "2026-10-07b"). Each player
 * sees the entries they have missed once (tracked on their account).
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
    version: '2026-10-07',
    date: 'October 7, 2026',
    title: 'A fresh lobby and a crown for the champion',
    items: [
      { icon: '👑', text: 'The #1 player on the leaderboard gets a champion card with a golden frame, and wears a crown at every table.' },
      { icon: '🥈', text: "Silver and bronze medals for 2nd and 3rd, and your own rank always shows, even outside the top 10." },
      { icon: '🏠', text: 'Cleaner home screen: Create table and Join a table sit right at the top, with your seats, daily bonus, open tables and leaderboard below. Everything you used before is still there.' },
      { icon: '🎲', text: 'Table stakes now show as coloured casino chips, with a seat meter showing how full each table is.' },
      { icon: '🔑', text: 'Quicker sign-in: Sign in, Sign up and Guest are tabs on one card, and you can show your password while typing.' },
      { icon: '🧵', text: "The table's leather rail and stitching are now evenly spaced all the way round on phones." },
    ],
  },
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

/** Most releases a returning player is shown at once. */
const MAX_UNSEEN = 3;

/**
 * Releases a player hasn't seen yet, newest first: everything after the last
 * version they dismissed, skipping releases from before their account existed.
 */
export function unseenEntries(lastSeen: string | null | undefined, createdAt: string | null | undefined, entries = CHANGELOG) {
  const joined = createdAt ? Date.parse(createdAt) : NaN;
  return entries
    .filter((e) => !lastSeen || e.version > lastSeen)
    .filter((e) => Number.isNaN(joined) || Date.parse(`${e.version.slice(0, 10)}T23:59:59Z`) >= joined)
    .slice(0, MAX_UNSEEN);
}

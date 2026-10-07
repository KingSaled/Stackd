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
  /** `icon` is a Phosphor icon name registered in components/IconSet.tsx. */
  items: { icon: string; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026-10-07e',
    date: 'October 7, 2026',
    title: 'Blackjack is here',
    items: [
      { icon: 'Cards', text: "New game: Blackjack against the house. Switch between Hold'em and Blackjack with the pills at the top of the lobby." },
      { icon: 'Users', text: 'Open your own blackjack table for up to 6 players and invite friends with a link, or join an open table from the lobby.' },
      { icon: 'Coins', text: 'Bets of 10 to 50,000 come straight from your wallet, with no buy-in. Blackjack pays 3 to 2 and the dealer stands on all 17s.' },
      { icon: 'Sparkle', text: 'Hit, stand, double and split, with keyboard shortcuts (H, S, D, P) on desktop.' },
    ],
  },
  {
    version: '2026-10-07d',
    date: 'October 7, 2026',
    title: 'A bigger, sharper Cosmetic Shop',
    items: [
      { icon: 'Sparkle', text: 'Twenty items: two borders and two backgrounds at every rarity, all redrawn as crisp art that stays sharp at any size. Anything you already bought is still yours.' },
      { icon: 'Storefront', text: 'New borders include House Chip, Vegas Neon, Storm Caller, Holo Prism and Celestial Halo. New backgrounds include Twenty-One, Neon Skyline, Storm Front, Jackpot and Aurora Peaks.' },
      { icon: 'Trophy', text: 'A new achievement, Shark (win 500 pots). Achievements are now sorted by reward.' },
      { icon: 'ChartBar', text: 'A tidier profile: your best hand shows as a short name with a mini card pattern.' },
      { icon: 'PokerChip', text: 'A cleaner Create a table window with all the same options.' },
      { icon: 'Crown', text: "The champion card's gold frame now animates smoothly." },
    ],
  },
  {
    version: '2026-10-07c',
    date: 'October 7, 2026',
    title: 'Smarter bots and polish',
    items: [
      { icon: 'Robot', text: "Smarter bots: they now play realistic starting hands, raise their good ones and stand up to raises instead of folding to almost everything. Raising every hand won't push them around anymore." },
      { icon: 'Cards', text: 'Fixed a rare glitch where a card on the board could turn invisible, and a thin line that could show through cards on some PCs.' },
      { icon: 'UserCircle', text: 'Every portrait now sits perfectly centred in its frame.' },
    ],
  },
  {
    version: '2026-10-07b',
    date: 'October 7, 2026',
    title: 'Achievements, the Cosmetic Shop and portraits',
    items: [
      { icon: 'Trophy', text: '23 achievements to collect, each paying a one-time reward of 500 to 50,000 chips. Progress counts from today, so everyone starts fresh.' },
      { icon: 'Storefront', text: 'The Cosmetic Shop: five borders and five backgrounds, bought with chips. The top border, Mythic Inferno, is fully animated.' },
      { icon: 'UserCircle', text: '50 pixel-art portraits replace the emoji avatars. Your old avatar was swapped for a portrait automatically; pick a new one any time.' },
      { icon: 'ChartBar', text: 'A cleaner, more compact profile with new stats: VPIP, PFR, showdown and all-in win rates, net winnings and your biggest win.' },
      { icon: 'Scales', text: 'Terms of Service and a Privacy Policy, plus a one-time check that you are 18 or older. Stackd is play money only: chips can never be bought or cashed out.' },
      { icon: 'ShieldCheck', text: 'Fair-play protection: bonuses are limited per device, and unusual chip transfers between players are flagged for review.' },
      { icon: 'Robot', text: "Fixed: bots now really play at their hidden skill levels. Before, every bot was quietly playing at the same level." },
      { icon: 'Trash', text: 'You can delete your account and all of its data from your profile.' },
      { icon: 'Sparkle', text: 'New icons throughout the game.' },
    ],
  },
  {
    version: '2026-10-07',
    date: 'October 7, 2026',
    title: 'A fresh lobby and a crown for the champion',
    items: [
      { icon: 'Crown', text: 'The #1 player on the leaderboard gets a champion card with a golden frame, and wears a crown at every table.' },
      { icon: 'Medal', text: "Silver and bronze medals for 2nd and 3rd, and your own rank always shows, even outside the top 10." },
      { icon: 'House', text: 'Cleaner home screen: Create table and Join a table sit right at the top, with your seats, daily bonus, open tables and leaderboard below. Everything you used before is still there.' },
      { icon: 'PokerChip', text: 'Table stakes now show as coloured casino chips, with a seat meter showing how full each table is.' },
      { icon: 'Key', text: 'Quicker sign-in: Sign in, Sign up and Guest are tabs on one card, and you can show your password while typing.' },
      { icon: 'CircleDashed', text: "The table's leather rail and stitching are now evenly spaced all the way round on phones." },
    ],
  },
  {
    version: '2026-10-06',
    date: 'October 6, 2026',
    title: 'Bots, a new table and a whole new sound',
    items: [
      { icon: 'Robot', text: 'Play against bots: tick "Fill empty seats with bots" when creating a table. Every bot has a hidden skill level, so watch out for the sharks.' },
      { icon: 'Armchair', text: "Friends can take any bot's seat with the Sit button — they're dealt in as soon as the current hand ends." },
      { icon: 'Cards', text: 'Redesigned table: stitched leather rail, brass trim, woven felt, new cards and chips.' },
      { icon: 'Sparkle', text: 'Smoother animations: cards arc in from the deck and lift as they flip, chips toss and settle, winnings stream to the winner.' },
      { icon: 'Headphones', text: 'All-new sound design: realistic chips, cards and knocks, with stereo placement by seat.' },
      { icon: 'DeviceMobile', text: 'Better phone layout for full tables, and the same avatars on every device.' },
      { icon: 'ChatCircleDots', text: 'Chat and the hand log now stay pinned to the newest message.' },
      { icon: 'Trophy', text: 'The leaderboard now only ranks saved accounts.' },
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

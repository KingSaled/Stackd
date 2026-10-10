/**
 * Cosmetic Shop catalogue. Items are bought with play chips only (never real
 * money). Prices here are for display; the database holds the authoritative
 * copy in public.cosmetics (supabase/schema.sql) and tests keep them in sync.
 */
export type CosmeticKind = 'frame' | 'backdrop' | 'name' | 'club';

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  blurb: string;
  price: number;
  /** 1 (entry) to 8 (the 30M+ flagships). */
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  animated?: boolean;
}

/** Rarity names by tier. */
export const RARITY = ['', 'Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Exotic', 'Ascendant', 'Sovereign'] as const;

/**
 * Ids are permanent: players own items by id, so an item can be redrawn or
 * renamed but its id must never change.
 */
export const FRAMES: Cosmetic[] = [
  { id: 'frame-steel', kind: 'frame', tier: 1, price: 5_000, name: 'Gunmetal', blurb: 'Brushed steel band with machined rivets.' },
  { id: 'frame-chip', kind: 'frame', tier: 1, price: 7_500, name: 'House Chip', blurb: 'The edge of a classic red casino chip.' },
  { id: 'frame-gold', kind: 'frame', tier: 2, price: 15_000, name: 'Royal Gold', blurb: 'Polished gold, black enamel, a bead row and four sapphire studs.' },
  { id: 'frame-neon', kind: 'frame', tier: 2, price: 20_000, name: 'Vegas Neon', blurb: 'Glowing pink and cyan neon tubes, straight off the Strip.', animated: true },
  { id: 'frame-ruby', kind: 'frame', tier: 3, price: 40_000, name: 'Ruby Facets', blurb: 'Eight cut rubies set in gold that glint as they catch the light.', animated: true },
  { id: 'frame-storm', kind: 'frame', tier: 3, price: 50_000, name: 'Storm Caller', blurb: 'A gunmetal ring crackling with live lightning.', animated: true },
  { id: 'frame-diamond', kind: 'frame', tier: 4, price: 100_000, name: 'Diamond', blurb: 'Twelve brilliant-cut diamonds on platinum, with a travelling glint.', animated: true },
  { id: 'frame-prism', kind: 'frame', tier: 4, price: 125_000, name: 'Holo Prism', blurb: 'Holographic foil that flows through every colour.', animated: true },
  { id: 'frame-mythic', kind: 'frame', tier: 5, price: 250_000, name: 'Mythic Inferno', blurb: 'A blazing ring of living flame with orbiting embers. The flashiest seat at any table.', animated: true },
  { id: 'frame-celestial', kind: 'frame', tier: 5, price: 300_000, name: 'Celestial Halo', blurb: 'A golden halo circled by the sun, the moon and turning star rings.', animated: true },
  { id: 'frame-sakura', kind: 'frame', tier: 6, price: 1_000_000, name: 'Sakura Wreath', blurb: 'A wreath of cherry blossom in full bloom, shedding petals on the breeze.', animated: true },
  { id: 'frame-glitch', kind: 'frame', tier: 6, price: 1_500_000, name: 'Glitch', blurb: 'A corrupted digital ring: scrolling hex, RGB tearing and dropped frames.', animated: true },
  { id: 'frame-frost', kind: 'frame', tier: 6, price: 2_500_000, name: 'Frostbound', blurb: 'Ice crystals spike around your portrait while snowflakes circle in a freezing mist.', animated: true },
  { id: 'frame-horizon', kind: 'frame', tier: 7, price: 5_000_000, name: 'Event Horizon', blurb: "A black hole's accretion disk whirls around you, bending starlight into a burning ring.", animated: true },
  { id: 'frame-ouroboros', kind: 'frame', tier: 7, price: 8_000_000, name: 'Ouroboros', blurb: 'An emerald serpent devouring its own tail, gold scales rippling as it turns forever.', animated: true },
  { id: 'frame-phoenix', kind: 'frame', tier: 7, price: 12_000_000, name: 'Phoenix', blurb: 'A firebird rises over your portrait, great wings of living flame beating as embers fly.', animated: true },
  { id: 'frame-crown', kind: 'frame', tier: 8, price: 20_000_000, name: 'Crown of Kings', blurb: 'A jewelled gold crown over a ring of rubies, emeralds and sapphires, with light dancing across every stone.', animated: true },
  { id: 'frame-seraph', kind: 'frame', tier: 8, price: 30_000_000, name: 'Seraphim', blurb: 'Six golden wings, a blazing halo and turning rings of sacred light. Nothing else comes close.', animated: true },
];

export const BACKDROPS: Cosmetic[] = [
  { id: 'bg-felt', kind: 'backdrop', tier: 1, price: 3_000, name: 'Card Room', blurb: 'Green baize, a gold rail and a warm lamp overhead.' },
  { id: 'bg-blackjack', kind: 'backdrop', tier: 1, price: 4_000, name: 'Twenty-One', blurb: 'Royal blue blackjack felt with gold betting lines.' },
  { id: 'bg-sunset', kind: 'backdrop', tier: 2, price: 8_000, name: 'Strip Sunset', blurb: 'A retro neon sun setting over a glowing grid.' },
  { id: 'bg-city', kind: 'backdrop', tier: 2, price: 10_000, name: 'Neon Skyline', blurb: 'The city at night: lit windows, neon signs and a big moon.' },
  { id: 'bg-ocean', kind: 'backdrop', tier: 3, price: 20_000, name: 'Deep Sea', blurb: 'Swaying light rays, rising bubbles and a glowing jellyfish.', animated: true },
  { id: 'bg-storm', kind: 'backdrop', tier: 3, price: 25_000, name: 'Storm Front', blurb: 'Rolling clouds, driving rain and lightning that lights up the sky.', animated: true },
  { id: 'bg-velvet', kind: 'backdrop', tier: 4, price: 50_000, name: 'High Roller Velvet', blurb: 'Plush violet velvet, gold damask and a gilded rim with a passing sheen.', animated: true },
  { id: 'bg-jackpot', kind: 'backdrop', tier: 4, price: 60_000, name: 'Jackpot', blurb: 'Golden rays and a never-ending shower of spinning coins.', animated: true },
  { id: 'bg-galaxy', kind: 'backdrop', tier: 5, price: 120_000, name: 'Galaxy', blurb: 'A turning spiral galaxy, glowing nebulae and shooting stars.', animated: true },
  { id: 'bg-aurora', kind: 'backdrop', tier: 5, price: 150_000, name: 'Aurora Peaks', blurb: 'Northern lights rippling over snowy peaks under a starry sky.', animated: true },
  { id: 'bg-sakura', kind: 'backdrop', tier: 6, price: 1_000_000, name: 'Sakura Night', blurb: 'Moonlit cherry blossoms, glowing lanterns and petals drifting past a pagoda.', animated: true },
  { id: 'bg-mainframe', kind: 'backdrop', tier: 6, price: 1_500_000, name: 'Mainframe', blurb: 'Cascading code rain from a machine that never sleeps.', animated: true },
  { id: 'bg-volcano', kind: 'backdrop', tier: 6, price: 2_500_000, name: 'Eruption', blurb: 'A volcano erupting into a stormy sky: lava fountains, glowing rivers and rising embers.', animated: true },
  { id: 'bg-vault', kind: 'backdrop', tier: 7, price: 5_000_000, name: 'The Vault', blurb: 'An open vault, stacks of gold bars and diamonds glittering under a sweeping spotlight.', animated: true },
  { id: 'bg-hyperspace', kind: 'backdrop', tier: 7, price: 8_000_000, name: 'Hyperspace', blurb: 'Stars stretch into streaks of light as you jump to warp, again and again.', animated: true },
  { id: 'bg-dragoneye', kind: 'backdrop', tier: 7, price: 12_000_000, name: "Dragon's Eye", blurb: 'Something enormous is watching: a molten golden eye that blinks and narrows in the smoke.', animated: true },
  { id: 'bg-heaven', kind: 'backdrop', tier: 8, price: 20_000_000, name: "Heaven's Gate", blurb: 'Golden gates open above the clouds as rays of light turn behind you.', animated: true },
  { id: 'bg-genesis', kind: 'backdrop', tier: 8, price: 30_000_000, name: 'Genesis', blurb: 'The birth of a universe: a blinding core, shockwaves of light and new galaxies flying past.', animated: true },
];

/** Name styles: how your display name looks at tables, in chat and on the leaderboard. */
export const NAME_STYLES: Cosmetic[] = [
  { id: 'name-gold', kind: 'name', tier: 1, price: 10_000, name: 'Gold Leaf', blurb: 'Solid gold lettering.' },
  { id: 'name-glacier', kind: 'name', tier: 1, price: 10_000, name: 'Glacier', blurb: 'Cool ice-blue lettering.' },
  { id: 'name-ember', kind: 'name', tier: 1, price: 15_000, name: 'Ember', blurb: 'Red-hot letters with a warm glow.' },
  { id: 'name-toxic', kind: 'name', tier: 1, price: 20_000, name: 'Toxic', blurb: "Acid green that glows like it shouldn't." },
  { id: 'name-neon', kind: 'name', tier: 2, price: 40_000, name: 'Neon Sign', blurb: 'Hot pink neon tubing that buzzes and flickers.', animated: true },
  { id: 'name-wave', kind: 'name', tier: 2, price: 50_000, name: 'Wave', blurb: 'Letters ripple up and down, old-school MMO style.', animated: true },
  { id: 'name-flash', kind: 'name', tier: 2, price: 75_000, name: 'Flash', blurb: 'Flashes red and yellow, just like the classics.', animated: true },
  { id: 'name-rainbow', kind: 'name', tier: 3, price: 150_000, name: 'Rainbow Wave', blurb: 'Rainbow colours rolling through a wave of letters.', animated: true },
  { id: 'name-glitch', kind: 'name', tier: 3, price: 200_000, name: 'Glitch', blurb: 'RGB-split letters that tear and jitter.', animated: true },
  { id: 'name-chrome', kind: 'name', tier: 4, price: 300_000, name: 'Chrome', blurb: 'Polished chrome with a light that sweeps across it.', animated: true },
  { id: 'name-vapor', kind: 'name', tier: 4, price: 400_000, name: 'Vaporwave', blurb: 'A pink-to-cyan sunset gradient drifting through every letter.', animated: true },
  { id: 'name-molten', kind: 'name', tier: 5, price: 600_000, name: 'Molten Gold', blurb: 'Liquid gold flowing through your name, throwing off sparks.', animated: true },
  { id: 'name-hellfire', kind: 'name', tier: 5, price: 800_000, name: 'Hellfire', blurb: 'Letters burning in flickering flames.', animated: true },
  { id: 'name-frostbite', kind: 'name', tier: 6, price: 1_500_000, name: 'Frostbite', blurb: 'Frozen letters glinting with ice crystals and drifting frost.', animated: true },
  { id: 'name-galaxy', kind: 'name', tier: 6, price: 2_500_000, name: 'Galaxy', blurb: 'A drifting nebula full of stars inside every letter.', animated: true },
  { id: 'name-thunder', kind: 'name', tier: 7, price: 5_000_000, name: 'Thunderstruck', blurb: 'Electric letters with lightning crackling through them.', animated: true },
  { id: 'name-holo', kind: 'name', tier: 7, price: 8_000_000, name: 'Holo Foil', blurb: 'Prismatic foil that shifts through every colour as the light moves.', animated: true },
  { id: 'name-divine', kind: 'name', tier: 8, price: 20_000_000, name: 'Divine', blurb: 'Radiant white-gold letters with a halo of light rays and orbiting sparks.', animated: true },
  { id: 'name-sovereign', kind: 'name', tier: 8, price: 30_000_000, name: 'Sovereign', blurb: 'A jewelled crown on your name while gold rolls through it in a royal wave.', animated: true },
];

/**
 * Stackd Club cards: pure status. The card's badge sits next to your name
 * everywhere, and your profile shows the full card with your member number.
 */
export const CLUB_CARDS: Cosmetic[] = [
  { id: 'club-silver', kind: 'club', tier: 6, price: 1_000_000, name: 'Silver Card', blurb: 'Brushed silver. Your way into the Stackd Club.', animated: true },
  { id: 'club-gold', kind: 'club', tier: 7, price: 5_000_000, name: 'Gold Card', blurb: 'Solid gold with an embossed crest. Everyone notices.', animated: true },
  { id: 'club-platinum', kind: 'club', tier: 8, price: 15_000_000, name: 'Platinum Card', blurb: 'Platinum with a sapphire chip. Very few will ever hold one.', animated: true },
  { id: 'club-black', kind: 'club', tier: 8, price: 40_000_000, name: 'Black Card', blurb: 'Carbon black, gold foil and numbered. You know who has one.', animated: true },
  { id: 'club-infinite', kind: 'club', tier: 8, price: 100_000_000, name: 'Infinite', blurb: 'Prismatic obsidian that shifts with every glance. The ultimate flex.', animated: true },
];

export const COSMETICS: Cosmetic[] = [...FRAMES, ...BACKDROPS, ...NAME_STYLES, ...CLUB_CARDS];

export const COSMETICS_BY_KIND: Record<CosmeticKind, Cosmetic[]> = { frame: FRAMES, backdrop: BACKDROPS, name: NAME_STYLES, club: CLUB_CARDS };

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export function cosmeticById(id: string | null | undefined): Cosmetic | null {
  return (id && BY_ID.get(id)) || null;
}

/** Only render known cosmetics (protects against stale or tampered values). */
export function frameClass(id: string | null | undefined): string | null {
  const c = cosmeticById(id);
  return c && c.kind === 'frame' ? c.id : null;
}

export function backdropClass(id: string | null | undefined): string | null {
  const c = cosmeticById(id);
  return c && c.kind === 'backdrop' ? c.id : null;
}

export function nameStyleClass(id: string | null | undefined): string | null {
  const c = cosmeticById(id);
  return c && c.kind === 'name' ? c.id : null;
}

export function clubCard(id: string | null | undefined): Cosmetic | null {
  const c = cosmeticById(id);
  return c && c.kind === 'club' ? c : null;
}

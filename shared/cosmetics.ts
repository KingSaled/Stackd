/**
 * Cosmetic Shop catalogue. Items are bought with play chips only (never real
 * money). Prices here are for display; the database holds the authoritative
 * copy in public.cosmetics (supabase/schema.sql) and tests keep them in sync.
 */
export type CosmeticKind = 'frame' | 'backdrop';

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  blurb: string;
  price: number;
  /** 1 (entry) to 5 (flagship). */
  tier: 1 | 2 | 3 | 4 | 5;
  animated?: boolean;
}

/**
 * Two items per rarity. Ids are permanent: players own items by id, so an item
 * can be redrawn or renamed but its id must never change.
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
];

export const COSMETICS: Cosmetic[] = [...FRAMES, ...BACKDROPS];

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

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

export const FRAMES: Cosmetic[] = [
  { id: 'frame-steel', kind: 'frame', tier: 1, price: 5_000, name: 'Gunmetal', blurb: 'Brushed steel ring with a machined bevel.' },
  { id: 'frame-gold', kind: 'frame', tier: 2, price: 15_000, name: 'Royal Gold', blurb: 'Polished gold with an inner black-enamel line.' },
  { id: 'frame-ruby', kind: 'frame', tier: 3, price: 40_000, name: 'Ruby Facets', blurb: 'Cut-gem ring that catches the light.' },
  { id: 'frame-diamond', kind: 'frame', tier: 4, price: 100_000, name: 'Diamond', blurb: 'Ice-white facets with a slow travelling glint.', animated: true },
  { id: 'frame-mythic', kind: 'frame', tier: 5, price: 250_000, name: 'Mythic Inferno', blurb: 'A spinning ring of fire with orbiting embers. The flashiest seat at any table.', animated: true },
];

export const BACKDROPS: Cosmetic[] = [
  { id: 'bg-felt', kind: 'backdrop', tier: 1, price: 3_000, name: 'Card Room', blurb: 'Classic green baize under a warm lamp.' },
  { id: 'bg-sunset', kind: 'backdrop', tier: 2, price: 8_000, name: 'Strip Sunset', blurb: 'Neon pink and orange desert sky.' },
  { id: 'bg-ocean', kind: 'backdrop', tier: 3, price: 20_000, name: 'Deep Sea', blurb: 'Rippling light over dark water.' },
  { id: 'bg-velvet', kind: 'backdrop', tier: 4, price: 50_000, name: 'High Roller Velvet', blurb: 'Purple velvet with a gold damask pattern.' },
  { id: 'bg-galaxy', kind: 'backdrop', tier: 5, price: 120_000, name: 'Galaxy', blurb: 'A drifting nebula full of twinkling stars.', animated: true },
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

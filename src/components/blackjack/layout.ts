/**
 * Geometry of the blackjack table, in stage pixels. The table is a true half
 * circle: the dealer works the straight top edge and six seats sit round the
 * curved rail. Each player's betting circle sits right in front of them and
 * their cards land just in front of the circle, angled towards the player.
 * Seat 0 is "first base" (the dealer's left, the viewer's right) and plays first.
 *
 * On tall phone screens the half circle spans the width and the player's own
 * hand is shown large underneath it (the "hero" area).
 */
export interface Pt {
  x: number;
  y: number;
}

export interface SeatSpot {
  /** Player avatar on the rail. */
  avatar: Pt;
  /** Betting circle, just in front of the player. */
  circle: Pt;
  /** Where the player's cards land, just in front of the circle. */
  cards: Pt;
  /** Card rotation so cards lean towards the player (degrees). */
  rotate: number;
  /** Unit vectors in the card's frame: along the card's width and towards the dealer. */
  across: Pt;
  up: Pt;
}

export interface BjLayout {
  portrait: boolean;
  /** Half-circle centre (middle of the dealer's edge) and radius, rail included. */
  cx: number;
  top: number;
  R: number;
  rail: number;
  cardW: number;
  dealerCardW: number;
  avatar: number;
  circleR: number;
  seats: SeatSpot[];
  dealer: Pt;
  /** Where dealt cards fly in from (the dealer's right hand). */
  deck: Pt;
  /** Radius of the printed "Blackjack pays 3 to 2" line. */
  printR: number;
  /** Phone layout: the player's own hand, shown large under the table. */
  hero: { x: number; y: number; cardW: number; h: number } | null;
}

const rad = (d: number) => (d * Math.PI) / 180;

export function bjLayout(w: number, h: number, portrait: boolean): BjLayout {
  const margin = portrait ? 14 : Math.max(60, w * 0.06);
  // A true half circle: as wide as the stage allows, never taller than it.
  const R = portrait ? Math.min(w / 2 - margin, h * 0.48) : Math.min(w / 2 - margin, h - 90);
  const rail = portrait ? Math.max(10, R * 0.06) : Math.max(16, R * 0.045);
  const cardW = portrait ? Math.max(24, Math.min(34, R * 0.16)) : Math.max(36, Math.min(60, R * 0.11));
  const dealerCardW = portrait ? Math.min(50, R * 0.25) : cardW * 1.08;
  const avatar = portrait ? Math.max(28, Math.min(36, R * 0.18)) : Math.max(40, Math.min(64, R * 0.12));
  const circleR = portrait ? 15 : cardW * 0.5;
  const cx = w / 2;
  const top = portrait ? 4 : Math.max(8, (h - R - avatar * 1.3) / 2);

  const seats: SeatSpot[] = Array.from({ length: 6 }, (_, i) => {
    const deg = 18 + i * 28.8;
    const c = Math.cos(rad(deg));
    const s = Math.sin(rad(deg));
    const at = (r: number): Pt => ({ x: cx + c * r, y: top + s * r });
    const rAvatar = R - rail / 2;
    // Betting circle just clear of the avatar; cards (or, on phones, the hand total) just in front of it.
    const rCircle = rAvatar - avatar * 0.5 - circleR - (portrait ? 4 : 10);
    const rCards = portrait ? rCircle - circleR - 11 : rCircle - circleR - cardW * 0.7 - 8;
    // Cards lean towards the player without turning sideways.
    const rotate = (deg - 90) * (portrait ? 0.5 : 0.42);
    const p = rad(rotate);
    return {
      avatar: at(rAvatar),
      circle: at(rCircle),
      cards: at(rCards),
      rotate,
      across: { x: Math.cos(p), y: Math.sin(p) },
      up: { x: Math.sin(p), y: -Math.cos(p) },
    };
  });

  const hero = portrait ? { x: cx, y: top + R + (h - top - R) * 0.4, cardW: Math.min(88, w * 0.22), h: h - top - R } : null;

  return {
    portrait,
    cx,
    top,
    R,
    rail,
    cardW,
    dealerCardW,
    avatar,
    circleR,
    seats,
    dealer: { x: cx, y: top + rail + dealerCardW * 0.95 },
    deck: { x: cx + R * 0.45, y: top - dealerCardW },
    printR: R * (portrait ? 0.5 : 0.45),
    hero,
  };
}

/** Offset of card `j`: each card overlaps the last, up and to the right in the card's own frame. */
export function cardOffset(j: number, spot: Pick<SeatSpot, 'across' | 'up'>, cardW: number): Pt {
  const a = cardW * 0.24 * j;
  const u = cardW * 0.3 * j;
  return { x: spot.across.x * a + spot.up.x * u, y: spot.across.y * a + spot.up.y * u };
}

export interface HeroFit {
  /** Card width for the player's own hand(s). */
  cardW: number;
  /** Gap between overlapping cards in a hand. */
  step: number;
  /** Where each hand's first card goes and the hand's middle (for its total). */
  hands: { first: number; mid: number }[];
  /** Vertical centre of the cards and where the label above them goes. */
  y: number;
  labelY: number;
}

/**
 * Phone layout for the player's own hand(s) under the table. Cards fan out
 * sideways only (never climbing back up into the table), split hands sit side
 * by side, and everything shrinks as needed to stay on screen.
 */
export function heroFit(L: BjLayout, stageW: number, stageH: number, counts: number[]): HeroFit {
  const hero = L.hero!;
  const H = Math.max(1, counts.length);
  const stepF = 0.36;
  const gapF = 0.3;
  const avail = stageW - 40;
  const span = (cw: number) => counts.reduce((a, n) => a + cw * (1 + Math.max(0, n - 1) * stepF), 0) + (H - 1) * cw * gapF;
  // Room between the bottom of the table (and the player's avatar on it) and the bottom of the stage.
  const tableBottom = L.top + L.R + L.avatar * 0.5 + 18;
  const room = stageH - tableBottom;
  let cw = hero.cardW * (H > 1 ? 0.86 : 1);
  // Label (22) + cards (1.4 cw) + total below (34) must fit the room.
  cw = Math.min(cw, (room - 22 - 34) / 1.4);
  const need = span(cw);
  if (need > avail) cw *= avail / need;
  cw = Math.max(26, cw);
  const step = cw * stepF;
  // The cards sit a little above the middle of the room, never closer to the table than the label allows.
  const y = Math.max(tableBottom + 22 + cw * 0.7, Math.min(hero.y, stageH - 34 - cw * 0.7));
  let x = L.cx - span(cw) / 2;
  const hands = counts.map((n) => {
    const w = cw * (1 + Math.max(0, n - 1) * stepF);
    const r = { first: x + cw / 2, mid: x + w / 2 };
    x += w + cw * gapF;
    return r;
  });
  return { cardW: cw, step, hands, y, labelY: y - cw * 0.7 - 14 };
}

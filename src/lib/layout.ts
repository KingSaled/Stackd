/**
 * Table geometry. Seats are distributed evenly by arc length around an ellipse
 * (so they don't bunch up at the narrow ends), starting at bottom-center and
 * going clockwise — the same direction the action moves.
 */

export interface Point {
  x: number; // percent of stage width
  y: number; // percent of stage height
}

export interface StageGeometry {
  center: Point;
  /** Seat ring radii in percent of width / height. */
  rx: number;
  ry: number;
}

export function stageGeometry(portrait: boolean): StageGeometry {
  return portrait ? { center: { x: 50, y: 46 }, rx: 39, ry: 39 } : { center: { x: 50, y: 46 }, rx: 44, ry: 39 };
}

const cache = new Map<string, Point[]>();

export function seatPositions(n: number, portrait: boolean, aspect: number): Point[] {
  const key = `${n}:${portrait}:${aspect.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = stageGeometry(portrait);
  // Work in a pixel-like space so arc length is visually uniform.
  const W = 1000;
  const H = 1000 / aspect;
  const rx = (g.rx / 100) * W;
  const ry = (g.ry / 100) * H;
  const SAMPLES = 720;
  const pts: { x: number; y: number; d: number }[] = [];
  let d = 0;
  let prev: { x: number; y: number } | null = null;
  for (let i = 0; i <= SAMPLES; i++) {
    // Start at the bottom (90°) and go clockwise on screen (increasing angle with y down).
    const a = Math.PI / 2 + (i / SAMPLES) * Math.PI * 2;
    const p = { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
    if (prev) d += Math.hypot(p.x - prev.x, p.y - prev.y);
    pts.push({ ...p, d });
    prev = p;
  }
  const total = d;
  const out: Point[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (j < pts.length - 1 && pts[j + 1].d < target) j++;
    const p = pts[j];
    out.push({ x: g.center.x + (p.x / W) * 100, y: g.center.y + (p.y / H) * 100 });
  }
  cache.set(key, out);
  return out;
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Pixel offset from `from` to `to` given the stage size. */
export function delta(from: Point, to: Point, w: number, h: number) {
  return { x: ((to.x - from.x) / 100) * w, y: ((to.y - from.y) / 100) * h };
}

/* ------------------------------------------------------------------------ */
/* Portrait (phone) layout                                                   */
/* ------------------------------------------------------------------------ */

/** Where a seat's hole cards sit relative to its avatar. */
export type CardMode = 'toward' | 'up' | 'left' | 'right' | 'hero';

export interface PortraitSlot {
  pos: Point;
  bet: Point;
  cards: CardMode;
  /** Which side of the avatar the dealer button goes on. */
  dealerSide: -1 | 1;
}

/**
 * Hand-placed seat slots for tall phone screens. Seats stay out of the
 * horizontal band occupied by the board (~40–52% height) so nothing ever
 * covers community cards, and every seat has room for its cards and bet.
 * Listed clockwise from the bottom (the viewer's own seat).
 */
const P_SLOTS: Record<string, PortraitSlot> = {
  H: { pos: { x: 50, y: 88 }, bet: { x: 50, y: 66.5 }, cards: 'hero', dealerSide: -1 },
  BL: { pos: { x: 18, y: 88 }, bet: { x: 25, y: 75.5 }, cards: 'up', dealerSide: 1 },
  LL: { pos: { x: 12.5, y: 64.5 }, bet: { x: 30, y: 64.5 }, cards: 'up', dealerSide: 1 },
  LU: { pos: { x: 12.5, y: 27 }, bet: { x: 30, y: 29.5 }, cards: 'up', dealerSide: 1 },
  TL: { pos: { x: 29, y: 10 }, bet: { x: 33, y: 24 }, cards: 'right', dealerSide: -1 },
  T: { pos: { x: 50, y: 10 }, bet: { x: 50, y: 24 }, cards: 'right', dealerSide: -1 },
  TR: { pos: { x: 71, y: 10 }, bet: { x: 67, y: 24 }, cards: 'left', dealerSide: 1 },
  RU: { pos: { x: 87.5, y: 27 }, bet: { x: 70, y: 29.5 }, cards: 'up', dealerSide: -1 },
  RL: { pos: { x: 87.5, y: 64.5 }, bet: { x: 70, y: 64.5 }, cards: 'up', dealerSide: -1 },
  BR: { pos: { x: 82, y: 88 }, bet: { x: 75, y: 75.5 }, cards: 'up', dealerSide: -1 },
};

const P_SETS: Record<number, string[]> = {
  2: ['H', 'T'],
  3: ['H', 'LU', 'RU'],
  4: ['H', 'LU', 'T', 'RU'],
  5: ['H', 'LL', 'TL', 'TR', 'RL'],
  6: ['H', 'LL', 'LU', 'T', 'RU', 'RL'],
  7: ['H', 'LL', 'LU', 'TL', 'TR', 'RU', 'RL'],
  8: ['H', 'BL', 'LL', 'LU', 'T', 'RU', 'RL', 'BR'],
  9: ['H', 'BL', 'LL', 'LU', 'TL', 'TR', 'RU', 'RL', 'BR'],
};

/** Slots indexed by display position (0 = bottom/viewer, clockwise). */
export function portraitSlots(n: number): PortraitSlot[] {
  const set = P_SETS[Math.max(2, Math.min(9, n))];
  return set.map((k) => P_SLOTS[k]);
}

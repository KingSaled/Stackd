/**
 * Table geometry. Seats are spaced evenly by distance along the rail, starting
 * at bottom-centre and going clockwise (the direction the action moves). The
 * rail is a pill (straight top and bottom, round ends), so seats follow that
 * shape: on an ellipse the corner seats would drift in over the felt.
 */

export interface Point {
  x: number; // percent of stage width
  y: number; // percent of stage height
}

export interface StageGeometry {
  center: Point;
  /** The rail's outer box (percent insets of the stage); matches .table-rail in table.css. */
  rail: { left: number; right: number; top: number; bottom: number };
}

export function stageGeometry(portrait: boolean): StageGeometry {
  return portrait
    ? { center: { x: 50, y: 46 }, rail: { left: 9, right: 9, top: 7, bottom: 15 } }
    : { center: { x: 50, y: 46 }, rail: { left: 6, right: 6, top: 8, bottom: 16 } };
}

const cache = new Map<string, Point[]>();

export function seatPositions(n: number, portrait: boolean, aspect: number): Point[] {
  const key = `${n}:${portrait}:${aspect.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = stageGeometry(portrait);
  // Work in a pixel-like space so distances are visually uniform.
  const W = 1000;
  const H = 1000 / aspect;
  const x0 = (g.rail.left / 100) * W;
  const x1 = W - (g.rail.right / 100) * W;
  const y0 = (g.rail.top / 100) * H;
  const y1 = H - (g.rail.bottom / 100) * H;
  // Seats sit on the middle of the leather (the rail is ~5.8% of its height thick).
  const inset = Math.min(x1 - x0, y1 - y0) * 0.029;
  const left = x0 + inset;
  const right = x1 - inset;
  const top = y0 + inset;
  const bottom = y1 - inset;
  const r = Math.min(right - left, bottom - top) / 2;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const hx = (right - left) / 2 - r; // half-length of the straight top/bottom edges
  const hy = (bottom - top) / 2 - r; // half-length of straight sides (tall tables)

  // Outline as a dense polyline, clockwise on screen from bottom-centre.
  const pts: { x: number; y: number }[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) => {
    for (let i = 0; i < 60; i++) pts.push({ x: ax + ((bx - ax) * i) / 60, y: ay + ((by - ay) * i) / 60 });
  };
  const arc = (ox: number, oy: number, from: number, to: number) => {
    for (let i = 0; i < 180; i++) {
      const a = from + ((to - from) * i) / 180;
      pts.push({ x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r });
    }
  };
  const P = Math.PI;
  line(cx, cy + hy + r, cx - hx, cy + hy + r);
  arc(cx - hx, cy + hy, P / 2, P);
  line(cx - hx - r, cy + hy, cx - hx - r, cy - hy);
  arc(cx - hx, cy - hy, P, 1.5 * P);
  line(cx - hx, cy - hy - r, cx + hx, cy - hy - r);
  arc(cx + hx, cy - hy, 1.5 * P, 2 * P);
  line(cx + hx + r, cy - hy, cx + hx + r, cy + hy);
  arc(cx + hx, cy + hy, 0, P / 2);
  line(cx + hx, cy + hy + r, cx, cy + hy + r);
  pts.push({ x: cx, y: cy + hy + r });

  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = dist[dist.length - 1];
  const out: Point[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (j < pts.length - 2 && dist[j + 1] < target) j++;
    const t = (target - dist[j]) / Math.max(1e-9, dist[j + 1] - dist[j]);
    const x = pts[j].x + (pts[j + 1].x - pts[j].x) * t;
    const y = pts[j].y + (pts[j + 1].y - pts[j].y) * t;
    out.push({ x: (x / W) * 100, y: (y / H) * 100 });
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
  H: { pos: { x: 50, y: 88 }, bet: { x: 50, y: 64 }, cards: 'hero', dealerSide: -1 },
  BL: { pos: { x: 18, y: 88 }, bet: { x: 24, y: 77 }, cards: 'up', dealerSide: 1 },
  LL: { pos: { x: 12.5, y: 64.5 }, bet: { x: 30, y: 64.5 }, cards: 'up', dealerSide: 1 },
  LU: { pos: { x: 12.5, y: 27 }, bet: { x: 30, y: 29.5 }, cards: 'up', dealerSide: 1 },
  TL: { pos: { x: 29, y: 10 }, bet: { x: 33, y: 24 }, cards: 'right', dealerSide: -1 },
  T: { pos: { x: 50, y: 10 }, bet: { x: 50, y: 24 }, cards: 'right', dealerSide: -1 },
  TR: { pos: { x: 71, y: 10 }, bet: { x: 67, y: 24 }, cards: 'left', dealerSide: 1 },
  RU: { pos: { x: 87.5, y: 27 }, bet: { x: 70, y: 29.5 }, cards: 'up', dealerSide: -1 },
  RL: { pos: { x: 87.5, y: 64.5 }, bet: { x: 70, y: 64.5 }, cards: 'up', dealerSide: -1 },
  BR: { pos: { x: 82, y: 88 }, bet: { x: 76, y: 77 }, cards: 'up', dealerSide: -1 },
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

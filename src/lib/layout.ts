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

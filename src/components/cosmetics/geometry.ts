/** Small geometry helpers shared by the vector cosmetic art. 0° is 12 o'clock, angles run clockwise. */
export const rad = (deg: number) => (deg * Math.PI) / 180;

export function pt(r: number, deg: number, cx = 0, cy = 0) {
  return { x: +(cx + r * Math.sin(rad(deg))).toFixed(3), y: +(cy - r * Math.cos(rad(deg))).toFixed(3) };
}

/** SVG path for a clockwise arc of radius r from angle a to angle b. */
export function arc(r: number, a: number, b: number, cx = 0, cy = 0) {
  const p = pt(r, a, cx, cy);
  const q = pt(r, b, cx, cy);
  const large = (((b - a) % 360) + 360) % 360 > 180 ? 1 : 0;
  return `M${p.x} ${p.y}A${r} ${r} 0 ${large} 1 ${q.x} ${q.y}`;
}

export const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Deterministic pseudo-random numbers so art looks hand-placed but never changes between renders. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Regular polygon points around (0,0). */
export function polygon(n: number, r: number, rot = 0) {
  return range(n)
    .map((i) => {
      const p = pt(r, rot + (i * 360) / n);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

/** Four-point sparkle star centred on (0,0). */
export function sparkle(size: number) {
  const s = size;
  const k = s * 0.22;
  return `M0 ${-s}C${k * 0.4} ${-k} ${k} ${-k * 0.4} ${s} 0C${k} ${k * 0.4} ${k * 0.4} ${k} 0 ${s}C${-k * 0.4} ${k} ${-k} ${k * 0.4} ${-s} 0C${-k} ${-k * 0.4} ${-k * 0.4} ${-k} 0 ${-s}Z`;
}

/** Hex colour interpolation for gradient-like segment colouring. */
export function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

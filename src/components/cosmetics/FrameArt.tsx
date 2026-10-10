/**
 * Vector art for Cosmetic Shop borders. Everything is SVG so rings, gems and
 * flames stay perfectly smooth at every avatar size (28px chat bubbles up to
 * the 132px profile picture). The viewBox is 120 units across with the avatar
 * circle at radius 50, so the ring band sits on the avatar's edge and
 * decorations can reach out to radius 60. Animations live in cosmetics.css.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { arc, mix, polygon, pt, range, seeded, sparkle } from './geometry';
import { HIGH_FRAME_ART } from './FrameArtHigh';

type Art = (u: string) => ReactNode;

const R = 50.5; // centre line of the ring band

const ring = (r: number, stroke: string, width: number, extra?: Record<string, unknown>) => (
  <circle r={r} fill="none" stroke={stroke} strokeWidth={width} {...extra} />
);

const delay = (s: number, dur?: number): CSSProperties => ({ animationDelay: `${s}s`, ...(dur ? { animationDuration: `${dur}s` } : {}) });

/* ------------------------------------------------------------------ Common */

const gunmetal: Art = (u) => (
  <>
    <defs>
      <linearGradient id={`${u}s`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f6f8fb" />
        <stop offset=".22" stopColor="#a9b1bd" />
        <stop offset=".48" stopColor="#4a515d" />
        <stop offset=".7" stopColor="#c6ccd5" />
        <stop offset="1" stopColor="#343a44" />
      </linearGradient>
      <radialGradient id={`${u}r`} cx=".35" cy=".35" r=".7">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".5" stopColor="#9aa2ae" />
        <stop offset="1" stopColor="#2b3038" />
      </radialGradient>
    </defs>
    {ring(R, '#11151b', 10)}
    {ring(R, `url(#${u}s)`, 8)}
    {ring(54.2, 'rgba(255,255,255,.4)', 0.6)}
    {ring(46.9, 'rgba(0,0,0,.55)', 0.9)}
    {range(8).map((i) => {
      const p = pt(R, i * 45 + 22.5);
      return <circle key={i} cx={p.x} cy={p.y} r={1.6} fill={`url(#${u}r)`} stroke="#1a1e25" strokeWidth={0.35} />;
    })}
  </>
);

const houseChip: Art = (u) => (
  <>
    <defs>
      <linearGradient id={`${u}g`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".5" />
        <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".3" />
      </linearGradient>
    </defs>
    {ring(R, '#0e0f13', 10.2)}
    {ring(R, '#c8203d', 8.4)}
    {ring(R, '#f7f3ea', 8.4, { pathLength: 80, strokeDasharray: '4 6', strokeDashoffset: 2 })}
    {ring(R, '#1d4fb8', 8.4, { pathLength: 80, strokeDasharray: '1 9', strokeDashoffset: -3.5 })}
    {ring(R, `url(#${u}g)`, 8.4)}
    {ring(46.8, 'rgba(255,255,255,.8)', 0.55, { pathLength: 160, strokeDasharray: '1.4 1.3' })}
    {ring(54.3, 'rgba(255,255,255,.3)', 0.5)}
  </>
);

/* ------------------------------------------------------------------ Rare */

const goldStops = (
  <>
    <stop offset="0" stopColor="#fff6cf" />
    <stop offset=".18" stopColor="#f3cf6a" />
    <stop offset=".42" stopColor="#a46f17" />
    <stop offset=".6" stopColor="#ffe39b" />
    <stop offset=".8" stopColor="#94600f" />
    <stop offset="1" stopColor="#e2ad45" />
  </>
);

const royalGold: Art = (u) => (
  <>
    <defs>
      <linearGradient id={`${u}g`} x1="0" y1="0" x2=".9" y2="1">
        {goldStops}
      </linearGradient>
      <radialGradient id={`${u}b`} cx=".35" cy=".3" r=".8">
        <stop offset="0" stopColor="#fffbe6" />
        <stop offset=".6" stopColor="#f0c75c" />
        <stop offset="1" stopColor="#8a5a10" />
      </radialGradient>
      <radialGradient id={`${u}d`} cx=".35" cy=".3" r=".8">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".4" stopColor="#d9f2ff" />
        <stop offset=".75" stopColor="#7cc3ee" />
        <stop offset="1" stopColor="#2f6f9e" />
      </radialGradient>
    </defs>
    {ring(R, '#3d2604', 10.4)}
    {ring(R, `url(#${u}g)`, 8.6)}
    {ring(46.6, '#120b02', 1.4)}
    {ring(45.7, '#f2cc6b', 0.5)}
    {ring(54.4, '#fff1c2', 0.45, { opacity: 0.75 })}
    {range(36)
      .filter((i) => i % 9 !== 0)
      .map((i) => {
        const p = pt(R, i * 10);
        return <circle key={i} cx={p.x} cy={p.y} r={0.95} fill={`url(#${u}b)`} />;
      })}
    {[0, 90, 180, 270].map((a) => {
      const p = pt(R, a);
      return (
        <g key={a} transform={`translate(${p.x} ${p.y}) rotate(${a})`}>
          <circle r={3.9} fill={`url(#${u}g)`} stroke="#5a3906" strokeWidth={0.45} />
          <path d="M0 -3 L2.3 0 L0 3 L-2.3 0Z" fill={`url(#${u}d)`} stroke="#2b5e86" strokeWidth={0.25} />
          <path d="M0 -3 L0 3 M-2.3 0 L2.3 0" stroke="#fff" strokeOpacity=".45" strokeWidth={0.2} />
        </g>
      );
    })}
  </>
);

const vegasNeon: Art = (u) => (
  <>
    <defs>
      <filter id={`${u}b`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.8" />
      </filter>
    </defs>
    {ring(R, '#12051c', 10)}
    {ring(R, '#250a36', 7.4)}
    {range(4).map((k) => {
      const color = k % 2 ? '#3ff0ff' : '#ff3fd1';
      const d = arc(R, k * 90 + 7, k * 90 + 83);
      return (
        <g key={k} className={k === 1 ? 'fx-neon-buzz' : undefined}>
          <path d={d} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" opacity={0.7} filter={`url(#${u}b)`} />
          <path d={d} fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
          <path d={d} fill="none" stroke="#fff" strokeWidth={0.9} strokeLinecap="round" opacity={0.85} />
        </g>
      );
    })}
    {range(4).map((k) => {
      const p = pt(R, k * 90);
      return <rect key={k} x={p.x - 1.4} y={p.y - 1.4} width={2.8} height={2.8} rx={0.6} fill="#5c5f6b" stroke="#1b1c22" strokeWidth={0.4} transform={`rotate(${k * 90} ${p.x} ${p.y})`} />;
    })}
  </>
);

/* ------------------------------------------------------------------ Epic */

const octa = polygon(8, 4.3, 22.5);
const octaTable = polygon(8, 2.2, 22.5);

const rubyFacets: Art = (u) => (
  <>
    <defs>
      <linearGradient id={`${u}g`} x1="0" y1="0" x2=".9" y2="1">
        {goldStops}
      </linearGradient>
      <radialGradient id={`${u}r`} cx=".35" cy=".3" r=".8">
        <stop offset="0" stopColor="#ffd1da" />
        <stop offset=".25" stopColor="#ff4d6d" />
        <stop offset=".6" stopColor="#d4002f" />
        <stop offset="1" stopColor="#5a0013" />
      </radialGradient>
      <radialGradient id={`${u}b`} cx=".35" cy=".3" r=".8">
        <stop offset="0" stopColor="#fffbe6" />
        <stop offset=".6" stopColor="#f0c75c" />
        <stop offset="1" stopColor="#8a5a10" />
      </radialGradient>
    </defs>
    {ring(R, '#2b1503', 10.4)}
    {ring(R, `url(#${u}g)`, 8.4)}
    {ring(46.3, '#1a0c02', 1.1)}
    {ring(R, '#ff2d55', 8.4, { opacity: 0.12 })}
    {range(8).map((i) => {
      const p = pt(R, i * 45 + 22.5);
      return <circle key={i} cx={p.x} cy={p.y} r={1.25} fill={`url(#${u}b)`} />;
    })}
    {range(8).map((i) => {
      const a = i * 45;
      const p = pt(R, a);
      const outer = octa.split(' ');
      const inner = octaTable.split(' ');
      return (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${a})`}>
          <circle r={5.4} fill={`url(#${u}g)`} stroke="#4a2c05" strokeWidth={0.45} />
          <polygon points={octa} fill={`url(#${u}r)`} stroke="#4d0011" strokeWidth={0.3} />
          <path d={outer.map((o, j) => `M${o.replace(',', ' ')}L${inner[j].replace(',', ' ')}`).join('')} stroke="#fff" strokeOpacity=".3" strokeWidth={0.22} />
          <polygon points={octaTable} fill="#fff" fillOpacity=".16" stroke="#fff" strokeOpacity=".5" strokeWidth={0.22} />
          <ellipse className="fx-glint" style={delay(i * 0.45)} cx={-1.3} cy={-1.5} rx={1.1} ry={0.7} fill="#fff" />
        </g>
      );
    })}
  </>
);

/** Jagged lightning following the ring between two angles. */
function bolt(a: number, b: number, seed: number) {
  const rnd = seeded(seed);
  const steps = Math.round((b - a) / 5);
  return range(steps + 1)
    .map((i) => {
      const r = R + (i === 0 || i === steps ? 0 : (rnd() - 0.5) * 7.5);
      const p = pt(r, a + ((b - a) * i) / steps);
      return `${i ? 'L' : 'M'}${p.x} ${p.y}`;
    })
    .join('');
}

const storm: Art = (u) => (
  <>
    <defs>
      <linearGradient id={`${u}s`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6c7a96" />
        <stop offset=".45" stopColor="#1b2232" />
        <stop offset=".75" stopColor="#3b4762" />
        <stop offset="1" stopColor="#151b28" />
      </linearGradient>
      <filter id={`${u}b`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.3" />
      </filter>
    </defs>
    {ring(R, '#070a12', 10.4)}
    {ring(R, `url(#${u}s)`, 8.4)}
    {ring(R, '#59c8ff', 8.4, { opacity: 0.14 })}
    {ring(46.4, '#6fd2ff', 0.6, { opacity: 0.7 })}
    {ring(54.4, '#6fd2ff', 0.4, { opacity: 0.45 })}
    <g className="fx-spin" style={{ animationDuration: '14s' }}>
      {[
        [10, 85, 3],
        [130, 205, 7],
        [250, 330, 11],
      ].map(([a, b, s], i) => {
        const d = bolt(a, b, s);
        return (
          <g key={i} className="fx-flicker" style={delay(i * -0.53, 1.6 + i * 0.3)}>
            <path d={d} fill="none" stroke="#5fd4ff" strokeWidth={2.8} strokeLinejoin="round" filter={`url(#${u}b)`} />
            <path d={d} fill="none" stroke="#effdff" strokeWidth={0.85} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
    </g>
  </>
);

/* ------------------------------------------------------------------ Legendary */

const brilliant = polygon(8, 3.7, 22.5);

const diamond: Art = (u) => (
  <>
    <defs>
      <linearGradient id={`${u}p`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".2" stopColor="#dfe6ee" />
        <stop offset=".45" stopColor="#8d99aa" />
        <stop offset=".62" stopColor="#f7fbff" />
        <stop offset=".85" stopColor="#7d899b" />
        <stop offset="1" stopColor="#e6ecf3" />
      </linearGradient>
      <radialGradient id={`${u}d`} cx=".4" cy=".35" r=".75">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".35" stopColor="#eef9ff" />
        <stop offset=".7" stopColor="#a9dcfa" />
        <stop offset="1" stopColor="#4f97cc" />
      </radialGradient>
      <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset=".5" stopColor="#fff" stopOpacity=".95" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
    {ring(R, '#2a3140', 10.4)}
    {ring(R, `url(#${u}p)`, 8.6)}
    {ring(R, '#bfe9ff', 8.6, { opacity: 0.12 })}
    {ring(46.2, '#ffffff', 0.45, { opacity: 0.7 })}
    {range(12).map((i) => {
      const a = i * 30;
      const p = pt(R, a);
      return (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${a})`}>
          {[45, 135, 225, 315].map((k) => {
            const q = pt(3.9, k);
            return <circle key={k} cx={q.x} cy={q.y} r={0.6} fill="#eef3f8" stroke="#6b7789" strokeWidth={0.2} />;
          })}
          <polygon points={brilliant} fill={`url(#${u}d)`} stroke="#9fb8cf" strokeWidth={0.3} />
          <path d="M0 -3.7L1.2 0L0 3.7L-1.2 0ZM-3.7 0L0 -1.2L3.7 0L0 1.2Z" fill="#fff" fillOpacity=".35" />
          <polygon points={polygon(8, 1.6, 22.5)} fill="#fff" fillOpacity=".45" />
        </g>
      );
    })}
    <g className="fx-spin" style={{ animationDuration: '4.5s' }}>
      <path d={arc(R, -28, 28)} fill="none" stroke={`url(#${u}g)`} strokeWidth={9} strokeLinecap="round" opacity={0.75} style={{ mixBlendMode: 'screen' }} />
    </g>
    {[25, 145, 262].map((a, i) => {
      const p = pt(57, a);
      return (
        <g key={a} transform={`translate(${p.x} ${p.y})`}>
          <path className="fx-twinkle" style={delay(i * 0.9, 2.7)} d={sparkle(2.6)} fill="#fff" />
        </g>
      );
    })}
  </>
);

const HOLO = ['#ff6ad5', '#c774e8', '#ad8cff', '#8795e8', '#94d0ff', '#7afcff', '#b6ffb2', '#fffb96', '#ffb38a', '#ff6ad5'];
const holoColor = (t: number) => {
  const x = t * (HOLO.length - 1);
  const i = Math.min(HOLO.length - 2, Math.floor(x));
  return mix(HOLO[i], HOLO[i + 1], x - i);
};

const holoPrism: Art = (u) => (
  <>
    <defs>
      <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset=".5" stopColor="#fff" stopOpacity=".9" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
    {ring(R, '#1c1830', 10.4)}
    <g className="fx-spin" style={{ animationDuration: '7s' }}>
      {range(72).map((i) => (
        <path key={i} d={arc(R, i * 5 - 0.4, i * 5 + 5.4)} fill="none" stroke={holoColor(i / 72)} strokeWidth={8.6} />
      ))}
    </g>
    {ring(R, '#ffffff', 8.6, { opacity: 0.18, pathLength: 60, strokeDasharray: '1 2' })}
    {ring(54.4, '#ffffff', 0.6, { opacity: 0.85 })}
    {ring(46.6, '#ffffff', 0.6, { opacity: 0.85 })}
    <g className="fx-spin fx-rev" style={{ animationDuration: '3.6s' }}>
      <path d={arc(R, -24, 24)} fill="none" stroke={`url(#${u}g)`} strokeWidth={8.6} opacity={0.7} style={{ mixBlendMode: 'screen' }} />
    </g>
    {[40, 160, 285].map((a, i) => {
      const p = pt(57.2, a);
      return (
        <g key={a} transform={`translate(${p.x} ${p.y})`}>
          <path className="fx-twinkle" style={delay(i * 0.8, 2.4)} d={sparkle(2.5)} fill="#fff" />
        </g>
      );
    })}
  </>
);

/* ------------------------------------------------------------------ Mythic */

/** Flame tongue with its base on y=0, pointing to -h. */
const flame = (w: number, h: number) =>
  `M${-w} 0C${-w} ${-h * 0.38} ${-w * 0.15} ${-h * 0.55} ${w * 0.1} ${-h}C${w * 0.15} ${-h * 0.62} ${w} ${-h * 0.42} ${w} 0Z`;

const inferno: Art = (u) => {
  const back = flame(5, 16);
  const mid = flame(3.6, 11.5);
  const front = flame(2.3, 7.5);
  return (
    <>
      <defs>
        <linearGradient id={`${u}f`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffb02e" />
          <stop offset=".35" stopColor="#ff5a1f" />
          <stop offset=".75" stopColor="#d4180e" />
          <stop offset="1" stopColor="#7a0606" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}o`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffe57a" />
          <stop offset=".4" stopColor="#ff9a1f" />
          <stop offset="1" stopColor="#ff3b1f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}y`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".35" stopColor="#fff1a0" />
          <stop offset="1" stopColor="#ffb300" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd25a" />
          <stop offset=".3" stopColor="#ff6a10" />
          <stop offset=".6" stopColor="#a8150a" />
          <stop offset="1" stopColor="#ff8a1e" />
        </linearGradient>
        <radialGradient id={`${u}e`}>
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset=".5" stopColor="#ffb02e" />
          <stop offset="1" stopColor="#ff4d00" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}h`} r=".5">
          <stop offset=".78" stopColor="#ff6a00" stopOpacity="0" />
          <stop offset=".86" stopColor="#ff6a00" stopOpacity=".55" />
          <stop offset="1" stopColor="#ff2d00" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="64" fill={`url(#${u}h)`} />
      {range(16).map((i) => {
        const a = i * 22.5;
        const p = pt(48, a);
        return (
          <g key={`b${i}`} transform={`translate(${p.x} ${p.y}) rotate(${a})`}>
            <path className="fx-flame" style={delay(-((i * 0.37) % 1.1), 1 + (i % 4) * 0.17)} d={back} fill={`url(#${u}f)`} />
          </g>
        );
      })}
      {range(16).map((i) => {
        const a = i * 22.5 + 11.25;
        const p = pt(50, a);
        return (
          <g key={`m${i}`} transform={`translate(${p.x} ${p.y}) rotate(${a})`}>
            <path className="fx-flame" style={delay(-((i * 0.23) % 0.9), 0.8 + (i % 3) * 0.15)} d={mid} fill={`url(#${u}o)`} />
          </g>
        );
      })}
      {ring(R, '#1e0300', 9.6)}
      {ring(R, `url(#${u}b)`, 7)}
      {ring(R, '#ffd27a', 7, { pathLength: 64, strokeDasharray: '0.6 3.4', opacity: 0.55 })}
      {ring(47.2, '#ffe9a0', 0.8, { opacity: 0.9 })}
      {range(24).map((i) => {
        const a = i * 15 + 7.5;
        const p = pt(53.6, a);
        return (
          <g key={`f${i}`} transform={`translate(${p.x} ${p.y}) rotate(${a})`}>
            <path className="fx-flame" style={delay(-((i * 0.29) % 0.9), 0.6 + (i % 3) * 0.12)} d={front} fill={`url(#${u}y)`} />
          </g>
        );
      })}
      <g className="fx-spin" style={{ animationDuration: '5s' }}>
        {[
          [60, 15, 1.4],
          [62.5, 75, 1],
          [59.5, 140, 1.2],
          [62, 205, 0.9],
          [60.5, 262, 1.3],
          [63, 320, 1],
        ].map(([r, a, sz], i) => {
          const p = pt(r, a);
          return <circle key={i} className="fx-twinkle" style={delay(i * 0.31, 1.3)} cx={p.x} cy={p.y} r={sz * 1.6} fill={`url(#${u}e)`} />;
        })}
      </g>
    </>
  );
};

const crescent = 'M0 -2.9A2.9 2.9 0 1 0 0 2.9A2.2 2.2 0 1 1 0 -2.9Z';

const celestial: Art = (u) => {
  const rnd = seeded(41);
  return (
    <>
      <defs>
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset=".25" stopColor="#f6d27a" />
          <stop offset=".5" stopColor="#b9821f" />
          <stop offset=".72" stopColor="#ffe9a8" />
          <stop offset="1" stopColor="#a8741c" />
        </linearGradient>
        <linearGradient id={`${u}n`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a3d8f" />
          <stop offset=".5" stopColor="#0d1440" />
          <stop offset="1" stopColor="#24307a" />
        </linearGradient>
        <radialGradient id={`${u}s`}>
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset=".35" stopColor="#ffd860" />
          <stop offset=".7" stopColor="#ff9d1c" stopOpacity=".55" />
          <stop offset="1" stopColor="#ff8c00" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}m`} cx=".35" cy=".35">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#e6edff" />
          <stop offset="1" stopColor="#9fb2e6" />
        </radialGradient>
        <radialGradient id={`${u}h`} r=".5">
          <stop offset=".8" stopColor="#fff2c4" stopOpacity="0" />
          <stop offset=".88" stopColor="#fff2c4" stopOpacity=".45" />
          <stop offset="1" stopColor="#ffd56a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="62" fill={`url(#${u}h)`} className="fx-glint" style={{ animationDuration: '3s' }} />
      <g className="fx-spin" style={{ animationDuration: '60s' }}>
        {range(36).map((i) => {
          const long = i % 3 === 0;
          const p = pt(55.4, i * 10);
          const q = pt(long ? 61.5 : 58.4, i * 10);
          return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#ffe7a3" strokeWidth={long ? 0.9 : 0.55} strokeLinecap="round" opacity={long ? 0.95 : 0.6} />;
        })}
      </g>
      {ring(R, '#1a1204', 10.4)}
      {ring(R, `url(#${u}n)`, 7)}
      {range(22).map((i) => {
        const a = rnd() * 360;
        const p = pt(R + (rnd() - 0.5) * 4.6, a);
        return i < 6 ? (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            <path className="fx-twinkle" style={delay(rnd() * 3, 2 + rnd() * 1.5)} d={sparkle(1.3)} fill="#fff" />
          </g>
        ) : (
          <circle key={i} cx={p.x} cy={p.y} r={0.22 + rnd() * 0.3} fill="#fff" opacity={0.5 + rnd() * 0.5} />
        );
      })}
      {ring(54.6, `url(#${u}g)`, 1.9)}
      {ring(46.4, `url(#${u}g)`, 1.9)}
      {ring(54.6, '#fff', 0.3, { opacity: 0.8 })}
      <g className="fx-spin" style={{ animationDuration: '14s' }}>
        {(() => {
          const s = pt(R, 30);
          const m = pt(R, 210);
          return (
            <>
              <circle cx={s.x} cy={s.y} r={6.2} fill={`url(#${u}s)`} />
              <circle cx={s.x} cy={s.y} r={2.5} fill="#fffbe8" />
              <path d={crescent} fill={`url(#${u}m)`} transform={`translate(${m.x} ${m.y}) rotate(-30) scale(1.15)`} />
            </>
          );
        })()}
      </g>
      {[0, 90, 180, 270].map((a) => {
        const p = pt(R, a);
        return <path key={a} d={sparkle(4)} fill="#fff8de" stroke="#b9821f" strokeWidth={0.35} transform={`translate(${p.x} ${p.y})`} />;
      })}
    </>
  );
};

const FRAME_ART: Record<string, Art> = {
  'frame-steel': gunmetal,
  'frame-chip': houseChip,
  'frame-gold': royalGold,
  'frame-neon': vegasNeon,
  'frame-ruby': rubyFacets,
  'frame-storm': storm,
  'frame-diamond': diamond,
  'frame-prism': holoPrism,
  'frame-mythic': inferno,
  'frame-celestial': celestial,
  ...HIGH_FRAME_ART,
};

export function FrameArt({ id }: { id: string }) {
  const u = `f${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const art = FRAME_ART[id];
  if (!art) return null;
  return (
    <svg className="cosmetic-svg" viewBox="-60 -60 120 120" aria-hidden focusable="false">
      {art(u)}
    </svg>
  );
}

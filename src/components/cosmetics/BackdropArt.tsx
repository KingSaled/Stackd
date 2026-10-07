/**
 * Vector art for Cosmetic Shop backgrounds, drawn in a 100×100 box that the
 * avatar circle crops. The portrait covers the lower middle, so the eye-catching
 * parts (skies, light, motion) live in the top half and around the edges.
 * Animations live in cosmetics.css and switch off for reduced motion.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { pt, range, seeded, sparkle } from './geometry';

type Art = (u: string) => ReactNode;

const delay = (s: number, dur?: number): CSSProperties => ({ animationDelay: `${s}s`, ...(dur ? { animationDuration: `${dur}s` } : {}) });

const SUITS = ['♠', '♥', '♦', '♣'];

function stars(seed: number, n: number, yMax = 60, twinkle = 0) {
  const rnd = seeded(seed);
  return range(n).map((i) => {
    const x = +(rnd() * 100).toFixed(2);
    const y = +(rnd() * yMax).toFixed(2);
    const r = +(0.25 + rnd() * 0.55).toFixed(2);
    const o = +(0.45 + rnd() * 0.55).toFixed(2);
    return i < twinkle ? (
      <g key={i} transform={`translate(${x} ${y})`}>
        <path className="fx-twinkle" style={delay(rnd() * 3, 2 + rnd() * 2)} d={sparkle(r * 2.6)} fill="#fff" />
      </g>
    ) : (
      <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={o} />
    );
  });
}

/* ------------------------------------------------------------------ Common */

const feltPattern = (u: string, ink: string) => (
  <pattern id={`${u}p`} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
    {SUITS.map((s, i) => (
      <text key={s} x={(i % 2) * 9 + 2} y={Math.floor(i / 2) * 9 + 7} fontSize="6" fill={ink} fontFamily="Arial, sans-serif">
        {s}
      </text>
    ))}
  </pattern>
);

const grain = (u: string, alpha = 0.14) => (
  <filter id={`${u}n`} x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch" />
    <feColorMatrix type="saturate" values="0" />
    <feComponentTransfer>
      <feFuncA type="linear" slope={alpha} />
    </feComponentTransfer>
  </filter>
);

const cardRoom: Art = (u) => (
  <>
    <defs>
      <radialGradient id={`${u}f`} cx=".5" cy=".3" r=".8">
        <stop offset="0" stopColor="#3fcb88" />
        <stop offset=".45" stopColor="#1f8a55" />
        <stop offset=".8" stopColor="#0f5534" />
        <stop offset="1" stopColor="#083621" />
      </radialGradient>
      <radialGradient id={`${u}l`} cx=".5" cy="0" r=".7">
        <stop offset="0" stopColor="#fff2c2" stopOpacity=".6" />
        <stop offset="1" stopColor="#fff2c2" stopOpacity="0" />
      </radialGradient>
      {feltPattern(u, 'rgba(0,0,0,.16)')}
      {grain(u)}
    </defs>
    <rect width="100" height="100" fill={`url(#${u}f)`} />
    <rect width="100" height="100" fill={`url(#${u}p)`} />
    <rect width="100" height="100" filter={`url(#${u}n)`} />
    <circle cx="50" cy="132" r="64" fill="none" stroke="#e9c46a" strokeOpacity=".6" strokeWidth="1.3" />
    <circle cx="50" cy="132" r="67" fill="none" stroke="#e9c46a" strokeOpacity=".25" strokeWidth=".5" />
    <rect width="100" height="100" fill={`url(#${u}l)`} />
  </>
);

const twentyOne: Art = (u) => (
  <>
    <defs>
      <radialGradient id={`${u}f`} cx=".5" cy=".3" r=".8">
        <stop offset="0" stopColor="#4a8cf0" />
        <stop offset=".45" stopColor="#1f57b8" />
        <stop offset=".8" stopColor="#0f2f6e" />
        <stop offset="1" stopColor="#081a40" />
      </radialGradient>
      <radialGradient id={`${u}l`} cx=".5" cy="0" r=".7">
        <stop offset="0" stopColor="#e6f0ff" stopOpacity=".5" />
        <stop offset="1" stopColor="#e6f0ff" stopOpacity="0" />
      </radialGradient>
      {feltPattern(u, 'rgba(255,255,255,.07)')}
      {grain(u, 0.12)}
    </defs>
    <rect width="100" height="100" fill={`url(#${u}f)`} />
    <rect width="100" height="100" fill={`url(#${u}p)`} />
    <rect width="100" height="100" filter={`url(#${u}n)`} />
    <path d="M-5 30Q50 62 105 30" fill="none" stroke="#f1d58a" strokeOpacity=".75" strokeWidth="1.1" />
    <path d="M-5 36Q50 68 105 36" fill="none" stroke="#f1d58a" strokeOpacity=".35" strokeWidth=".5" />
    {[
      [16, 18, -16],
      [84, 18, 16],
    ].map(([x, y, r], i) => (
      <g key={i} transform={`translate(${x} ${y}) rotate(${r})`} opacity=".9">
        <rect x="-4.5" y="-6.3" width="9" height="12.6" rx="1.2" fill="#fbf8f1" stroke="#c9bfa8" strokeWidth=".3" />
        <text x="-2.8" y="-1.6" fontSize="4.2" fontWeight="800" fill={i ? '#d3263f' : '#1b1e28'} fontFamily="Arial, sans-serif">
          {i ? 'K' : 'A'}
        </text>
        <text x="0.2" y="4.6" fontSize="5" fill={i ? '#d3263f' : '#1b1e28'} fontFamily="Arial, sans-serif">
          {i ? '♥' : '♠'}
        </text>
      </g>
    ))}
    <rect width="100" height="100" fill={`url(#${u}l)`} />
  </>
);

/* ------------------------------------------------------------------ Rare */

const stripSunset: Art = (u) => (
  <>
    <defs>
      <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#12062e" />
        <stop offset=".28" stopColor="#3b0f63" />
        <stop offset=".52" stopColor="#a1207c" />
        <stop offset=".66" stopColor="#ff4f7b" />
        <stop offset=".74" stopColor="#ff9a3c" />
      </linearGradient>
      <linearGradient id={`${u}u`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff27a" />
        <stop offset=".45" stopColor="#ffb347" />
        <stop offset="1" stopColor="#ff3f7f" />
      </linearGradient>
      <linearGradient id={`${u}g`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a0a48" />
        <stop offset="1" stopColor="#05010d" />
      </linearGradient>
      <mask id={`${u}m`}>
        <rect width="100" height="100" fill="#fff" />
        {[
          [52, 0.8],
          [57, 1.3],
          [62, 1.9],
          [67, 2.5],
          [72, 3.2],
        ].map(([y, h]) => (
          <rect key={y} x="0" y={y} width="100" height={h} fill="#000" />
        ))}
      </mask>
      <filter id={`${u}b`} x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur stdDeviation="1.4" />
      </filter>
      <clipPath id={`${u}c`}>
        <rect x="0" y="76" width="100" height="24" />
      </clipPath>
    </defs>
    <rect width="100" height="100" fill={`url(#${u}s)`} />
    {stars(4, 14, 34)}
    <circle cx="50" cy="52" r="30" fill="#ff7a59" opacity=".35" filter={`url(#${u}b)`} />
    <circle cx="50" cy="52" r="26" fill={`url(#${u}u)`} mask={`url(#${u}m)`} />
    <rect x="0" y="76" width="100" height="24" fill={`url(#${u}g)`} />
    <g clipPath={`url(#${u}c)`} stroke="#ff4fd8" strokeWidth=".45" opacity=".9">
      {[78.5, 81, 84.5, 89.5, 96].map((y) => (
        <line key={y} x1="0" y1={y} x2="100" y2={y} />
      ))}
      {range(13).map((i) => (
        <line key={i} x1="50" y1="76" x2={50 + (i - 6) * 26} y2="100" />
      ))}
    </g>
    <rect x="0" y="75.4" width="100" height="1.2" fill="#ff8ae6" />
    <rect x="0" y="74.6" width="100" height="2.8" fill="#ff4fd8" opacity=".6" filter={`url(#${u}b)`} />
  </>
);

const neonSkyline: Art = (u) => {
  const rnd = seeded(21);
  const back = range(12).map((i) => {
    const w = 7 + rnd() * 6;
    const h = 22 + rnd() * 30 + (Math.abs(i - 5.5) > 3.5 ? 16 : 0);
    return { x: i * 8.6 - 3, w, h };
  });
  const front = range(9).map((i) => {
    const w = 9 + rnd() * 6;
    const edge = Math.abs(i - 4) >= 3;
    const h = (edge ? 46 : 22) + rnd() * 16;
    return { x: i * 11.5 - 4, w, h };
  });
  return (
    <>
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070418" />
          <stop offset=".5" stopColor="#1d0b3e" />
          <stop offset=".82" stopColor="#5a1466" />
          <stop offset="1" stopColor="#ff3fa4" />
        </linearGradient>
        <radialGradient id={`${u}h`}>
          <stop offset="0" stopColor="#ffe3c4" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffe3c4" stopOpacity="0" />
        </radialGradient>
        <pattern id={`${u}w`} width="3" height="4" patternUnits="userSpaceOnUse">
          <rect x=".6" y=".8" width="1.2" height="1.6" fill="#ffd36e" opacity=".85" />
        </pattern>
        <pattern id={`${u}v`} width="3.4" height="4.4" patternUnits="userSpaceOnUse">
          <rect x=".7" y=".9" width="1.3" height="1.7" fill="#7ff3ff" opacity=".55" />
        </pattern>
        <filter id={`${u}b`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1" />
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}s)`} />
      {stars(9, 18, 40, 3)}
      <circle cx="76" cy="20" r="15" fill={`url(#${u}h)`} />
      <circle cx="76" cy="20" r="6.5" fill="#ffecd2" />
      <circle cx="78.5" cy="18.5" r="5.6" fill="#1a0a38" opacity=".35" />
      {back.map((b, i) => (
        <g key={`b${i}`}>
          <rect x={b.x} y={100 - b.h} width={b.w} height={b.h} fill="#2a1250" />
          <rect x={b.x} y={100 - b.h + 2} width={b.w} height={b.h} fill={`url(#${u}v)`} opacity=".5" />
        </g>
      ))}
      {front.map((b, i) => (
        <g key={`f${i}`}>
          <rect x={b.x} y={100 - b.h} width={b.w} height={b.h} fill="#0b0519" />
          <rect x={b.x + 1} y={100 - b.h + 2} width={b.w - 2} height={b.h} fill={`url(#${u}w)`} opacity=".75" />
          {i % 3 === 0 && <rect x={b.x} y={100 - b.h - 0.6} width={b.w} height=".8" fill={i % 2 ? '#3ff0ff' : '#ff3fd1'} />}
        </g>
      ))}
      <rect x="9" y="47" width="10" height="4" rx="1" fill="none" stroke="#ff3fd1" strokeWidth="1.8" opacity=".6" filter={`url(#${u}b)`} />
      <rect x="9" y="47" width="10" height="4" rx="1" fill="none" stroke="#ffd2f4" strokeWidth=".5" />
      <rect x="81" y="44" width="10" height="4" rx="1" fill="none" stroke="#3ff0ff" strokeWidth="1.8" opacity=".6" filter={`url(#${u}b)`} />
      <rect x="81" y="44" width="10" height="4" rx="1" fill="none" stroke="#d4fdff" strokeWidth=".5" />
    </>
  );
};

/* ------------------------------------------------------------------ Epic */

const deepSea: Art = (u) => {
  const rnd = seeded(5);
  return (
    <>
      <defs>
        <linearGradient id={`${u}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fd5ff" />
          <stop offset=".18" stopColor="#0e86c9" />
          <stop offset=".5" stopColor="#05427d" />
          <stop offset=".82" stopColor="#021a3a" />
          <stop offset="1" stopColor="#010a1a" />
        </linearGradient>
        <linearGradient id={`${u}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6fbff" stopOpacity=".55" />
          <stop offset="1" stopColor="#e6fbff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}j`} cx=".5" cy=".35">
          <stop offset="0" stopColor="#ffe1ff" />
          <stop offset=".5" stopColor="#ff7ae6" stopOpacity=".8" />
          <stop offset="1" stopColor="#9b4dff" stopOpacity=".1" />
        </radialGradient>
        <radialGradient id={`${u}g`}>
          <stop offset="0" stopColor="#ff9cf0" stopOpacity=".55" />
          <stop offset="1" stopColor="#ff9cf0" stopOpacity="0" />
        </radialGradient>
        <filter id={`${u}b`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation=".9" />
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}w)`} />
      <g className="fx-sway" style={{ transformOrigin: '50px -20px' }}>
        {[
          [18, 7, 0],
          [36, 9, 0.6],
          [55, 6, 1.2],
          [70, 10, 0.3],
          [88, 7, 0.9],
        ].map(([x, w, d], i) => (
          <polygon key={i} className="fx-ray" style={delay(d, 3.5 + i * 0.4)} points={`${x - w / 2},-5 ${x + w / 2},-5 ${x + w * 1.6 + (x - 50) * 0.5},105 ${x - w * 1.6 + (x - 50) * 0.5},105`} fill={`url(#${u}r)`} />
        ))}
      </g>
      <g className="fx-drift-x" stroke="#c9f6ff" strokeWidth=".6" fill="none" opacity=".65">
        {[3, 7, 11].map((y, i) => (
          <path key={y} d={`M-50 ${y}Q-37.5 ${y - 2.2} -25 ${y}T0 ${y}T25 ${y}T50 ${y}T75 ${y}T100 ${y}T125 ${y}T150 ${y}`} opacity={1 - i * 0.25} />
        ))}
      </g>
      <g className="fx-bob" style={{ transformOrigin: '20px 30px' }}>
        <circle cx="20" cy="28" r="9" fill={`url(#${u}g)`} />
        <path d="M13.5 29C13.5 21 26.5 21 26.5 29Q23.25 27.5 20 29Q16.75 27.5 13.5 29Z" fill={`url(#${u}j)`} />
        {[15.5, 18.2, 20.9, 23.6].map((x, i) => (
          <path key={x} className="fx-wave" style={delay(i * 0.2)} d={`M${x} 29.5q-1.2 4 0 8q1.2 4 0 8`} fill="none" stroke="#ffc8f5" strokeWidth=".45" opacity=".75" />
        ))}
      </g>
      {range(9).map((i) => {
        const x = 6 + rnd() * 88;
        const r = 0.7 + rnd() * 1.5;
        return (
          <g key={i} className="fx-bubble" style={delay(-rnd() * 6, 4 + rnd() * 3)}>
            <circle cx={x} cy="108" r={r} fill="#fff" fillOpacity=".12" stroke="#e6fbff" strokeWidth=".35" />
            <circle cx={x - r * 0.35} cy={108 - r * 0.35} r={r * 0.28} fill="#fff" opacity=".8" />
          </g>
        );
      })}
      {range(14).map((i) => (
        <circle key={`p${i}`} cx={+(rnd() * 100).toFixed(1)} cy={+(30 + rnd() * 70).toFixed(1)} r=".35" fill="#bff3ff" opacity={0.3 + rnd() * 0.4} filter={i % 4 ? undefined : `url(#${u}b)`} />
      ))}
    </>
  );
};

function boltPath(seed: number, x0: number, y0: number, len: number) {
  const rnd = seeded(seed);
  let x = x0;
  let y = y0;
  let d = `M${x} ${y}`;
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    x += (rnd() - 0.5) * 9;
    y += len / steps;
    d += `L${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

const stormFront: Art = (u) => {
  const main = boltPath(3, 30, 18, 60);
  const branch = boltPath(8, 31, 34, 22);
  return (
    <>
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b111f" />
          <stop offset=".5" stopColor="#1c2840" />
          <stop offset="1" stopColor="#2c3a55" />
        </linearGradient>
        <radialGradient id={`${u}c`} cx=".5" cy=".6">
          <stop offset="0" stopColor="#56657f" />
          <stop offset=".7" stopColor="#2a3449" />
          <stop offset="1" stopColor="#1a2234" stopOpacity="0" />
        </radialGradient>
        <pattern id={`${u}r`} width="8" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
          <line x1="2" y1="0" x2="2" y2="4.5" stroke="#b9d3f5" strokeOpacity=".45" strokeWidth=".35" />
          <line x1="6" y1="6" x2="6" y2="9.5" stroke="#b9d3f5" strokeOpacity=".3" strokeWidth=".3" />
        </pattern>
        <filter id={`${u}b`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}s)`} />
      <rect className="fx-flash" width="100" height="100" fill="#d6ebff" />
      <g className="fx-bolt">
        <path d={main} fill="none" stroke="#8fd0ff" strokeWidth="3" filter={`url(#${u}b)`} />
        <path d={main} fill="none" stroke="#f2fbff" strokeWidth="1" strokeLinejoin="round" />
        <path d={branch} fill="none" stroke="#f2fbff" strokeWidth=".55" strokeLinejoin="round" />
      </g>
      <g className="fx-drift-slow">
        {[
          [10, 10, 26, 13],
          [44, 4, 30, 14],
          [80, 12, 28, 13],
          [26, 22, 24, 10],
          [66, 24, 26, 11],
          [100, 28, 22, 10],
          [-4, 30, 20, 9],
        ].map(([cx, cy, rx, ry], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${u}c)`} />
        ))}
      </g>
      <g className="fx-rain">
        <rect x="-20" y="-24" width="140" height="148" fill={`url(#${u}r)`} />
      </g>
    </>
  );
};

/* ------------------------------------------------------------------ Legendary */

const damask = (
  <g fill="#f5c451">
    <path d="M10 2.5C12.3 6.5 14 9 10 15C6 9 7.7 6.5 10 2.5Z" />
    <path d="M10 12.5C13.5 9.5 17.5 10.5 16.2 13.8C15.3 16 12.3 15.2 10 12.5Z" />
    <path d="M10 12.5C6.5 9.5 2.5 10.5 3.8 13.8C4.7 16 7.7 15.2 10 12.5Z" />
    <path d="M10 15.5L11.4 18L10 20.5L8.6 18Z" />
    <circle cx="0" cy="0" r="1.2" />
    <circle cx="20" cy="0" r="1.2" />
    <circle cx="0" cy="24" r="1.2" />
    <circle cx="20" cy="24" r="1.2" />
    <path d="M0 10.5L1.3 12L0 13.5L-1.3 12ZM20 10.5L21.3 12L20 13.5L18.7 12Z" />
  </g>
);

const velvet: Art = (u) => {
  const rnd = seeded(13);
  return (
    <>
      <defs>
        <radialGradient id={`${u}v`} cx=".5" cy=".35" r=".8">
          <stop offset="0" stopColor="#b862f2" />
          <stop offset=".35" stopColor="#7a24b8" />
          <stop offset=".7" stopColor="#4a1278" />
          <stop offset="1" stopColor="#22063d" />
        </radialGradient>
        <pattern id={`${u}d`} width="20" height="24" patternUnits="userSpaceOnUse">
          {damask}
        </pattern>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}e`} cx=".5" cy=".5" r=".5">
          <stop offset=".72" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".45" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}v)`} />
      <rect width="100" height="100" fill={`url(#${u}d)`} opacity=".3" />
      <rect width="100" height="100" fill={`url(#${u}e)`} />
      <g className="fx-sheen">
        <rect x="-40" y="-20" width="30" height="140" fill={`url(#${u}s)`} transform="rotate(20 50 50)" />
      </g>
      <circle cx="50" cy="50" r="46.5" fill="none" stroke="#f5c451" strokeOpacity=".75" strokeWidth=".9" />
      <circle cx="50" cy="50" r="44.2" fill="none" stroke="#f5c451" strokeOpacity=".4" strokeWidth=".35" strokeDasharray="1 1.2" />
      {range(8).map((i) => {
        const p = pt(46.5, i * 45, 50, 50);
        return <path key={i} d="M0 -1.6L1 0L0 1.6L-1 0Z" fill="#ffe08f" transform={`translate(${p.x} ${p.y}) rotate(${i * 45})`} />;
      })}
      {range(6).map((i) => (
        <g key={`s${i}`} transform={`translate(${(12 + rnd() * 76).toFixed(1)} ${(8 + rnd() * 34).toFixed(1)})`}>
          <path className="fx-twinkle" style={delay(rnd() * 3, 2.4 + rnd())} d={sparkle(1.6)} fill="#ffe9a8" />
        </g>
      ))}
    </>
  );
};

const jackpot: Art = (u) => {
  const rnd = seeded(31);
  return (
    <>
      <defs>
        <radialGradient id={`${u}b`} cx=".5" cy=".3" r=".85">
          <stop offset="0" stopColor="#fff3b8" />
          <stop offset=".22" stopColor="#ffc53d" />
          <stop offset=".55" stopColor="#d98a0b" />
          <stop offset=".85" stopColor="#7a3d00" />
          <stop offset="1" stopColor="#3a1a00" />
        </radialGradient>
        <radialGradient id={`${u}c`} cx=".35" cy=".3">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset=".45" stopColor="#ffd34a" />
          <stop offset="1" stopColor="#a86c00" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}b)`} />
      <g className="fx-spin" style={{ transformOrigin: '50px 30px', animationDuration: '40s' }}>
        {range(16).map((i) => {
          const a = pt(95, i * 22.5 - 4.5, 50, 30);
          const b = pt(95, i * 22.5 + 4.5, 50, 30);
          return <polygon key={i} points={`50,30 ${a.x},${a.y} ${b.x},${b.y}`} fill="#fff" opacity=".13" />;
        })}
      </g>
      {range(8).map((i) => {
        const x = 6 + ((i * 12.3 + rnd() * 6) % 88);
        const s = 2.2 + rnd() * 1.4;
        return (
          <g key={i} className="fx-fall" style={delay(-rnd() * 5, 3.6 + rnd() * 2.4)}>
            <g transform={`translate(${x.toFixed(1)} -8)`}>
              <g className="fx-flip" style={delay(-rnd() * 1.5, 1 + rnd() * 0.8)}>
                <circle r={s} fill={`url(#${u}c)`} stroke="#8a5a00" strokeWidth=".35" />
                <circle r={s * 0.68} fill="none" stroke="#fff6cc" strokeOpacity=".75" strokeWidth=".3" />
                <text y={s * 0.42} fontSize={s * 1.15} textAnchor="middle" fill="#8a5a00" fontWeight="800" fontFamily="Arial, sans-serif">
                  $
                </text>
              </g>
            </g>
          </g>
        );
      })}
      {range(6).map((i) => (
        <g key={`s${i}`} transform={`translate(${(8 + rnd() * 84).toFixed(1)} ${(6 + rnd() * 40).toFixed(1)})`}>
          <path className="fx-twinkle" style={delay(rnd() * 2.5, 1.8 + rnd())} d={sparkle(1.8)} fill="#fff" />
        </g>
      ))}
    </>
  );
};

/* ------------------------------------------------------------------ Mythic */

const galaxy: Art = (u) => {
  const arm = (rot: number) =>
    range(26).map((i) => {
      const t = i / 25;
      const a = rot + t * 300;
      const r = 1.6 + t * 19;
      const p = pt(r, a, 72, 20);
      return <circle key={`${rot}-${i}`} cx={p.x} cy={p.y} r={(1.9 - t * 1.2).toFixed(2)} fill={t < 0.4 ? '#fff1ff' : t < 0.7 ? '#d9a8ff' : '#7fb6ff'} opacity={(0.9 - t * 0.55).toFixed(2)} />;
    });
  return (
    <>
      <defs>
        <radialGradient id={`${u}s`} cx=".5" cy=".38" r=".8">
          <stop offset="0" stopColor="#2a1060" />
          <stop offset=".5" stopColor="#0f0630" />
          <stop offset="1" stopColor="#020108" />
        </radialGradient>
        <radialGradient id={`${u}m`}>
          <stop offset="0" stopColor="#ff4fd8" stopOpacity=".55" />
          <stop offset="1" stopColor="#ff4fd8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}n`}>
          <stop offset="0" stopColor="#3aa0ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#3aa0ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}c`}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".3" stopColor="#ffe6ff" stopOpacity=".9" />
          <stop offset="1" stopColor="#b77bff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${u}t`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <filter id={`${u}b`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation=".7" />
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}s)`} />
      <g className="fx-nebula">
        <ellipse cx="22" cy="30" rx="34" ry="22" fill={`url(#${u}m)`} />
        <ellipse cx="80" cy="56" rx="34" ry="26" fill={`url(#${u}n)`} />
      </g>
      {stars(3, 34, 100, 7)}
      <g className="fx-spin" style={{ transformOrigin: '72px 20px', animationDuration: '50s' }} filter={`url(#${u}b)`}>
        {arm(0)}
        {arm(180)}
      </g>
      <circle cx="72" cy="20" r="8" fill={`url(#${u}c)`} />
      <g className="fx-shoot">
        <line x1="0" y1="0" x2="16" y2="0" stroke={`url(#${u}t)`} strokeWidth=".7" strokeLinecap="round" transform="translate(6 10) rotate(22)" />
      </g>
    </>
  );
};

const auroraPeaks: Art = (u) => (
  <>
    <defs>
      <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#01040f" />
        <stop offset=".55" stopColor="#061833" />
        <stop offset="1" stopColor="#0c2d45" />
      </linearGradient>
      <linearGradient id={`${u}a`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7cffc4" stopOpacity="0" />
        <stop offset=".45" stopColor="#5dffb0" stopOpacity=".85" />
        <stop offset=".75" stopColor="#3fd7ff" stopOpacity=".5" />
        <stop offset="1" stopColor="#7a5cff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${u}v`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff6ad5" stopOpacity="0" />
        <stop offset=".5" stopColor="#c46bff" stopOpacity=".7" />
        <stop offset="1" stopColor="#4fa8ff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${u}m`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1a3550" />
        <stop offset="1" stopColor="#040b16" />
      </linearGradient>
      <linearGradient id={`${u}t`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#fff" />
      </linearGradient>
      <filter id={`${u}b`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.1" />
      </filter>
    </defs>
    <rect width="100" height="100" fill={`url(#${u}s)`} />
    {stars(17, 30, 70, 6)}
    <g filter={`url(#${u}b)`}>
      <path className="fx-aurora" d="M-10 30C10 18 25 40 45 26S80 14 110 28L110 54C80 40 62 58 45 48S10 44 -10 56Z" fill={`url(#${u}a)`} />
      <path className="fx-aurora fx-rev" style={delay(-2.5, 9)} d="M-10 12C14 4 30 22 52 10S86 2 110 12L110 34C88 24 70 36 52 30S16 24 -10 34Z" fill={`url(#${u}v)`} opacity=".8" />
      <path className="fx-aurora" style={delay(-5, 11)} d="M-10 44C16 36 34 54 56 42S88 36 110 46L110 62C88 54 72 64 56 58S18 56 -10 64Z" fill={`url(#${u}a)`} opacity=".55" />
    </g>
    <path d="M-2 100L-2 72L12 60L20 68L30 56L42 70L50 64L60 74L70 58L80 66L90 54L102 66L102 100Z" fill={`url(#${u}m)`} />
    <path d="M12 60L16 64L13 64ZM30 56L34 61L31 60L28 59ZM70 58L74 63L71 62L68 61ZM90 54L94 59L91 58L88 57Z" fill="#e8f4ff" opacity=".85" />
    <g className="fx-shoot" style={delay(2.2, 7)}>
      <line x1="0" y1="0" x2="14" y2="0" stroke={`url(#${u}t)`} strokeWidth=".6" strokeLinecap="round" transform="translate(58 6) rotate(28)" />
    </g>
  </>
);

const BACKDROP_ART: Record<string, Art> = {
  'bg-felt': cardRoom,
  'bg-blackjack': twentyOne,
  'bg-sunset': stripSunset,
  'bg-city': neonSkyline,
  'bg-ocean': deepSea,
  'bg-storm': stormFront,
  'bg-velvet': velvet,
  'bg-jackpot': jackpot,
  'bg-galaxy': galaxy,
  'bg-aurora': auroraPeaks,
};

export function BackdropArt({ id }: { id: string }) {
  const u = `b${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const art = BACKDROP_ART[id];
  if (!art) return null;
  return (
    <svg className="cosmetic-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      {art(u)}
    </svg>
  );
}

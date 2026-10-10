/**
 * The 1M to 30M backgrounds (Exotic, Ascendant and Sovereign). Same canvas as
 * BackdropArt.tsx: a 100×100 box cropped to a circle, with the portrait covering
 * the lower middle, so the show happens across the top and around the edges.
 */
import type { CSSProperties, ReactNode } from 'react';
import { pt, range, seeded, sparkle } from './geometry';

type Art = (u: string) => ReactNode;

const delay = (s: number, dur?: number): CSSProperties => ({ animationDelay: `${s}s`, ...(dur ? { animationDuration: `${dur}s` } : {}) });
const f = (n: number) => +n.toFixed(2);

function stars(seed: number, n: number, yMax = 60, twinkle = 0, color = '#fff') {
  const rnd = seeded(seed);
  return range(n).map((i) => {
    const x = f(rnd() * 100);
    const y = f(rnd() * yMax);
    const r = f(0.2 + rnd() * 0.5);
    return i < twinkle ? (
      <g key={i} transform={`translate(${x} ${y})`}>
        <path className="fx-twinkle" style={delay(rnd() * 3, 2 + rnd() * 2)} d={sparkle(r * 2.6)} fill={color} />
      </g>
    ) : (
      <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={f(0.4 + rnd() * 0.6)} />
    );
  });
}

/* ================================================================== Exotic */

const sakura: Art = (u) => {
  const rnd = seeded(8);
  const blossom = (x: number, y: number, s: number, k: number) => (
    <g key={k} transform={`translate(${f(x)} ${f(y)}) scale(${f(s)}) rotate(${(k * 37) % 72})`}>
      {range(5).map((i) => (
        <ellipse key={i} cx="0" cy="-1.5" rx="1.05" ry="1.6" fill={i % 2 ? '#ffc4dd' : '#ffd8e8'} transform={`rotate(${i * 72})`} />
      ))}
      <circle r=".6" fill="#ff6fa8" />
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120a2e" />
          <stop offset=".55" stopColor="#3a1a4f" />
          <stop offset="1" stopColor="#7a2c5a" />
        </linearGradient>
        <radialGradient id={`${u}m`}>
          <stop offset="0" stopColor="#fff8f0" />
          <stop offset=".55" stopColor="#ffe7f0" />
          <stop offset=".7" stopColor="#ffb8d6" stopOpacity=".35" />
          <stop offset="1" stopColor="#ffb8d6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}l`}>
          <stop offset="0" stopColor="#ffe28a" />
          <stop offset=".5" stopColor="#ff4a3d" stopOpacity=".7" />
          <stop offset="1" stopColor="#ff4a3d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}s)`} />
      {stars(12, 22, 50, 4)}
      <circle cx="74" cy="22" r="20" fill={`url(#${u}m)`} className="fx-glint" style={{ animationDuration: '5s' }} />
      <circle cx="74" cy="22" r="10.5" fill="#fff6f0" />
      <circle cx="70" cy="19" r="2.2" fill="#f4dfe6" opacity=".7" />
      <circle cx="77.5" cy="25" r="1.4" fill="#f4dfe6" opacity=".6" />
      {/* Pagoda silhouette */}
      <g fill="#1a0b26">
        <path d="M2 100 L2 70 L16 70 L16 100Z" />
        <path d="M-4 72 Q9 64 22 72 L19 73.5 Q9 68 -1 73.5Z" />
        <path d="M0 64 L18 64 L18 70 L0 70Z" />
        <path d="M-2 65.5 Q9 57 20 65.5 L17 67 Q9 61.5 1 67Z" />
        <path d="M3 57 L15 57 L15 63 L3 63Z" />
        <path d="M1 58.5 Q9 50 17 58.5 L14 60 Q9 55 4 60Z" />
        <path d="M8.6 50 L9.4 50 L9.4 44 L8.6 44Z" />
      </g>
      {/* Branch from the top left, heavy with blossom */}
      <path d="M-4 8 C10 12 18 10 28 16 C34 20 40 18 46 22 M18 12 C20 4 24 2 30 -2 M30 17 C32 24 30 30 34 34" fill="none" stroke="#2a1420" strokeWidth="2" strokeLinecap="round" />
      {range(26).map((i) => {
        const t = rnd();
        const x = -2 + t * 46 + (rnd() - 0.5) * 6;
        const y = 8 + t * 14 + (rnd() - 0.5) * 9;
        return blossom(x, y, 0.75 + rnd() * 0.5, i);
      })}
      {/* Lanterns */}
      {[
        [56, 4, 0],
        [90, 10, 1.2],
      ].map(([x, len, d]) => (
        <g key={x} className="fx-sway" style={{ transformOrigin: `${x}px 0px`, ...delay(-d, 4) }}>
          <line x1={x} y1="0" x2={x} y2={len} stroke="#1a0b26" strokeWidth=".5" />
          <circle cx={x} cy={len + 4} r="7" fill={`url(#${u}l)`} className="fx-glint" style={delay(d, 2)} />
          <rect x={x - 2.6} y={len} width="5.2" height="7.4" rx="2.4" fill="#e3242b" />
          <rect x={x - 1.6} y={len - 0.4} width="3.2" height="1" fill="#2a1420" />
          <rect x={x - 1.6} y={len + 7} width="3.2" height="1" fill="#2a1420" />
          <path d={`M${x - 2.4} ${len + 3.7}H${x + 2.4}`} stroke="#ffd36b" strokeWidth=".35" opacity=".7" />
        </g>
      ))}
      {/* Falling petals */}
      {range(14).map((i) => (
        <g key={i} className="fx-petal" style={delay(-rnd() * 7, 5 + rnd() * 3)}>
          <ellipse cx={f(10 + rnd() * 90)} cy={f(-6 - rnd() * 10)} rx=".9" ry=".55" fill="#ffc4dd" opacity=".95" />
        </g>
      ))}
    </>
  );
};

const mainframe: Art = (u) => {
  const rnd = seeded(31);
  const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789$STACKD';
  return (
    <>
      <defs>
        <radialGradient id={`${u}g`} cx=".5" cy=".3" r=".8">
          <stop offset="0" stopColor="#063d1f" />
          <stop offset=".6" stopColor="#021a0c" />
          <stop offset="1" stopColor="#000802" />
        </radialGradient>
        <linearGradient id={`${u}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#00ff7a" stopOpacity="0" />
          <stop offset=".8" stopColor="#00ff7a" stopOpacity=".9" />
          <stop offset="1" stopColor="#d9ffe9" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}g)`} />
      {range(16).map((col) => {
        const x = 2 + col * 6.3;
        const len = 8 + Math.floor(rnd() * 8);
        const size = 3.4 + rnd() * 1.6;
        const chars = range(len).map(() => glyphs[Math.floor(rnd() * glyphs.length)]);
        return (
          <g key={col} className="fx-code" style={delay(-rnd() * 4, 2.6 + rnd() * 2.4)} opacity={f(0.55 + rnd() * 0.45)}>
            {chars.map((ch, i) => (
              <text
                key={i}
                x={f(x)}
                y={f(-40 + i * size)}
                fontSize={size}
                fontFamily="ui-monospace, Menlo, Consolas, monospace"
                fontWeight="700"
                textAnchor="middle"
                fill={i === len - 1 ? '#e9fff2' : '#00ff7a'}
                opacity={f(0.2 + (i / len) * 0.8)}
              >
                {ch}
              </text>
            ))}
          </g>
        );
      })}
      <g opacity=".06">
        <rect width="100" height="100" fill="#00ff7a" className="fx-flicker" />
      </g>
    </>
  );
};

const eruption: Art = (u) => {
  const rnd = seeded(66);
  // Two volcanoes on the edges (the portrait covers the middle), both erupting.
  const volcano = (x: number, peak: number, flip: 1 | -1, k: number) => (
    <g key={k} transform={`translate(${x} 0) scale(${flip} 1)`}>
      <circle cx="0" cy={peak} r="16" fill={`url(#${u}c)`} className="fx-glint" style={delay(-k * 0.6, 1.4)} />
      <path d={`M-30 100 L-30 ${peak + 34} L-6 ${peak + 2} L6 ${peak + 2} L30 ${peak + 40} L30 100Z`} fill={`url(#${u}v)`} />
      <path d={`M-6 ${peak + 2} L6 ${peak + 2} L4 ${peak + 4.5} L-4 ${peak + 4.5}Z`} fill="#ffb21a" />
      {[`M-3 ${peak + 4} C-6 ${peak + 14} -12 ${peak + 22} -16 ${peak + 36}`, `M3 ${peak + 4} C6 ${peak + 16} 10 ${peak + 26} 16 ${peak + 42}`].map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="#ff3d00" strokeWidth="3" strokeLinecap="round" opacity=".55" filter={`url(#${u}b)`} />
          <path className="fx-lava" style={delay(-i * 0.7 - k, 2.2)} d={d} fill="none" stroke="#ffd04d" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="3 4" />
        </g>
      ))}
      {range(10).map((i) => (
        <circle
          key={i}
          className={i % 2 ? 'fx-spurt' : 'fx-spurt fx-spurt--l'}
          style={delay(-rnd() * 1.6, 1.2 + rnd() * 0.8)}
          cx={f((rnd() - 0.5) * 4)}
          cy={peak + 2}
          r={f(0.7 + rnd() * 0.9)}
          fill={i % 3 ? '#ffb21a' : '#fff2a0'}
        />
      ))}
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a0605" />
          <stop offset=".45" stopColor="#5a1208" />
          <stop offset="1" stopColor="#c23a0a" />
        </linearGradient>
        <linearGradient id={`${u}v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a160c" />
          <stop offset="1" stopColor="#0a0302" />
        </linearGradient>
        <radialGradient id={`${u}c`}>
          <stop offset="0" stopColor="#fff2a0" />
          <stop offset=".35" stopColor="#ff9a00" />
          <stop offset=".7" stopColor="#ff3d00" stopOpacity=".5" />
          <stop offset="1" stopColor="#ff3d00" stopOpacity="0" />
        </radialGradient>
        <filter id={`${u}b`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}s)`} />
      {/* Ash cloud rolling across the top, lit from below, with lightning */}
      <g className="fx-smoke" filter={`url(#${u}b)`}>
        <ellipse cx="22" cy="8" rx="30" ry="12" fill="#2a0f0a" />
        <ellipse cx="78" cy="6" rx="32" ry="12" fill="#240c08" />
        <ellipse cx="50" cy="14" rx="26" ry="8" fill="#3a140c" opacity=".9" />
      </g>
      <path className="fx-bolt" style={delay(0.6, 3.6)} d="M28 2 L24 9 L28 9 L22 18" fill="none" stroke="#ffe6c2" strokeWidth="1" strokeLinejoin="round" />
      <path className="fx-bolt" style={delay(2.4, 4.4)} d="M74 1 L78 8 L74 8 L79 16" fill="none" stroke="#ffe6c2" strokeWidth=".9" strokeLinejoin="round" />
      <rect width="100" height="100" fill="#ff8a3d" className="fx-flash" style={delay(0.6, 3.6)} />
      {volcano(10, 38, 1, 0)}
      {volcano(90, 32, -1, 1)}
      {range(16).map((i) => (
        <circle key={`e${i}`} className="fx-ember" style={delay(-rnd() * 3, 2.2 + rnd() * 2)} cx={f(rnd() * 100)} cy={f(30 + rnd() * 70)} r={f(0.3 + rnd() * 0.6)} fill={i % 2 ? '#ff9a1a' : '#ffd04d'} />
      ))}
    </>
  );
};

/* ================================================================== Ascendant */

const vault: Art = (u) => {
  const rnd = seeded(12);
  const bar = (x: number, y: number, k: number) => (
    <g key={k} transform={`translate(${f(x)} ${f(y)})`}>
      <path d="M0 4 L2 0 L12 0 L14 4Z" fill={`url(#${u}g)`} stroke="#7a4d06" strokeWidth=".3" />
      <path d="M2 0 L12 0 L13 2 L1 2Z" fill="#fff2b0" opacity=".55" />
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={`${u}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1f29" />
          <stop offset="1" stopColor="#07090d" />
        </linearGradient>
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2b0" />
          <stop offset=".4" stopColor="#f2bf3a" />
          <stop offset="1" stopColor="#9a6408" />
        </linearGradient>
        <radialGradient id={`${u}d`} cx=".4" cy=".35" r=".7">
          <stop offset="0" stopColor="#d8dde6" />
          <stop offset=".6" stopColor="#7d8796" />
          <stop offset="1" stopColor="#3a414d" />
        </radialGradient>
        <linearGradient id={`${u}l`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6d6" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff6d6" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}c`} cx=".4" cy=".35">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset=".6" stopColor="#f0b62a" />
          <stop offset="1" stopColor="#8a5806" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}w)`} />
      {/* Steel wall panels */}
      {range(6).map((i) => (
        <rect key={i} x={i * 17 - 2} y="0" width="16" height="100" fill="none" stroke="#2a313d" strokeWidth=".5" />
      ))}
      {range(8).map((i) => (
        <circle key={`r${i}`} cx={(i % 4) * 34 + 8} cy={i < 4 ? 6 : 60} r=".7" fill="#4a5361" />
      ))}
      {/* The open vault door, top right */}
      <g transform="translate(84 22)">
        <circle r="20" fill={`url(#${u}d)`} stroke="#1a1f29" strokeWidth="1.2" />
        <circle r="15" fill="none" stroke="#2a313d" strokeWidth="1" />
        <g className="fx-gear" style={{ animationDuration: '12s' }}>
          {range(6).map((i) => (
            <line key={i} x1="0" y1="0" x2={pt(11, i * 60).x} y2={pt(11, i * 60).y} stroke="#e6e9ee" strokeWidth="1.6" strokeLinecap="round" />
          ))}
          <circle r="3.4" fill="#c9ced6" stroke="#2a313d" strokeWidth=".6" />
        </g>
        {range(12).map((i) => {
          const p = pt(18, i * 30);
          return <circle key={i} cx={p.x} cy={p.y} r=".8" fill="#2a313d" />;
        })}
      </g>
      {/* Spotlight sweeping the hoard */}
      <g className="fx-sweep" style={{ transformOrigin: '30px -6px' }}>
        <path d="M27 -6 L33 -6 L52 100 L8 100Z" fill={`url(#${u}l)`} />
      </g>
      {/* Gold bar pyramids and coin piles */}
      {[
        [2, 84],
        [16, 84],
        [9, 80],
        [70, 86],
        [84, 86],
        [77, 82],
        [28, 90],
        [56, 92],
      ].map(([x, y], i) => bar(x, y, i))}
      {range(24).map((i) => {
        const x = rnd() * 100;
        const y = 70 + rnd() * 28;
        return <ellipse key={`c${i}`} cx={f(x)} cy={f(y)} rx="2.2" ry="1" fill={`url(#${u}c)`} stroke="#8a5806" strokeWidth=".2" />;
      })}
      {/* Diamonds catching the light */}
      {range(9).map((i) => {
        const x = 6 + rnd() * 88;
        const y = 30 + rnd() * 50;
        return (
          <g key={`d${i}`} transform={`translate(${f(x)} ${f(y)})`}>
            <path d="M-1.6 0 L0 -1.2 L1.6 0 L0 2Z" fill="#dff6ff" opacity=".85" />
            <path className="fx-twinkle" style={delay(rnd() * 3, 1.6 + rnd() * 1.4)} d={sparkle(2.4)} fill="#fff" />
          </g>
        );
      })}
    </>
  );
};

const hyperspace: Art = (u) => {
  const rnd = seeded(54);
  return (
    <>
      <defs>
        <radialGradient id={`${u}g`} cx=".5" cy=".18" r=".85">
          <stop offset="0" stopColor="#bfe4ff" />
          <stop offset=".12" stopColor="#3a7bff" />
          <stop offset=".45" stopColor="#0b1a5c" />
          <stop offset="1" stopColor="#01030f" />
        </radialGradient>
        <linearGradient id={`${u}t`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#e6f4ff" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}g)`} />
      {/* Tunnel rings rushing past */}
      {range(4).map((i) => (
        <circle key={`r${i}`} className="fx-ping" style={{ ...delay(-i * 0.6, 2.4), transformOrigin: '50px 18px' }} cx="50" cy="18" r="26" fill="none" stroke="#9fd0ff" strokeWidth=".9" />
      ))}
      {/* Star streaks flying outwards from the vanishing point */}
      {range(72).map((i) => {
        const a = rnd() * 360;
        const p = pt(10 + rnd() * 10, a, 50, 18);
        return (
          <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${f(a - 90)})`}>
            <line className="fx-warp" style={delay(-rnd() * 1.4, 0.8 + rnd() * 0.7)} x1="0" y1="0" x2={f(12 + rnd() * 16)} y2="0" stroke={i % 6 ? `url(#${u}t)` : '#ffd9a8'} strokeWidth={f(0.5 + rnd() * 0.8)} strokeLinecap="round" />
          </g>
        );
      })}
      <circle cx="50" cy="18" r="9" fill="#e6f4ff" opacity=".55" className="fx-glint" style={{ animationDuration: '0.8s' }} />
      <circle cx="50" cy="18" r="3.4" fill="#fff" />
    </>
  );
};

const dragonEye: Art = (u) => {
  const rnd = seeded(13);
  const eye = 'M2 19 C22 -4 78 -4 98 19 C78 40 22 40 2 19Z';
  return (
    <>
      <defs>
        <radialGradient id={`${u}s`} cx=".5" cy=".3" r=".8">
          <stop offset="0" stopColor="#3a120a" />
          <stop offset=".6" stopColor="#170605" />
          <stop offset="1" stopColor="#050101" />
        </radialGradient>
        <radialGradient id={`${u}i`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff6b0" />
          <stop offset=".35" stopColor="#ffc21a" />
          <stop offset=".7" stopColor="#ff6a00" />
          <stop offset=".92" stopColor="#8a1a00" />
          <stop offset="1" stopColor="#2a0500" />
        </radialGradient>
        <radialGradient id={`${u}g`}>
          <stop offset="0" stopColor="#ff8a00" stopOpacity=".55" />
          <stop offset="1" stopColor="#ff4a00" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${u}k`}>
          <path d={eye} />
        </clipPath>
        <pattern id={`${u}p`} width="5" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 4 A2.5 2.5 0 0 1 5 4" fill="none" stroke="#5a1e10" strokeWidth=".5" />
        </pattern>
        <filter id={`${u}b`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}s)`} />
      <rect width="100" height="100" fill={`url(#${u}p)`} opacity=".6" />
      <ellipse cx="50" cy="19" rx="56" ry="30" fill={`url(#${u}g)`} className="fx-glint" style={{ animationDuration: '3s' }} />
      {/* The eye: iris, a slit that narrows and widens, and lids that blink */}
      <g className="fx-lids" style={{ transformOrigin: '50px 19px' }}>
        <path d={eye} fill="#1a0500" />
        <g clipPath={`url(#${u}k)`}>
          <circle cx="50" cy="19" r="19" fill={`url(#${u}i)`} />
          {range(36).map((i) => {
            const a = i * 10;
            const p = pt(5, a, 50, 19);
            const q = pt(18, a + 4, 50, 19);
            return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#8a2a00" strokeWidth=".35" opacity=".55" />;
          })}
          <g className="fx-pupil" style={{ transformOrigin: '50px 19px' }}>
            <ellipse cx="50" cy="19" rx="2.8" ry="18" fill="#0a0100" />
          </g>
          <ellipse cx="42" cy="11" rx="3.6" ry="1.8" fill="#fff" opacity=".6" transform="rotate(-20 42 11)" />
        </g>
        <path d={eye} fill="none" stroke="#5a1e10" strokeWidth="1.4" />
      </g>
      {/* Smoke drifting across */}
      <g filter={`url(#${u}b)`} opacity=".55">
        <ellipse className="fx-drift-slow" cx="20" cy="52" rx="26" ry="7" fill="#3a2420" />
        <ellipse className="fx-drift-slow fx-rev" cx="80" cy="60" rx="24" ry="6" fill="#2a1a18" />
      </g>
      {range(10).map((i) => (
        <circle key={i} className="fx-ember" style={delay(-rnd() * 3, 2.6 + rnd() * 2)} cx={f(rnd() * 100)} cy={f(60 + rnd() * 40)} r={f(0.3 + rnd() * 0.5)} fill="#ff9a1a" />
      ))}
    </>
  );
};

/* ================================================================== Sovereign */

const heavensGate: Art = (u) => {
  const rnd = seeded(29);
  const cloud = (x: number, y: number, s: number, k: number) => (
    <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="12" ry="5" fill="#fffaf0" />
      <circle cx="-5" cy="-3" r="5" fill="#fffaf0" />
      <circle cx="3" cy="-4.5" r="6" fill="#ffffff" />
      <circle cx="9" cy="-1.5" r="4" fill="#fff6e0" />
      <ellipse cx="0" cy="2.5" rx="12" ry="2.2" fill="#f2dcb0" opacity=".6" />
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset=".45" stopColor="#ffd98a" />
          <stop offset="1" stopColor="#b9d8ff" />
        </linearGradient>
        <radialGradient id={`${u}r`} r=".5">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset=".35" stopColor="#ffd34d" />
          <stop offset=".7" stopColor="#b5800f" />
          <stop offset="1" stopColor="#ffe9a0" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}s)`} />
      {/* Rays of light turning from above the gate */}
      <g className="fx-spin" style={{ transformOrigin: '50px 18px', animationDuration: '30s' }}>
        {range(16).map((i) => {
          const p = pt(90, i * 22.5 - 4, 50, 18);
          const q = pt(90, i * 22.5 + 4, 50, 18);
          return <path key={i} d={`M50 18 L${p.x} ${p.y} L${q.x} ${q.y}Z`} fill="#fff" opacity=".28" />;
        })}
      </g>
      <circle cx="50" cy="18" r="22" fill={`url(#${u}r)`} className="fx-glint" style={{ animationDuration: '3.6s' }} />
      {/* The golden gate */}
      <g stroke={`url(#${u}g)`} fill="none" strokeLinecap="round">
        <path d="M22 70 L22 26 A28 22 0 0 1 78 26 L78 70" strokeWidth="3" />
        <path d="M26 70 L26 28 A24 19 0 0 1 74 28 L74 70" strokeWidth="1" />
        {/* Two gate leaves swung open */}
        <g className="fx-gate-l" style={{ transformOrigin: '26px 40px' }}>
          {range(5).map((i) => (
            <line key={i} x1={28 + i * 4.4} y1={i === 4 ? 24 : 26 + Math.abs(2 - i)} x2={28 + i * 4.4} y2="70" strokeWidth=".9" />
          ))}
          <path d="M27 40 H48 M27 56 H48" strokeWidth=".9" />
        </g>
        <g className="fx-gate-r" style={{ transformOrigin: '74px 40px' }}>
          {range(5).map((i) => (
            <line key={i} x1={72 - i * 4.4} y1={i === 4 ? 24 : 26 + Math.abs(2 - i)} x2={72 - i * 4.4} y2="70" strokeWidth=".9" />
          ))}
          <path d="M52 40 H73 M52 56 H73" strokeWidth=".9" />
        </g>
        {/* Crest */}
        <circle cx="50" cy="6" r="3.2" strokeWidth="1.2" />
      </g>
      <path d="M50 2.2 L51 5 L54 5.2 L51.6 6.8 L52.4 9.6 L50 8 L47.6 9.6 L48.4 6.8 L46 5.2 L49 5Z" fill="#fffbe6" />
      {/* Clouds at the threshold */}
      {[
        [10, 74, 1.3],
        [36, 80, 1.1],
        [66, 78, 1.4],
        [92, 72, 1.2],
        [24, 92, 1.5],
        [78, 94, 1.5],
      ].map(([x, y, s], i) => (
        <g key={i} className="fx-drift-slow" style={delay(-i, 8 + i)}>
          {cloud(x, y, s, i)}
        </g>
      ))}
      {range(12).map((i) => (
        <g key={`t${i}`} transform={`translate(${f(rnd() * 100)} ${f(rnd() * 60)})`}>
          <path className="fx-twinkle" style={delay(rnd() * 3, 2 + rnd() * 1.6)} d={sparkle(1.6 + rnd())} fill="#fff" />
        </g>
      ))}
    </>
  );
};

const genesis: Art = (u) => {
  const rnd = seeded(2026);
  const arm = (rot: number, colors: string[]) =>
    range(30).map((i) => {
      const t = i / 29;
      const a = rot + t * 330;
      const r = 3 + t * 46;
      const p = pt(r, a, 50, 12);
      return <circle key={`${rot}-${i}`} cx={p.x} cy={p.y} r={f(3 - t * 1.9)} fill={colors[i % colors.length]} opacity={f(0.95 - t * 0.6)} />;
    });
  return (
    <>
      <defs>
        <radialGradient id={`${u}s`} cx=".5" cy=".3" r=".85">
          <stop offset="0" stopColor="#2a0e4a" />
          <stop offset=".5" stopColor="#0a0420" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <radialGradient id={`${u}c`}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".2" stopColor="#fff6d0" />
          <stop offset=".45" stopColor="#ffb84d" stopOpacity=".75" />
          <stop offset=".75" stopColor="#ff4fd8" stopOpacity=".25" />
          <stop offset="1" stopColor="#7a5cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${u}f`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}t`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <filter id={`${u}b`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation=".8" />
        </filter>
        <filter id={`${u}n`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#${u}s)`} />
      {/* Nebula clouds */}
      <g filter={`url(#${u}n)`} className="fx-nebula" opacity=".8">
        <ellipse cx="12" cy="30" rx="20" ry="26" fill="#ff4fd8" opacity=".55" />
        <ellipse cx="90" cy="38" rx="18" ry="28" fill="#3fd7ff" opacity=".5" />
        <ellipse cx="50" cy="6" rx="40" ry="10" fill="#ffb84d" opacity=".35" />
        <ellipse cx="20" cy="84" rx="18" ry="14" fill="#7a5cff" opacity=".5" />
        <ellipse cx="84" cy="88" rx="18" ry="14" fill="#ff6a3d" opacity=".4" />
      </g>
      {stars(9, 30, 100, 6)}
      {/* Newborn galaxy turning around the core */}
      <g className="fx-spin" style={{ transformOrigin: '50px 12px', animationDuration: '22s' }} filter={`url(#${u}b)`}>
        {arm(0, ['#fff6d0', '#ffd27a', '#ff9ad5'])}
        {arm(120, ['#e6f4ff', '#7fe3ff', '#a58bff'])}
        {arm(240, ['#fff', '#ffb0e0', '#ffe45c'])}
      </g>
      {/* Shockwaves of light */}
      {range(3).map((i) => (
        <circle key={`w${i}`} className="fx-ping" style={{ ...delay(-i * 1.1, 3.3), transformOrigin: '50px 12px' }} cx="50" cy="12" r="26" fill="none" stroke="#fff3d0" strokeWidth="1.4" />
      ))}
      {/* Matter flying out past you */}
      {range(50).map((i) => {
        const a = rnd() * 360;
        const p = pt(6 + rnd() * 8, a, 50, 12);
        return (
          <g key={`s${i}`} transform={`translate(${p.x} ${p.y}) rotate(${f(a - 90)})`}>
            <line className="fx-warp" style={delay(-rnd() * 2, 1.4 + rnd() * 1.2)} x1="0" y1="0" x2={f(8 + rnd() * 14)} y2="0" stroke={`url(#${u}t)`} strokeWidth={f(0.4 + rnd() * 0.6)} strokeLinecap="round" />
          </g>
        );
      })}
      {/* The core and its flare */}
      <circle cx="50" cy="12" r="24" fill={`url(#${u}c)`} className="fx-core" style={{ transformOrigin: '50px 12px' }} />
      <rect x="0" y="11.2" width="100" height="1.6" fill={`url(#${u}f)`} className="fx-glint" style={{ animationDuration: '2.2s' }} />
      <circle cx="50" cy="12" r="4.5" fill="#fff" />
    </>
  );
};

export const HIGH_BACKDROP_ART: Record<string, Art> = {
  'bg-sakura': sakura,
  'bg-mainframe': mainframe,
  'bg-volcano': eruption,
  'bg-vault': vault,
  'bg-hyperspace': hyperspace,
  'bg-dragoneye': dragonEye,
  'bg-heaven': heavensGate,
  'bg-genesis': genesis,
};

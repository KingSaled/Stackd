/**
 * The 1M to 30M borders (Exotic, Ascendant and Sovereign). Same canvas as
 * FrameArt.tsx: centred on (0,0), avatar edge at radius 50, ring band on R.
 * Nothing is drawn inside radius ~46 so the portrait stays clear; the biggest
 * pieces (wings, the dragon's pearl) reach past the box on purpose.
 */
import type { CSSProperties, ReactNode } from 'react';
import { arc, pt, range, seeded, sparkle } from './geometry';

type Art = (u: string) => ReactNode;

const R = 50.5;

const ring = (r: number, stroke: string, width: number, extra?: Record<string, unknown>) => (
  <circle r={r} fill="none" stroke={stroke} strokeWidth={width} {...extra} />
);

const delay = (s: number, dur?: number): CSSProperties => ({ animationDelay: `${s}s`, ...(dur ? { animationDuration: `${dur}s` } : {}) });

const f = (n: number) => +n.toFixed(2);

/** Closed band between two radii that vary with angle (for serpent and dragon bodies). */
function band(from: number, to: number, steps: number, centre: (a: number) => number, width: (t: number) => number) {
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = from + (to - from) * t;
    const r = centre(a);
    const w = width(t) / 2;
    const o = pt(r + w, a);
    const n = pt(r - w, a);
    outer.push(`${o.x} ${o.y}`);
    inner.unshift(`${n.x} ${n.y}`);
  }
  return `M${outer.join('L')}L${inner.join('L')}Z`;
}

/** Centre line of a band as a path (for shimmer strokes along a body). */
function spine(from: number, to: number, steps: number, centre: (a: number) => number) {
  return `M${range(steps + 1)
    .map((i) => {
      const a = from + ((to - from) * i) / steps;
      const p = pt(centre(a), a);
      return `${p.x} ${p.y}`;
    })
    .join('L')}`;
}

/* ================================================================== Exotic */

const sakuraWreath: Art = (u) => {
  const rnd = seeded(314);
  const flower = (s: number, k: number) => (
    <g transform={`scale(${f(s)}) rotate(${(k * 41) % 72})`}>
      {range(5).map((i) => (
        <path
          key={i}
          d="M0 0 C1.6 -1 2 -3 1.1 -4.4 L0 -3.7 L-1.1 -4.4 C-2 -3 -1.6 -1 0 0Z"
          fill={`url(#${u}p)`}
          stroke="#e87aa8"
          strokeWidth=".18"
          transform={`rotate(${i * 72})`}
        />
      ))}
      <circle r="1" fill="#ff7fae" />
      {range(6).map((i) => {
        const q = pt(1.5, i * 60 + 30);
        return <circle key={i} cx={q.x} cy={q.y} r=".32" fill="#ffd84d" />;
      })}
    </g>
  );
  const blooms = range(26).map((i) => ({ a: i * (360 / 26) + (rnd() - 0.5) * 8, r: R + (rnd() - 0.5) * 5, s: 0.9 + rnd() * 0.55 }));
  return (
    <>
      <defs>
        <radialGradient id={`${u}p`} cx=".5" cy=".9" r="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".55" stopColor="#ffd6e7" />
          <stop offset="1" stopColor="#ff9ec7" />
        </radialGradient>
        <radialGradient id={`${u}g`} r=".5">
          <stop offset=".76" stopColor="#ff9ec7" stopOpacity="0" />
          <stop offset=".86" stopColor="#ff9ec7" stopOpacity=".4" />
          <stop offset="1" stopColor="#ff9ec7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="64" fill={`url(#${u}g)`} />
      {/* The branch the wreath is woven from */}
      {ring(R, '#3a1e18', 3.6)}
      {ring(R + 1.2, '#5a3226', 1.4, { pathLength: 40, strokeDasharray: '7 3 5 4' })}
      {range(14).map((i) => {
        const a = i * 25.7 + 6;
        const p = pt(R, a);
        const q = pt(R + 5.5, a + 6);
        return <line key={`t${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#4a2a20" strokeWidth=".9" strokeLinecap="round" />;
      })}
      {/* Leaves and buds */}
      {range(18).map((i) => {
        const a = i * 20 + 9;
        const p = pt(R + (i % 2 ? 3.4 : -2.6), a);
        return <ellipse key={`l${i}`} cx={p.x} cy={p.y} rx="1.1" ry="2.6" fill={i % 3 ? '#5fae5a' : '#7cc96a'} transform={`rotate(${f(a + 50)} ${p.x} ${p.y})`} />;
      })}
      {range(10).map((i) => {
        const p = pt(R + 4.6, i * 36 + 18);
        return <ellipse key={`b${i}`} cx={p.x} cy={p.y} rx="1.3" ry="1.8" fill="#ff7fae" stroke="#c94f80" strokeWidth=".25" />;
      })}
      {/* Blossom */}
      {blooms.map((b, i) => {
        const p = pt(b.r, b.a);
        return (
          <g key={`f${i}`} transform={`translate(${p.x} ${p.y})`}>
            {flower(b.s, i)}
          </g>
        );
      })}
      {/* Petals drifting off on the breeze */}
      {range(10).map((i) => {
        const p = pt(R + 2, rnd() * 360);
        return (
          <g key={`d${i}`} className="fx-blow" style={delay(-rnd() * 4, 3.4 + rnd() * 2)}>
            <ellipse cx={p.x} cy={p.y} rx="1.2" ry=".7" fill="#ffc4dd" />
          </g>
        );
      })}
      {[30, 150, 270].map((a, i) => {
        const p = pt(R + 5, a);
        return <path key={a} className="fx-twinkle" style={delay(i * 0.8, 2.6)} d={sparkle(1.8)} fill="#fff" transform={`translate(${p.x} ${p.y})`} />;
      })}
    </>
  );
};

const glitch: Art = (u) => {
  const rnd = seeded(77);
  const hex = '0x5TACKD 7F 3A E1 ▓▒░ 0110 1001 C0FFEE ░▒▓ FF 00 9B ';
  return (
    <>
      <defs>
        <path id={`${u}t`} d={`M0 -56.6A56.6 56.6 0 1 1 -0.01 -56.6`} />
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1f2e" />
          <stop offset="1" stopColor="#05060b" />
        </linearGradient>
      </defs>
      {ring(R, '#000', 10.2)}
      {ring(R, `url(#${u}g)`, 8.6)}
      {/* RGB-split ring segments that tear apart now and then */}
      <g className="fx-tear-a" style={{ mixBlendMode: 'screen' }}>
        {ring(R, '#ff1f6d', 3.2, { pathLength: 96, strokeDasharray: '5 3 2 4 9 1', opacity: 0.9 })}
      </g>
      <g className="fx-tear-b" style={{ mixBlendMode: 'screen' }}>
        {ring(R, '#1fe3ff', 3.2, { pathLength: 96, strokeDasharray: '5 3 2 4 9 1', opacity: 0.9 })}
      </g>
      {ring(R, '#eafcff', 1, { pathLength: 96, strokeDasharray: '5 3 2 4 9 1' })}
      {ring(46.4, '#1fe3ff', 0.5, { opacity: 0.7 })}
      {ring(54.6, '#ff1f6d', 0.5, { opacity: 0.7 })}
      {/* Scrolling hex readout */}
      <g className="fx-spin" style={{ animationDuration: '36s' }}>
        <text fontFamily="ui-monospace, Menlo, Consolas, monospace" fontSize="3.6" fontWeight="700" fill="#39ffb6" opacity=".85" letterSpacing=".4">
          <textPath href={`#${u}t`}>{hex + hex}</textPath>
        </text>
      </g>
      {/* Dropped-frame blocks blinking on and off */}
      {range(14).map((i) => {
        const a = rnd() * 360;
        const p = pt(R + (rnd() - 0.5) * 9, a);
        const w = 1.5 + rnd() * 4.5;
        const h = 0.8 + rnd() * 1.8;
        const c = ['#ff1f6d', '#1fe3ff', '#eafcff', '#39ffb6'][i % 4];
        return <rect key={i} className="fx-blink" style={delay(rnd() * 2.4, 1.2 + rnd() * 1.6)} x={f(p.x - w / 2)} y={f(p.y - h / 2)} width={f(w)} height={f(h)} fill={c} />;
      })}
    </>
  );
};

const frostbound: Art = (u) => {
  const rnd = seeded(23);
  const flake = (s: number) => (
    <g stroke="#f2fdff" strokeWidth={0.45} strokeLinecap="round">
      {range(6).map((i) => (
        <g key={i} transform={`rotate(${i * 60})`}>
          <line x1="0" y1="0" x2="0" y2={-s} />
          <line x1="0" y1={-s * 0.55} x2={s * 0.3} y2={-s * 0.8} />
          <line x1="0" y1={-s * 0.55} x2={-s * 0.3} y2={-s * 0.8} />
        </g>
      ))}
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={`${u}i`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".3" stopColor="#b9efff" />
          <stop offset=".55" stopColor="#3f9fe0" />
          <stop offset=".8" stopColor="#d8f7ff" />
          <stop offset="1" stopColor="#5fb8f0" />
        </linearGradient>
        <linearGradient id={`${u}s`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#7fd3ff" stopOpacity=".95" />
          <stop offset=".6" stopColor="#e6fbff" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <radialGradient id={`${u}m`} r=".5">
          <stop offset=".78" stopColor="#9fe8ff" stopOpacity="0" />
          <stop offset=".88" stopColor="#9fe8ff" stopOpacity=".45" />
          <stop offset="1" stopColor="#9fe8ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="66" fill={`url(#${u}m)`} className="fx-glint" style={{ animationDuration: '3.4s' }} />
      {/* Ice spikes growing out of the ring */}
      {range(20).map((i) => {
        const a = i * 18 + (rnd() - 0.5) * 6;
        const len = 6 + rnd() * 8 + (i % 2 ? 0 : 3);
        const w = 1.6 + rnd() * 1.4;
        return (
          <g key={i} transform={`rotate(${f(a)})`}>
            <path className="fx-grow" style={delay(-rnd() * 3, 3 + rnd() * 2)} d={`M${-w} -52 L0 ${f(-52 - len)} L${w} -52 L0 -50Z`} fill={`url(#${u}s)`} stroke="#ffffff" strokeOpacity=".7" strokeWidth=".25" />
          </g>
        );
      })}
      {ring(R, '#0e3a5c', 9.6)}
      {ring(R, `url(#${u}i)`, 7.6)}
      {range(26).map((i) => {
        const p = pt(R + (rnd() - 0.5) * 6, rnd() * 360);
        return <circle key={`d${i}`} cx={p.x} cy={p.y} r={f(0.3 + rnd() * 0.5)} fill="#fff" opacity={f(0.5 + rnd() * 0.5)} />;
      })}
      {ring(46.8, '#e6fbff', 0.6, { opacity: 0.8 })}
      {/* Snowflakes circling in the cold */}
      <g className="fx-spin" style={{ animationDuration: '22s' }}>
        {[20, 80, 140, 200, 260, 320].map((a, i) => {
          const p = pt(59 + (i % 2) * 2.5, a);
          return (
            <g key={a} transform={`translate(${p.x} ${p.y})`}>
              <g className="fx-twinkle" style={delay(i * 0.5, 3)}>
                {flake(2.4 + (i % 3) * 0.5)}
              </g>
            </g>
          );
        })}
      </g>
      {[0, 120, 240].map((a, i) => {
        const p = pt(55, a + 40);
        return <path key={a} className="fx-twinkle" style={delay(i * 0.9, 2.4)} d={sparkle(2.2)} fill="#fff" transform={`translate(${p.x} ${p.y})`} />;
      })}
    </>
  );
};

/* ================================================================== Ascendant */

const eventHorizon: Art = (u) => {
  const rnd = seeded(5);
  return (
    <>
      <defs>
        <linearGradient id={`${u}d`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset=".3" stopColor="#ffb340" />
          <stop offset=".6" stopColor="#ff5a1a" />
          <stop offset="1" stopColor="#7a1400" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id={`${u}e`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#ff2a00" stopOpacity=".25" />
        </linearGradient>
        <radialGradient id={`${u}l`} r=".5">
          <stop offset=".8" stopColor="#6aa8ff" stopOpacity="0" />
          <stop offset=".9" stopColor="#8fc0ff" stopOpacity=".5" />
          <stop offset="1" stopColor="#6aa8ff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${u}b`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      {/* Lensed starlight: the Einstein ring */}
      <circle r="67" fill={`url(#${u}l)`} className="fx-glint" style={{ animationDuration: '4s' }} />
      {ring(R + 0.5, '#030106', 12)}
      {/* Accretion disk, whirling */}
      <g className="fx-spin" style={{ animationDuration: '3.2s' }} filter={`url(#${u}b)`}>
        {range(7).map((i) => (
          <path key={i} d={arc(R + (i % 3) * 1.6 - 1.6, i * 51, i * 51 + 150)} fill="none" stroke={`url(#${u}d)`} strokeWidth={2.6 + (i % 2)} strokeLinecap="round" opacity={0.85} />
        ))}
      </g>
      <g className="fx-spin" style={{ animationDuration: '5.5s' }}>
        {range(5).map((i) => (
          <path key={i} d={arc(R + 3.6 - (i % 2) * 7, i * 72 + 20, i * 72 + 70)} fill="none" stroke="#ffe2a3" strokeWidth=".6" strokeLinecap="round" opacity=".75" />
        ))}
      </g>
      {/* Doppler brightening: the side coming towards you burns hotter */}
      {ring(R, `url(#${u}e)`, 11)}
      {/* Photon ring hugging the shadow */}
      {ring(46.9, '#fff3d0', 1, { opacity: 0.95 })}
      {ring(46.9, '#ffb340', 2.4, { opacity: 0.35 })}
      {/* Matter spiralling in */}
      {range(9).map((i) => {
        const a = rnd() * 360;
        const p = pt(60, a);
        return (
          <g key={i} className="fx-infall" style={delay(-rnd() * 3, 2.6 + rnd() * 1.6)}>
            <circle cx={p.x} cy={p.y} r={f(0.5 + rnd() * 0.7)} fill={i % 3 ? '#ffd27a' : '#ffffff'} />
          </g>
        );
      })}
    </>
  );
};

const ouroboros: Art = (u) => {
  const centre = (a: number) => R + Math.sin(((a - 12) / 336) * Math.PI * 2 * 4) * 0.9;
  const body = band(12, 348, 120, centre, (t) => (t < 0.12 ? 2 + (t / 0.12) * 6.5 : t > 0.93 ? 8.5 + ((t - 0.93) / 0.07) * 1.5 : 8.5));
  const line = spine(12, 348, 90, centre);
  // Head at the top, biting the tail tip
  const head = pt(R, 352);
  return (
    <>
      <defs>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7dffbf" />
          <stop offset=".3" stopColor="#15a565" />
          <stop offset=".55" stopColor="#063d26" />
          <stop offset=".8" stopColor="#1fc77c" />
          <stop offset="1" stopColor="#0a4f31" />
        </linearGradient>
        <linearGradient id={`${u}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5df2a6" />
          <stop offset=".6" stopColor="#0f8a52" />
          <stop offset="1" stopColor="#063d26" />
        </linearGradient>
        <pattern id={`${u}s`} width="3.2" height="2.6" patternUnits="userSpaceOnUse">
          <path d="M0 2.6 A1.6 1.6 0 0 1 3.2 2.6" fill="none" stroke="#e9c45a" strokeWidth=".35" opacity=".8" />
          <path d="M-1.6 1.3 A1.6 1.6 0 0 1 1.6 1.3 M1.6 1.3 A1.6 1.6 0 0 1 4.8 1.3" fill="none" stroke="#e9c45a" strokeWidth=".35" opacity=".55" />
        </pattern>
        <radialGradient id={`${u}e`}>
          <stop offset="0" stopColor="#fff6b0" />
          <stop offset=".5" stopColor="#ffb300" />
          <stop offset="1" stopColor="#ff5a00" />
        </radialGradient>
      </defs>
      <g className="fx-spin" style={{ animationDuration: '48s' }}>
        <path d={body} fill="#021a10" transform="scale(1.035)" opacity=".7" />
        <path d={body} fill={`url(#${u}b)`} stroke="#02170e" strokeWidth=".6" />
        <path d={body} fill={`url(#${u}s)`} />
        {/* Gold belly line and a shimmer that rolls down the body */}
        <path d={spine(14, 346, 90, (a) => centre(a) - 3.4)} fill="none" stroke="#f6d27a" strokeWidth=".7" opacity=".8" />
        <path className="fx-dash" d={line} fill="none" stroke="#e9fff4" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="5 60" opacity=".55" />
        {/* Spine ridge */}
        {range(26).map((i) => {
          const a = 24 + i * 12.4;
          const p = pt(centre(a) + 4.2, a);
          return <path key={i} d="M-1 0 L0 -2.4 L1 0Z" fill="#e9c45a" transform={`translate(${p.x} ${p.y}) rotate(${f(a)})`} />;
        })}
        {/* The head, jaws wrapped round the tail */}
        <g transform={`translate(${head.x} ${head.y}) rotate(-8)`}>
          <path d="M-9 -5.5 C-4 -8 4 -7.5 9.5 -3.2 L11.5 -0.4 L7 0.2 L11 2.2 L9 4.4 C3 6.8 -4 6.6 -9 5 C-11 2.5 -11 -2.8 -9 -5.5Z" fill={`url(#${u}h)`} stroke="#02170e" strokeWidth=".6" />
          <path d="M-4 -6.6 L-7.5 -10.5 L-2.4 -7.2Z M0 -7.3 L-1.6 -11.4 L2 -7.2Z" fill="#e9c45a" stroke="#6b4a0a" strokeWidth=".3" />
          <ellipse cx="2.6" cy="-2.8" rx="1.9" ry="1.5" fill={`url(#${u}e)`} className="fx-glint" style={{ animationDuration: '1.8s' }} />
          <ellipse cx="2.8" cy="-2.8" rx=".35" ry="1.2" fill="#1a0a00" />
          <circle cx="9.4" cy="-2.2" r=".45" fill="#02170e" />
          <path d="M-8 1.2 C-3 2.6 3 2.4 8 1" fill="none" stroke="#f6d27a" strokeWidth=".5" opacity=".7" />
        </g>
      </g>
    </>
  );
};

const phoenix: Art = (u) => {
  const rnd = seeded(91);
  // A broad flame feather, root at (0,0), pointing up (negative y).
  const feather = (len: number, w: number) =>
    `M0 0 C${w * 1.1} ${-len * 0.18} ${w} ${-len * 0.62} ${w * 0.25} ${-len * 0.92} Q0 ${-len * 1.04} ${-w * 0.2} ${-len * 0.9} C${-w * 0.8} ${-len * 0.62} ${-w * 1.05} ${-len * 0.2} 0 0Z`;
  // The wing's leading edge: from the shoulder up and out to the tip.
  const arm = (t: number) => {
    const a = { x: 6, y: -50 };
    const c = { x: 32, y: -84 };
    const b = { x: 66, y: -60 };
    const m = 1 - t;
    return { x: m * m * a.x + 2 * m * t * c.x + t * t * b.x, y: m * m * a.y + 2 * m * t * c.y + t * t * b.y };
  };
  const wing = (side: 1 | -1) => (
    <g transform={`scale(${side} 1)`}>
      <g className="fx-wing" style={{ transformOrigin: '6px -50px', ...delay(side === 1 ? 0 : -0.04, 1.5) }}>
        {/* Primaries and secondaries hanging from the arm, longest at the tip */}
        {range(14).map((k) => {
          const t = 0.08 + (k / 13) * 0.92;
          const p = arm(t);
          const a = 200 - t * 82;
          const len = 20 + t * 18;
          return (
            <g key={k} transform={`translate(${f(p.x)} ${f(p.y)}) rotate(${f(a)})`}>
              <path className="fx-flame" style={delay(-((k * 0.13) % 0.8), 0.75 + (k % 3) * 0.1)} d={feather(len, 7.5)} fill={`url(#${u}w)`} />
            </g>
          );
        })}
        {/* Coverts: shorter, hotter feathers over the top */}
        {range(10).map((k) => {
          const t = k / 9;
          const p = arm(t * 0.92);
          const a = 190 - t * 72;
          const len = 11 + t * 10;
          return (
            <g key={`c${k}`} transform={`translate(${f(p.x)} ${f(p.y)}) rotate(${f(a)})`}>
              <path className="fx-flame" style={delay(-((k * 0.19) % 0.7), 0.6 + (k % 2) * 0.12)} d={feather(len, 5.5)} fill={`url(#${u}c)`} />
            </g>
          );
        })}
        <path d="M6 -50 Q32 -84 66 -60" fill="none" stroke="#ffe27a" strokeWidth="3" strokeLinecap="round" />
        <path d="M6 -50 Q32 -84 66 -60" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".85" />
      </g>
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={`${u}w`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset=".25" stopColor="#ffb21a" />
          <stop offset=".6" stopColor="#ff4a0a" />
          <stop offset="1" stopColor="#c2000f" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id={`${u}c`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".45" stopColor="#ffe27a" />
          <stop offset="1" stopColor="#ff8a1a" stopOpacity=".3" />
        </linearGradient>
        <linearGradient id={`${u}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2b8" />
          <stop offset=".3" stopColor="#ff9a1a" />
          <stop offset=".6" stopColor="#c21a08" />
          <stop offset="1" stopColor="#ffcc4d" />
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset=".5" stopColor="#ffb21a" />
          <stop offset="1" stopColor="#e3360a" />
        </linearGradient>
        <radialGradient id={`${u}g`} r=".5">
          <stop offset=".7" stopColor="#ff6a00" stopOpacity="0" />
          <stop offset=".82" stopColor="#ff6a00" stopOpacity=".55" />
          <stop offset="1" stopColor="#ff2d00" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="68" fill={`url(#${u}g)`} />
      {/* Tail plumes trailing below */}
      {[-30, -15, 0, 15, 30].map((a, i) => (
        <g key={a} transform={`translate(0 47) rotate(${180 + a})`}>
          <path className="fx-flame" style={delay(-i * 0.23, 0.85)} d={feather(i === 2 ? 30 : i % 2 ? 26 : 20, 5.5)} fill={`url(#${u}w)`} />
        </g>
      ))}
      {wing(1)}
      {wing(-1)}
      {ring(R, '#2a0500', 9.8)}
      {ring(R, `url(#${u}r)`, 7.4)}
      {ring(R, '#fff0b0', 7.4, { pathLength: 60, strokeDasharray: '0.5 2.5', opacity: 0.6 })}
      {/* The firebird: body over the crown of the ring, head raised */}
      <g transform="translate(0 -52)">
        <path d="M-7 6 C-8 -2 -4 -8 0 -12 C4 -8 8 -2 7 6 C4 9 -4 9 -7 6Z" fill={`url(#${u}b)`} stroke="#8a1a00" strokeWidth=".5" />
        <path d="M-2.4 -9 C-3 -14 -2 -18 1.5 -20 C5 -20 6.5 -17 5 -14.5 C4 -12.5 2 -11 2.4 -8Z" fill={`url(#${u}b)`} stroke="#8a1a00" strokeWidth=".5" />
        <path d="M5 -17.6 L9.6 -16.4 L5.2 -15.2Z" fill="#ffd36b" stroke="#8a4a00" strokeWidth=".3" />
        <circle cx="2.6" cy="-17" r=".95" fill="#fff" />
        <circle cx="2.8" cy="-17" r=".5" fill="#5a0a00" />
        {[-34, -14, 6].map((a, i) => (
          <g key={a} transform={`translate(0 -19.5) rotate(${a - 10})`}>
            <path className="fx-flame" style={delay(-i * 0.2, 0.6)} d={feather(i === 1 ? 10 : 8, 2.4)} fill={`url(#${u}w)`} />
          </g>
        ))}
      </g>
      {/* Embers drifting up */}
      {range(14).map((i) => {
        const x = (rnd() - 0.5) * 120;
        const y = -10 + rnd() * 60;
        return <circle key={i} className="fx-ember" style={delay(-rnd() * 3, 2 + rnd() * 1.6)} cx={f(x)} cy={f(y)} r={f(0.5 + rnd() * 0.7)} fill={i % 2 ? '#ffd27a' : '#ff7a1a'} />;
      })}
    </>
  );
};

/* ================================================================== Sovereign */

const crownOfKings: Art = (u) => {
  const rnd = seeded(707);
  const crown =
    'M-22 -57 L-24 -71 L-16.5 -63.5 L-11.5 -76 L-5.6 -64.5 L0 -81 L5.6 -64.5 L11.5 -76 L16.5 -63.5 L24 -71 L22 -57 Q0 -53 -22 -57Z';
  const gemColors = ['#ff2d55', '#1fb86a', '#2f6bff'];
  return (
    <>
      <defs>
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset=".2" stopColor="#ffd34d" />
          <stop offset=".45" stopColor="#a8680c" />
          <stop offset=".65" stopColor="#ffe48a" />
          <stop offset="1" stopColor="#b5780f" />
        </linearGradient>
        <linearGradient id={`${u}v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4123a" />
          <stop offset="1" stopColor="#4a0414" />
        </linearGradient>
        {gemColors.map((c, i) => (
          <radialGradient key={c} id={`${u}j${i}`} cx=".35" cy=".3" r=".8">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".35" stopColor={c} />
            <stop offset="1" stopColor="#0a0410" />
          </radialGradient>
        ))}
        <radialGradient id={`${u}p`} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#f2ece0" />
          <stop offset="1" stopColor="#b8ad98" />
        </radialGradient>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}h`} r=".5">
          <stop offset=".76" stopColor="#ffd34d" stopOpacity="0" />
          <stop offset=".86" stopColor="#ffd34d" stopOpacity=".5" />
          <stop offset="1" stopColor="#ff9a00" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${u}k`}>
          <path d={crown} />
        </clipPath>
      </defs>
      <circle r="66" fill={`url(#${u}h)`} className="fx-glint" style={{ animationDuration: '3s' }} />
      {/* Rays fanning up behind the crown */}
      <g className="fx-ray">
        {range(9).map((i) => {
          const a = -60 + i * 15;
          const p = pt(40, a, 0, -62);
          const q = pt(40, a + 5, 0, -62);
          return <path key={i} d={`M0 -62 L${p.x} ${p.y} L${q.x} ${q.y}Z`} fill="#fff3c4" opacity=".18" />;
        })}
      </g>
      {/* Jewelled band */}
      {ring(R, '#3d2604', 10.4)}
      {ring(R, `url(#${u}g)`, 8.6)}
      {ring(46.4, '#2a1803', 1.2)}
      {ring(54.6, '#fff3c4', 0.5, { opacity: 0.8 })}
      {range(18).map((i) => {
        const a = i * 20 + 10;
        if (a > 320 || a < 40) return null;
        const p = pt(R, a);
        const k = i % 3;
        return (
          <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${a})`}>
            <rect x="-2.6" y="-2.6" width="5.2" height="5.2" rx="1" fill={`url(#${u}g)`} stroke="#5a3a06" strokeWidth=".4" transform="rotate(45)" />
            <path d="M0 -2.4 L2.1 0 L0 2.4 L-2.1 0Z" fill={`url(#${u}j${k})`} />
          </g>
        );
      })}
      {range(18).map((i) => {
        const p = pt(R, i * 20);
        if (i * 20 > 320 || i * 20 < 40) return null;
        return <circle key={`p${i}`} cx={p.x} cy={p.y} r="1.1" fill={`url(#${u}p)`} />;
      })}
      {/* The crown */}
      <g className="fx-halo">
        <path d="M-17 -60 Q0 -92 17 -60Z" fill={`url(#${u}v)`} />
        <path d="M-17 -60 Q0 -92 17 -60" fill="none" stroke="#ffe48a" strokeWidth=".6" opacity=".6" />
        <path d={crown} fill={`url(#${u}g)`} stroke="#5a3a06" strokeWidth=".7" strokeLinejoin="round" />
        <path d="M-22 -60.4 Q0 -56.6 22 -60.4" fill="none" stroke="#5a3a06" strokeWidth=".5" opacity=".7" />
        {/* Light running across the gold */}
        <g clipPath={`url(#${u}k)`}>
          <rect className="fx-sheen-crown" x="-40" y="-84" width="12" height="32" fill={`url(#${u}s)`} transform="skewX(-18)" />
        </g>
        {[
          [-24, -71],
          [-11.5, -76],
          [11.5, -76],
          [24, -71],
        ].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="2" fill={`url(#${u}p)`} stroke="#8a7a5a" strokeWidth=".25" />
        ))}
        <circle cx="0" cy="-81" r="2.5" fill={`url(#${u}p)`} stroke="#8a7a5a" strokeWidth=".25" />
        {/* Stones on the band */}
        <ellipse cx="0" cy="-58" rx="3" ry="2.2" fill={`url(#${u}j0)`} stroke="#5a3a06" strokeWidth=".4" />
        {[-11, 11].map((x) => (
          <ellipse key={x} cx={x} cy="-58.4" rx="2.1" ry="1.7" fill={`url(#${u}j2)`} stroke="#5a3a06" strokeWidth=".35" />
        ))}
        {[-18.5, 18.5].map((x) => (
          <rect key={x} x={x - 1.5} y="-60" width="3" height="3" fill={`url(#${u}j1)`} stroke="#5a3a06" strokeWidth=".35" transform={`rotate(45 ${x} -58.5)`} />
        ))}
        <ellipse cx="0" cy="-69" rx="1.8" ry="2.6" fill={`url(#${u}j0)`} stroke="#5a3a06" strokeWidth=".35" />
      </g>
      {/* Glints dancing over the stones */}
      {range(10).map((i) => {
        const p = i < 4 ? { x: [-11.5, 0, 11.5, 0][i], y: [-76, -81, -76, -58][i] } : pt(R, 50 + rnd() * 260);
        return (
          <g key={`g${i}`} transform={`translate(${p.x} ${p.y})`}>
            <path className="fx-twinkle" style={delay(rnd() * 3, 1.6 + rnd() * 1.4)} d={sparkle(2.4 + rnd() * 1.4)} fill="#fff" />
          </g>
        );
      })}
    </>
  );
};

const seraphim: Art = (u) => {
  const rnd = seeded(101);
  // A long feather, root at (0,0), pointing up.
  const plume = (len: number, w: number) => `M0 0 C${w} ${-len * 0.3} ${w * 0.8} ${-len * 0.78} 0 ${-len} C${-w * 0.8} ${-len * 0.78} ${-w} ${-len * 0.3} 0 0Z`;
  // A wing: a fan of feathers rooted near the ring, spreading out from angle `base`.
  const wing = (base: number, side: 1 | -1, scale: number, i: number) => {
    const root = pt(49, base);
    return (
      <g key={`${base}`} transform={`translate(${root.x} ${root.y})`}>
        <g className="fx-wing" style={{ transformOrigin: '0 0', ...delay(-i * 0.25, 2.2) }}>
          {range(7).map((k) => {
            const a = base + side * (k * 11 - 10);
            const len = (22 + Math.sin((k / 6) * Math.PI) * 12) * scale;
            return (
              <g key={k} transform={`rotate(${f(a)})`}>
                <path d={plume(len, 3.6 * scale)} fill={`url(#${u}w)`} stroke="#b8860b" strokeWidth=".35" />
                <path d={`M0 -1 L0 ${f(-len * 0.85)}`} stroke="#fff8dc" strokeWidth=".35" opacity=".9" />
              </g>
            );
          })}
          {range(5).map((k) => {
            const a = base + side * (k * 12 - 4);
            return (
              <g key={`c${k}`} transform={`rotate(${f(a)})`}>
                <path d={plume(12 * scale, 3 * scale)} fill={`url(#${u}c)`} stroke="#d4a017" strokeWidth=".3" />
              </g>
            );
          })}
        </g>
      </g>
    );
  };
  return (
    <>
      <defs>
        <linearGradient id={`${u}w`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffe9a0" />
          <stop offset=".45" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity=".7" />
        </linearGradient>
        <linearGradient id={`${u}c`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#d4a017" />
          <stop offset=".6" stopColor="#ffe9a0" />
          <stop offset="1" stopColor="#fffbe6" />
        </linearGradient>
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".25" stopColor="#ffe48a" />
          <stop offset=".5" stopColor="#c99512" />
          <stop offset=".75" stopColor="#fff3c2" />
          <stop offset="1" stopColor="#d9a52a" />
        </linearGradient>
        <radialGradient id={`${u}r`} r=".5">
          <stop offset=".5" stopColor="#fff6d0" stopOpacity=".6" />
          <stop offset="1" stopColor="#fff6d0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}h`}>
          <stop offset=".55" stopColor="#fffbe6" stopOpacity="0" />
          <stop offset=".75" stopColor="#ffe48a" stopOpacity=".9" />
          <stop offset="1" stopColor="#ffb300" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* God rays turning behind everything */}
      <g className="fx-spin" style={{ animationDuration: '40s' }} opacity=".75">
        {range(18).map((i) => (
          <path key={i} d={`M${pt(52, i * 20 - 3).x} ${pt(52, i * 20 - 3).y} L${pt(84, i * 20 - 6).x} ${pt(84, i * 20 - 6).y} L${pt(84, i * 20 + 6).x} ${pt(84, i * 20 + 6).y} L${pt(52, i * 20 + 3).x} ${pt(52, i * 20 + 3).y}Z`} fill={`url(#${u}r)`} />
        ))}
      </g>
      {/* Six wings: high, level and low, on each side */}
      {wing(52, 1, 1.05, 0)}
      {wing(-52, -1, 1.05, 0)}
      {wing(92, 1, 0.95, 1)}
      {wing(-92, -1, 0.95, 1)}
      {wing(132, 1, 0.8, 2)}
      {wing(-132, -1, 0.8, 2)}
      {/* Radiant band with turning rings of sacred marks */}
      {ring(R, '#5a3d05', 10)}
      {ring(R, `url(#${u}g)`, 8)}
      {ring(R, '#fff', 8, { pathLength: 72, strokeDasharray: '0.4 2.6', opacity: 0.6 })}
      <g className="fx-spin" style={{ animationDuration: '24s' }}>
        {ring(55.4, '#ffe48a', 0.6)}
        {range(24).map((i) => {
          const p = pt(55.4, i * 15);
          return i % 3 === 0 ? (
            <path key={i} d={sparkle(1.4)} fill="#fffbe6" transform={`translate(${p.x} ${p.y})`} />
          ) : (
            <circle key={i} cx={p.x} cy={p.y} r=".55" fill="#fffbe6" />
          );
        })}
      </g>
      <g className="fx-spin fx-rev" style={{ animationDuration: '18s' }}>
        {ring(46.2, '#ffe48a', 0.5, { pathLength: 48, strokeDasharray: '3 1' })}
      </g>
      {/* The halo above */}
      <g className="fx-halo">
        <ellipse cy="-63" rx="17" ry="4.6" fill="none" stroke={`url(#${u}h)`} strokeWidth="5" />
        <ellipse cy="-63" rx="15.5" ry="3.8" fill="none" stroke="#fffbe6" strokeWidth="1.3" />
      </g>
      {/* Drifting motes of light */}
      {range(12).map((i) => {
        const p = pt(56 + rnd() * 12, rnd() * 360);
        return (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            <path className="fx-twinkle" style={delay(rnd() * 3, 1.8 + rnd() * 1.6)} d={sparkle(1.2 + rnd() * 1.4)} fill="#fffbe6" />
          </g>
        );
      })}
    </>
  );
};

export const HIGH_FRAME_ART: Record<string, Art> = {
  'frame-sakura': sakuraWreath,
  'frame-glitch': glitch,
  'frame-frost': frostbound,
  'frame-horizon': eventHorizon,
  'frame-ouroboros': ouroboros,
  'frame-phoenix': phoenix,
  'frame-crown': crownOfKings,
  'frame-seraph': seraphim,
};

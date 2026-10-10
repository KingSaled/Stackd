/**
 * Stackd Club cards: the badge that sits next to a member's name everywhere, and
 * the full card (profile and shop) with the member's name, number and a tilt-to-
 * shine finish. Pure status: the price is the point.
 */
import { useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { cosmeticById } from '../../../shared/cosmetics';

interface Look {
  label: string;
  /** Card face gradient, top-left to bottom-right. */
  face: string[];
  /** Text and emblem ink. */
  ink: string;
  /** Embossed text highlight / shadow. */
  hi: string;
  lo: string;
  edge: string;
}

const LOOKS: Record<string, Look> = {
  'club-silver': { label: 'SILVER', face: ['#f7f9fc', '#c9d0da', '#8f98a6', '#e3e8ee', '#a9b2be'], ink: '#2c323b', hi: 'rgba(255,255,255,.9)', lo: 'rgba(0,0,0,.35)', edge: '#6d7683' },
  'club-gold': { label: 'GOLD', face: ['#fff4c7', '#f0c75c', '#b07a1c', '#ffe39b', '#c6902c'], ink: '#4a2c04', hi: 'rgba(255,248,214,.9)', lo: 'rgba(80,45,0,.45)', edge: '#8a5a10' },
  'club-platinum': { label: 'PLATINUM', face: ['#fdfeff', '#dde5f0', '#a9b6ca', '#f1f5fa', '#c0cbdb'], ink: '#1b2638', hi: 'rgba(255,255,255,.95)', lo: 'rgba(20,40,80,.35)', edge: '#7d8ba3' },
  'club-black': { label: 'BLACK', face: ['#34343c', '#16161a', '#050506', '#1d1d22', '#0b0b0d'], ink: '#e9c56b', hi: 'rgba(255,230,160,.55)', lo: 'rgba(0,0,0,.8)', edge: '#c9a24a' },
  'club-infinite': { label: 'INFINITE', face: ['#1c0f3a', '#0a0618', '#020108', '#160b30', '#06030f'], ink: '#ffffff', hi: 'rgba(255,255,255,.7)', lo: 'rgba(0,0,0,.8)', edge: '#b9a6ff' },
};

const lookOf = (id: string) => LOOKS[id] ?? LOOKS['club-silver'];

/* ------------------------------------------------------------------ Badge */

/** The little card next to a member's name (about one line of text tall). */
export function ClubBadge({ id }: { id: string }) {
  const u = `cb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const L = lookOf(id);
  const item = cosmeticById(id);
  const infinite = id === 'club-infinite';
  return (
    <svg className={clsx('club-badge', id)} viewBox="0 0 30 20" role="img" aria-label={`Stackd Club ${item?.name ?? ''}`} focusable="false">
      <defs>
        <linearGradient id={`${u}f`} x1="0" y1="0" x2="1" y2="1">
          {L.face.map((c, i) => (
            <stop key={i} offset={i / (L.face.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`${u}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2b8" />
          <stop offset=".5" stopColor="#d9a43a" />
          <stop offset="1" stopColor="#8f5d12" />
        </linearGradient>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${u}k`}>
          <rect x=".5" y=".5" width="29" height="19" rx="3.4" />
        </clipPath>
        {infinite && <PrismDefs u={u} />}
      </defs>
      <g clipPath={`url(#${u}k)`}>
        <rect width="30" height="20" fill={`url(#${u}f)`} />
        {infinite && <rect className="club-prism" width="30" height="20" fill={`url(#${u}p)`} opacity=".55" />}
        {id === 'club-black' && <path d="M0 15 L30 9 L30 11 L0 17 Z" fill={L.ink} opacity=".5" />}
        {id === 'club-silver' && [4, 7, 10, 13, 16].map((y) => <line key={y} x1="0" x2="30" y1={y} y2={y} stroke="#fff" strokeOpacity=".35" strokeWidth=".4" />)}
        <rect x="3.2" y="6.4" width="7.2" height="5.6" rx="1.2" fill={`url(#${u}c)`} stroke="rgba(0,0,0,.35)" strokeWidth=".35" />
        <path d="M3.2 9.2H10.4M6.8 6.4V12" stroke="rgba(90,55,5,.55)" strokeWidth=".35" />
        {id === 'club-platinum' && <path d="M24 5 L27 9 L24 14 L21 9 Z" fill="#3f7dff" stroke="#c9dcff" strokeWidth=".5" />}
        {id === 'club-gold' && <circle cx="24" cy="10" r="3.6" fill="none" stroke={L.ink} strokeOpacity=".55" strokeWidth=".8" />}
        {(id === 'club-black' || infinite) && (
          <path d="M24 5.2 L25.2 8.6 L28.6 9.2 L25.2 10.2 L24 14 L22.8 10.2 L19.4 9.2 L22.8 8.6 Z" fill={L.ink} opacity=".95" />
        )}
        {id === 'club-silver' && <text x="24" y="12.6" textAnchor="middle" fontSize="7.5" fontWeight="900" fill={L.ink} opacity=".7" fontFamily="'Outfit Variable', Outfit, sans-serif">S</text>}
        <rect className="club-sheen" x="-14" y="-4" width="10" height="28" fill={`url(#${u}s)`} transform="skewX(-20)" />
      </g>
      <rect x=".5" y=".5" width="29" height="19" rx="3.4" fill="none" stroke={L.edge} strokeOpacity=".9" strokeWidth=".8" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Full card */

const pad = (n: number) => String(n).padStart(4, '0');

/** A lemniscate (∞) watermark for the Infinite card, centred on the card. */
const INFINITY = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const d = 1 + Math.sin(t) ** 2;
    pts.push(`${(170 + (64 * Math.cos(t)) / d).toFixed(1)} ${(112 + (64 * Math.sin(t) * Math.cos(t)) / d).toFixed(1)}`);
  }
  return `M${pts.join(' L')}Z`;
})();

/** Shared defs for the Infinite card's prismatic foil (rendered once per card). */
function PrismDefs({ u }: { u: string }) {
  return (
    <linearGradient id={`${u}p`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#ff4fd8" />
      <stop offset=".2" stopColor="#7a5cff" />
      <stop offset=".4" stopColor="#3fd7ff" />
      <stop offset=".6" stopColor="#5dffb0" />
      <stop offset=".8" stopColor="#ffe45c" />
      <stop offset="1" stopColor="#ff6a3d" />
    </linearGradient>
  );
}

/**
 * The full membership card. Tilts towards the pointer with a moving holographic
 * shine; the Infinite card's foil shifts colour on its own as well.
 */
export function ClubCard({
  id,
  holder,
  number,
  since,
  className,
  interactive = true,
}: {
  id: string;
  holder: string;
  /** Member number for this card (1 = first ever), if known. */
  number?: number | null;
  /** When the card was bought (ISO), for "member since". */
  since?: string | null;
  className?: string;
  interactive?: boolean;
}) {
  const u = `cc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const L = lookOf(id);
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, mx: 50, my: 50, on: false });
  const infinite = id === 'club-infinite';
  const black = id === 'club-black';
  const dark = black || infinite;
  const sinceText = since ? new Date(since).toLocaleDateString('en-US', { month: '2-digit', year: '2-digit' }) : '--/--';
  const font = "'Outfit Variable', Outfit, system-ui, sans-serif";
  const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

  const move = (e: React.PointerEvent) => {
    if (!interactive || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (0.5 - py) * 14, y: (px - 0.5) * 18, mx: px * 100, my: py * 100, on: true });
  };

  const emboss = (x: number, y: number, text: string, size: number, opts: { anchor?: 'start' | 'end' | 'middle'; family?: string; weight?: number; spacing?: number; fill?: string } = {}) => (
    <g fontFamily={opts.family ?? font} fontWeight={opts.weight ?? 700} fontSize={size} letterSpacing={opts.spacing ?? 1.5} textAnchor={opts.anchor ?? 'start'}>
      <text x={x + 0.7} y={y + 0.9} fill={L.lo}>
        {text}
      </text>
      <text x={x - 0.4} y={y - 0.5} fill={L.hi}>
        {text}
      </text>
      <text x={x} y={y} fill={opts.fill ?? L.ink}>
        {text}
      </text>
    </g>
  );

  return (
    <div
      ref={ref}
      className={clsx('club-card', id, tilt.on && 'is-tilting', className)}
      onPointerMove={move}
      onPointerLeave={() => setTilt({ x: 0, y: 0, mx: 50, my: 50, on: false })}
      style={
        {
          '--rx': `${tilt.x}deg`,
          '--ry': `${tilt.y}deg`,
          '--mx': `${tilt.mx}%`,
          '--my': `${tilt.my}%`,
        } as React.CSSProperties
      }
    >
      <div className="club-card__inner">
        <svg viewBox="0 0 340 214" className="club-card__svg" role="img" aria-label={`Stackd Club ${cosmeticById(id)?.name ?? ''} for ${holder}`}>
          <defs>
            <linearGradient id={`${u}f`} x1="0" y1="0" x2="1" y2="1">
              {L.face.map((c, i) => (
                <stop key={i} offset={i / (L.face.length - 1)} stopColor={c} />
              ))}
            </linearGradient>
            <linearGradient id={`${u}c`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff4c2" />
              <stop offset=".35" stopColor="#e2b04a" />
              <stop offset=".7" stopColor="#9a6514" />
              <stop offset="1" stopColor="#f3d27a" />
            </linearGradient>
            <PrismDefs u={u} />
            <radialGradient id={`${u}g`} cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#fff" stopOpacity=".9" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <pattern id={`${u}carbon`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#0b0b0e" />
              <rect width="3" height="3" fill="#18181d" />
              <rect x="3" y="3" width="3" height="3" fill="#18181d" />
            </pattern>
            <clipPath id={`${u}k`}>
              <rect width="340" height="214" rx="16" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${u}k)`}>
            <rect width="340" height="214" fill={`url(#${u}f)`} />
            {/* Finish */}
            {id === 'club-silver' &&
              Array.from({ length: 54 }, (_, i) => <line key={i} x1="0" x2="340" y1={i * 4 + 1} y2={i * 4 + 1} stroke="#fff" strokeOpacity={i % 3 ? 0.18 : 0.32} strokeWidth=".6" />)}
            {id === 'club-gold' &&
              Array.from({ length: 16 }, (_, i) => (
                <ellipse key={i} cx="270" cy="60" rx={20 + i * 11} ry={12 + i * 7} fill="none" stroke="#fff6d0" strokeOpacity=".22" strokeWidth=".7" transform={`rotate(${i * 4} 270 60)`} />
              ))}
            {id === 'club-platinum' &&
              Array.from({ length: 22 }, (_, i) => (
                <path key={i} d={`M-10 ${20 + i * 9} C 80 ${i * 9} 160 ${40 + i * 9} 350 ${10 + i * 9}`} fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth=".6" />
              ))}
            {black && (
              <>
                <rect width="340" height="214" fill={`url(#${u}carbon)`} opacity=".85" />
                <rect width="340" height="214" fill={`url(#${u}f)`} opacity=".55" />
                <path d="M0 170 L340 112 L340 118 L0 176 Z" fill={L.ink} opacity=".55" />
              </>
            )}
            {infinite && (
              <g className="club-card__prism">
                <rect width="340" height="214" fill={`url(#${u}p)`} opacity=".26" style={{ mixBlendMode: 'screen' }} />
                {Array.from({ length: 40 }, (_, i) => {
                  const x = (i * 97) % 340;
                  const y = (i * 53) % 214;
                  return <circle key={i} className="club-card__star" style={{ animationDelay: `${(i % 7) * 0.4}s` }} cx={x} cy={y} r={i % 5 === 0 ? 1.3 : 0.7} fill="#fff" />;
                })}
                <path d={INFINITY} fill="none" stroke={`url(#${u}p)`} strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" />
                <path d={INFINITY} fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1" />
              </g>
            )}

            {/* Wordmark and tier */}
            {emboss(26, 42, 'STACKD', 22, { weight: 900, spacing: 3 })}
            {emboss(28, 58, 'CLUB', 9, { weight: 700, spacing: 6 })}
            {emboss(314, 42, L.label, 13, { anchor: 'end', weight: 800, spacing: 3, fill: infinite ? `url(#${u}p)` : undefined })}

            {/* Chip and contactless */}
            <g transform="translate(28 82)">
              <rect width="44" height="34" rx="6" fill={`url(#${u}c)`} stroke="rgba(70,40,0,.5)" strokeWidth="1" />
              <path d="M0 12H14M0 22H14M30 12H44M30 22H44M14 0V34M30 0V34M14 17H30" stroke="rgba(90,55,5,.55)" strokeWidth="1" fill="none" />
            </g>
            <g transform="translate(86 99)" fill="none" stroke={L.ink} strokeOpacity=".6" strokeWidth="2" strokeLinecap="round">
              <path d="M0 -6 A8 8 0 0 1 0 6" />
              <path d="M5 -10 A13 13 0 0 1 5 10" />
              <path d="M10 -14 A18 18 0 0 1 10 14" />
            </g>

            {/* Emblem */}
            <g transform="translate(286 104)">
              <circle r="24" fill={dark ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.25)'} stroke={infinite ? `url(#${u}p)` : L.ink} strokeOpacity=".7" strokeWidth="1.5" />
              <circle r="18" fill="none" stroke={infinite ? `url(#${u}p)` : L.ink} strokeOpacity=".35" strokeWidth="1" />
              <path d="M0 -14 L3.6 -4.2 L14 -3.6 L5.8 2.6 L8.6 12.6 L0 6.8 L-8.6 12.6 L-5.8 2.6 L-14 -3.6 L-3.6 -4.2 Z" fill={infinite ? `url(#${u}p)` : L.ink} opacity=".9" />
            </g>

            {/* Member number, holder and date */}
            {emboss(28, 150, number ? `No. ${pad(number)}` : 'No. ----', 17, { family: mono, weight: 700, spacing: 3 })}
            {emboss(28, 186, holder.toUpperCase().slice(0, 20), 14, { weight: 700, spacing: 2 })}
            {emboss(314, 172, 'MEMBER SINCE', 6.5, { anchor: 'end', weight: 700, spacing: 1.5 })}
            {emboss(314, 187, sinceText, 12, { anchor: 'end', family: mono, weight: 700, spacing: 1.5 })}
          </g>
          <rect x=".75" y=".75" width="338.5" height="212.5" rx="15.5" fill="none" stroke={L.edge} strokeOpacity=".8" strokeWidth="1.5" />
        </svg>
        <span className="club-card__shine" aria-hidden />
        <span className="club-card__glare" aria-hidden />
      </div>
    </div>
  );
}

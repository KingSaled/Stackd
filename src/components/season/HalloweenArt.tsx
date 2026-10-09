import { useId, type ReactNode } from 'react';

/**
 * Vector art for the Halloween look: crisp at any size and coloured in code,
 * so the season ships with no image files.
 */

/** A carved jack-o'-lantern with a candle glowing inside. */
export function JackOLantern({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const ribs: [number, number, number][] = [
    [34, 26, 37],
    [86, 26, 37],
    [47, 24, 40],
    [73, 24, 40],
    [60, 22, 42],
  ];
  return (
    <svg className={className} viewBox="0 0 120 112" aria-hidden>
      <defs>
        <linearGradient id={`${id}skin`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb347" />
          <stop offset="0.55" stopColor="#f57c12" />
          <stop offset="1" stopColor="#b84906" />
        </linearGradient>
        <radialGradient id={`${id}rim`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#4a1500" stopOpacity="0.55" />
        </radialGradient>
        <radialGradient id={`${id}fire`} cx="60" cy="70" r="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff4b8" />
          <stop offset="0.45" stopColor="#ffc233" />
          <stop offset="0.8" stopColor="#ff8a00" />
          <stop offset="1" stopColor="#e05a00" />
        </radialGradient>
        <linearGradient id={`${id}stem`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6b7a33" />
          <stop offset="1" stopColor="#3b4716" />
        </linearGradient>
        <filter id={`${id}blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <ellipse cx="60" cy="104" rx="44" ry="6" fill="#000" opacity="0.35" />
      <path d="M57 26 C55 16 58 9 63 4 C66 2 69 4 67 7 C63 12 63 19 65 26 Z" fill={`url(#${id}stem)`} />
      <path d="M64 12 C72 6 80 9 79 15" fill="none" stroke="#56662a" strokeWidth="2.2" strokeLinecap="round" />
      {ribs.map(([cx, rx, ry], i) => (
        <ellipse key={i} cx={cx} cy="64" rx={rx} ry={ry} fill={`url(#${id}skin)`} stroke="#a8430a" strokeWidth="1.4" />
      ))}
      <ellipse cx="60" cy="64" rx="58" ry="42" fill={`url(#${id}rim)`} />
      <path d="M44 34 C40 46 40 70 45 92 M76 34 C80 46 80 70 75 92" fill="none" stroke="#ffd08a" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round" />
      <g className="hw-flicker">
        <g filter={`url(#${id}blur)`} opacity="0.85">
          <path d="M32 54 L46 42 L50 58 Z M88 54 L74 42 L70 58 Z M56 66 L60 58 L64 66 Z M30 74 Q60 98 90 74 L82 76 L78 84 L72 78 L66 87 L60 80 L54 87 L48 78 L42 84 L38 76 Z" fill="#ffb21e" />
        </g>
        {/* The carved rim (darker, a little below) shows the depth of the cut. */}
        <path d="M32 54 L46 42 L50 58 Z M88 54 L74 42 L70 58 Z M56 66 L60 58 L64 66 Z M30 74 Q60 98 90 74 L82 76 L78 84 L72 78 L66 87 L60 80 L54 87 L48 78 L42 84 L38 76 Z" fill="#6b2400" stroke="#5a1d00" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M32 54 L46 42 L50 58 Z M88 54 L74 42 L70 58 Z M56 66 L60 58 L64 66 Z M30 74 Q60 98 90 74 L82 76 L78 84 L72 78 L66 87 L60 80 L54 87 L48 78 L42 84 L38 76 Z" transform="translate(60 66) scale(0.9) translate(-60 -64)" fill={`url(#${id}fire)`} />
      </g>
    </svg>
  );
}

/** A bat silhouette (wings flap with the `hw-flap` class). */
export function Bat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 28" aria-hidden>
      <path
        className="hw-wings"
        d="M32 9 L34.5 5.5 L35.5 10.5 C40 8 48 4 62 5 C58 9 57 12 56 15 C53 12 50 12 48 16 C45 13 42 14 40 18 C38 16 36 17 34 21 L32 24 L30 21 C28 17 26 16 24 18 C22 14 19 13 16 16 C14 12 11 12 8 15 C7 12 6 9 2 5 C16 4 24 8 28.5 10.5 L29.5 5.5 Z"
      />
    </svg>
  );
}

/** A small, friendly ghost. */
export function Ghost({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 60 72" aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9cff5" />
        </linearGradient>
      </defs>
      <path
        d="M30 3 C14 3 6 16 6 32 L6 62 C10 58 13 58 16 63 C19 68 23 68 25 62 C27 57 33 57 35 62 C37 68 41 68 44 63 C47 58 50 58 54 62 L54 32 C54 16 46 3 30 3 Z"
        fill={`url(#${id}g)`}
        opacity="0.92"
      />
      <ellipse cx="22" cy="30" rx="4" ry="5.5" fill="#2a1840" />
      <ellipse cx="38" cy="30" rx="4" ry="5.5" fill="#2a1840" />
      <ellipse cx="30" cy="43" rx="4" ry="4.5" fill="#2a1840" />
      <ellipse cx="17" cy="38" rx="3.5" ry="2" fill="#ff9ab0" opacity="0.6" />
      <ellipse cx="43" cy="38" rx="3.5" ry="2" fill="#ff9ab0" opacity="0.6" />
    </svg>
  );
}

/** An autumn leaf for the slow leaf fall. */
export function Leaf({ className, color }: { className?: string; color: string }) {
  return (
    <svg className={className} viewBox="0 0 24 26" aria-hidden>
      <path
        d="M12 1 L14 6 L18 4 L17 9 L22 9 L18.5 13 L20.5 17 L14.5 15.2 L13 20.5 L12 22 L11 20.5 L9.5 15.2 L3.5 17 L5.5 13 L2 9 L7 9 L6 4 L10 6 Z"
        fill={color}
      />
      <path d="M12 6 L12 25" stroke="#4a2306" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/**
 * A prop pinned to a spot on the hills. The hills stretch to any screen width, but each prop
 * keeps its shape and scales with the skyline's height only, so it is never squashed or cut off.
 * `at` and `w` are in the 1440 x 200 design space.
 */
function Prop({ at, w, children }: { at: number; w: number; children: ReactNode }) {
  return (
    <svg x={`${(at / 1440) * 100}%`} y="0" width="100%" height="100%" viewBox={`${at} 0 ${w} 200`} preserveAspectRatio="xMinYMax meet" overflow="visible">
      {children}
    </svg>
  );
}

/** Rolling hills with a fenced graveyard, a bare tree and a haunted house with its lights on. */
export function HauntedSkyline({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const tomb = (x: number, y: number, kind: 'round' | 'cross') =>
    kind === 'cross' ? (
      <path key={x} d={`M${x - 3} ${y} L${x - 3} ${y - 20} L${x - 10} ${y - 20} L${x - 10} ${y - 26} L${x - 3} ${y - 26} L${x - 3} ${y - 33} L${x + 3} ${y - 33} L${x + 3} ${y - 26} L${x + 10} ${y - 26} L${x + 10} ${y - 20} L${x + 3} ${y - 20} L${x + 3} ${y} Z`} />
    ) : (
      <path key={x} d={`M${x - 11} ${y} L${x - 11} ${y - 20} A11 11 0 0 1 ${x + 11} ${y - 20} L${x + 11} ${y} Z`} />
    );
  // Graveyard fence: pickets between two stone gate posts, sunk into the hill.
  const pickets = Array.from({ length: 15 }, (_, i) => 214 + i * 11);
  return (
    <svg className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}far`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24143f" />
          <stop offset="1" stopColor="#140a24" />
        </linearGradient>
        <radialGradient id={`${id}win`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffcf6b" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff8a1c" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Far hill (flat-topped around the house) */}
      <svg width="100%" height="100%" viewBox="0 0 1440 200" preserveAspectRatio="none">
        <path d="M0 128 C200 92 380 112 560 104 C760 94 900 82 1000 84 L1180 84 C1280 86 1360 100 1440 98 L1440 200 L0 200 Z" fill={`url(#${id}far)`} />
      </svg>
      {/* Haunted house sitting on the far hill */}
      <Prop at={1040} w={110}>
        <g fill="#170c29">
          <path d="M1050 90 L1050 46 L1090 22 L1130 46 L1130 90 Z" />
          <path d="M1120 90 L1120 30 L1132 10 L1144 30 L1144 90 Z" />
          <path d="M1086 26 L1086 12 L1094 12 L1094 22 Z" />
          <path d="M1046 48 L1090 20 L1134 48 L1130 50 L1090 26 L1050 50 Z" fill="#1d1033" />
          <path d="M1084 90 L1084 74 A6 6 0 0 1 1096 74 L1096 90 Z" fill="#0f0820" />
        </g>
        <g className="hw-windows">
          <circle cx="1071" cy="60" r="16" fill={`url(#${id}win)`} />
          <circle cx="1132" cy="40" r="12" fill={`url(#${id}win)`} />
          <rect x="1066" y="54" width="10" height="12" rx="1" fill="#ffb347" />
          <rect x="1104" y="54" width="10" height="12" rx="1" fill="#ff9a2e" opacity="0.85" />
          <rect x="1128" y="34" width="8" height="10" rx="4" fill="#ffc46b" />
        </g>
      </Prop>
      {/* Near hill */}
      <svg width="100%" height="100%" viewBox="0 0 1440 200" preserveAspectRatio="none">
        <path d="M0 158 C180 134 320 146 470 142 C640 138 760 158 940 154 C1120 150 1260 136 1440 146 L1440 200 L0 200 Z" fill="#0c0716" />
      </svg>
      {/* Bare tree */}
      <Prop at={60} w={110}>
        <g stroke="#0c0716" strokeLinecap="round" fill="none">
          <path d="M120 170 C118 120 124 96 116 70" strokeWidth="9" />
          <path d="M118 104 C100 92 92 80 78 74" strokeWidth="5" />
          <path d="M120 92 C136 80 146 70 162 66" strokeWidth="5" />
          <path d="M116 74 C110 60 112 50 104 40" strokeWidth="4" />
          <path d="M117 76 C126 62 132 56 140 46" strokeWidth="3.5" />
          <path d="M84 77 C80 70 72 68 66 62" strokeWidth="2.5" />
          <path d="M150 69 C156 60 160 58 168 56" strokeWidth="2.5" />
          <path d="M106 44 C100 38 94 38 90 32" strokeWidth="2" />
        </g>
      </Prop>
      {/* Fenced graveyard */}
      <Prop at={200} w={190}>
        <g fill="#0c0716">
          {tomb(244, 146, 'round')}
          {tomb(282, 143, 'cross')}
          {tomb(318, 146, 'round')}
          {tomb(352, 144, 'cross')}
          {pickets.map((x) => (
            <path key={x} d={`M${x - 1.6} 170 L${x - 1.6} 129 L${x} 124 L${x + 1.6} 129 L${x + 1.6} 170 Z`} />
          ))}
          <rect x="204" y="131" width="174" height="2.4" />
          <rect x="204" y="139" width="174" height="2.4" />
          <path d="M200 170 L200 122 L198 122 L198 118 L210 118 L210 122 L208 122 L208 170 Z" />
          <circle cx="204" cy="115" r="3.4" />
          <path d="M374 170 L374 122 L372 122 L372 118 L384 118 L384 122 L382 122 L382 170 Z" />
          <circle cx="378" cy="115" r="3.4" />
        </g>
      </Prop>
      {/* Two more graves down the hill */}
      <Prop at={730} w={70}>
        <g fill="#0c0716">
          {tomb(745, 160, 'cross')}
          {tomb(784, 160, 'round')}
        </g>
      </Prop>
      {/* Pumpkins glowing on the hillside */}
      <Prop at={970} w={60}>
        <g className="hw-windows">
          <circle cx="990" cy="150" r="14" fill={`url(#${id}win)`} />
          <ellipse cx="990" cy="152" rx="8" ry="6" fill="#e8730f" />
          <circle cx="1012" cy="153" r="11" fill={`url(#${id}win)`} />
          <ellipse cx="1012" cy="154" rx="6" ry="4.5" fill="#d9620b" />
        </g>
      </Prop>
    </svg>
  );
}

/** A witch's hat, drawn for the logo (exported as a CSS image in halloween.css too). */
export function WitchHat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 56" aria-hidden>
      <ellipse cx="32" cy="46" rx="30" ry="8" fill="#2b1745" />
      <path d="M14 45 C20 30 24 16 30 6 C33 1 40 2 46 8 C42 7 38 8 37 12 C40 24 46 34 50 45 Z" fill="#3d2163" />
      <path d="M15.5 42 C26 45 38 45 49 42 L47.5 37 C37 40 27 40 17.5 37 Z" fill="#ff9a2e" />
      <rect x="28" y="36.5" width="8" height="7" rx="1.2" fill="none" stroke="#ffd36b" strokeWidth="1.8" />
    </svg>
  );
}

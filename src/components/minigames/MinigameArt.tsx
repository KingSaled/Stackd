import { useId } from 'react';
import type { MinigameId } from '../../../shared/minigames';

/**
 * Small badge art for each minigame (menus, lobby tiles, page headers). Colours come from
 * CSS custom properties on .mg-art so the seasonal look can recolour them.
 */
export function MinigameArt({ id, size = 40 }: { id: MinigameId; size?: number }) {
  // Gradient ids are unique per badge so a hidden copy elsewhere on the page can't break this one.
  const u = useId().replace(/:/g, '');
  const bg = `mg-bg-${id}-${u}`;
  const gold = `mg-gold-${id}-${u}`;
  return (
    <svg className={`mg-art mg-art--${id}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--mg-bg-a)" />
          <stop offset="1" stopColor="var(--mg-bg-b)" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="0.5" stopColor="#f5c451" />
          <stop offset="1" stopColor="#b8892a" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="13" fill={`url(#${bg})`} />
      <rect x="1.5" y="1.5" width="45" height="45" rx="12.5" fill="none" stroke="rgba(255,255,255,0.14)" />
      {id === 'crash' && (
        <>
          <path d="M8 38 L8 10 M8 38 L40 38" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
          <path d="M9 36 C 20 35, 28 30, 36 13" fill="none" stroke="var(--mg-accent)" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M9 36 C 20 35, 28 30, 36 13 L36 38 L9 38 Z" fill="var(--mg-accent)" opacity="0.18" />
          <g transform="translate(36 13) rotate(35)">
            <path d="M0 -7 C 3 -4, 3.5 1, 2.5 5 L-2.5 5 C -3.5 1, -3 -4, 0 -7 Z" fill="#fff" />
            <circle cx="0" cy="-1" r="1.4" fill="var(--mg-accent)" />
            <path d="M-2 6 L0 10 L2 6 Z" fill="#ffb347" />
          </g>
        </>
      )}
      {id === 'coinflip' && (
        <>
          <ellipse cx="24" cy="27" rx="13" ry="13" fill="#7a5410" />
          <circle cx="24" cy="24" r="13" fill={`url(#${gold})`} />
          <circle cx="24" cy="24" r="10" fill="none" stroke="#9b6d14" strokeWidth="1.4" strokeDasharray="2 2" />
          <text x="24" y="29" textAnchor="middle" fontFamily="Outfit, sans-serif" fontWeight="900" fontSize="14" fill="#7a5410">
            S
          </text>
        </>
      )}
      {id === 'roulette' && (
        <g transform="translate(24 24)">
          {Array.from({ length: 15 }, (_, i) => {
            const a0 = (i / 15) * Math.PI * 2 - Math.PI / 2;
            const a1 = ((i + 1) / 15) * Math.PI * 2 - Math.PI / 2;
            const r = 16;
            const fill = i === 0 ? 'var(--rl-green)' : i % 2 ? 'var(--rl-red)' : 'var(--rl-black)';
            return (
              <path
                key={i}
                d={`M0 0 L${Math.cos(a0) * r} ${Math.sin(a0) * r} A${r} ${r} 0 0 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r} Z`}
                fill={fill}
                stroke="rgba(0,0,0,0.35)"
                strokeWidth="0.5"
              />
            );
          })}
          <circle r="16.5" fill="none" stroke={`url(#${gold})`} strokeWidth="2.2" />
          <circle r="6" fill={`url(#${gold})`} />
          <circle r="2.2" fill="#7a5410" />
        </g>
      )}
      {id === 'cases' && (
        // A small copy of the case on the Case Opening page: crate, lid, gold straps and lock.
        <>
          <ellipse cx="24" cy="39.5" rx="15" ry="2" fill="rgba(0,0,0,0.4)" />
          <rect x="8" y="19" width="32" height="19" rx="3" fill="var(--mg-case-a)" />
          <rect x="8" y="19" width="32" height="19" rx="3" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
          <rect x="6.5" y="13.5" width="35" height="8" rx="2.5" fill="var(--mg-case-b)" />
          <rect x="6.5" y="13.5" width="35" height="8" rx="2.5" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" />
          <rect x="10.5" y="13.5" width="3" height="24.5" rx="0.8" fill={`url(#${gold})`} />
          <rect x="34.5" y="13.5" width="3" height="24.5" rx="0.8" fill={`url(#${gold})`} />
          <rect x="20" y="19" width="8" height="7" rx="1.5" fill={`url(#${gold})`} />
          <circle cx="24" cy="21.8" r="1.1" fill="#5a3d08" />
          <rect x="23.5" y="22.3" width="1" height="2.2" rx="0.5" fill="#5a3d08" />
          <path d="M40 8 l0.9 2.4 2.4 0.9 -2.4 0.9 -0.9 2.4 -0.9 -2.4 -2.4 -0.9 2.4 -0.9 Z" fill="#ffe9a8" />
        </>
      )}
    </svg>
  );
}

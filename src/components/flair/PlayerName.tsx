import { useId } from 'react';
import clsx from 'clsx';
import { clubCard, nameStyleClass } from '../../../shared/cosmetics';
import { ClubBadge } from './ClubCard';

/** Styles animated letter by letter (old-school MMO waves). */
const PER_LETTER = new Set(['name-wave', 'name-rainbow', 'name-sovereign']);
/** Styles whose letters are filled with a gradient (--nfx-fill in flair.css). */
const FILLED = new Set([
  'name-gold',
  'name-glacier',
  'name-ember',
  'name-chrome',
  'name-vapor',
  'name-molten',
  'name-hellfire',
  'name-frostbite',
  'name-galaxy',
  'name-holo',
  'name-divine',
]);

/** A little jewelled crown that sits on Sovereign names. */
function CrownMark() {
  const g = `nc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className="nfx-crown" viewBox="0 0 24 16" aria-hidden focusable="false">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset=".45" stopColor="#ffd34d" />
          <stop offset="1" stopColor="#b5761a" />
        </linearGradient>
      </defs>
      <path d="M2 14 L1 4 L7 9 L12 1 L17 9 L23 4 L22 14 Z" fill={`url(#${g})`} stroke="#6b4206" strokeWidth=".8" strokeLinejoin="round" />
      <circle cx="12" cy="9.6" r="1.9" fill="#ff2d55" stroke="#7a0a1e" strokeWidth=".4" />
      <circle cx="6.4" cy="11" r="1.2" fill="#3ec8ff" />
      <circle cx="17.6" cy="11" r="1.2" fill="#3ec8ff" />
      <circle cx="1" cy="4" r="1.1" fill="#fff3c4" />
      <circle cx="12" cy="1" r="1.2" fill="#fff3c4" />
      <circle cx="23" cy="4" r="1.1" fill="#fff3c4" />
    </svg>
  );
}

/**
 * A player's display name in their equipped name style, with their Stackd Club
 * badge. Unknown or missing styles fall back to plain text (in `color` if given).
 */
export function PlayerName({
  name,
  fx,
  club,
  color,
  className,
  badge = true,
}: {
  name: string;
  fx?: string | null;
  club?: string | null;
  color?: string;
  className?: string;
  /** Show the Stackd Club badge (off where space is very tight). */
  badge?: boolean;
}) {
  const style = nameStyleClass(fx);
  const card = badge ? clubCard(club) : null;
  const text = style && PER_LETTER.has(style)
    ? Array.from(name).map((ch, i) => (
        <i key={i} style={{ '--i': i } as React.CSSProperties}>
          {ch === ' ' ? ' ' : ch}
        </i>
      ))
    : name;
  return (
    <span className={clsx('pname', className)} title={card ? `${name} · Stackd Club ${card.name}` : undefined}>
      {style ? (
        <span className={clsx('nfx', style, FILLED.has(style) && 'nfx--fill')}>
          {style === 'name-sovereign' && <CrownMark />}
          <span className="nfx__t">{text}</span>
        </span>
      ) : (
        <span className="pname__text" style={color ? { color } : undefined}>
          {name}
        </span>
      )}
      {card && <ClubBadge id={card.id} />}
    </span>
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import clsx from 'clsx';
import { useSeason } from '../../lib/season';
import { Bat, HauntedSkyline, Leaf } from './HalloweenArt';

/**
 * Seasonal scenery painted behind the whole app (a fixed layer under #root,
 * so it never takes clicks or covers the game): a moonlit sky with bats,
 * drifting fog, falling leaves and a haunted skyline. Tables get a quieter
 * version so nothing competes with the cards.
 */
const LEAVES = [
  { x: 4, size: 20, dur: 21, delay: -2, color: '#ff8a1c', sway: 46 },
  { x: 15, size: 15, dur: 26, delay: -15, color: '#c2410c', sway: -38 },
  { x: 27, size: 18, dur: 23, delay: -9, color: '#b5651d', sway: 52 },
  { x: 41, size: 13, dur: 30, delay: -22, color: '#ffb347', sway: -30 },
  { x: 56, size: 19, dur: 24, delay: -5, color: '#d9480f', sway: 40 },
  { x: 68, size: 14, dur: 28, delay: -17, color: '#ff8a1c', sway: -44 },
  { x: 79, size: 21, dur: 22, delay: -11, color: '#a8551a', sway: 36 },
  { x: 90, size: 16, dur: 27, delay: -24, color: '#f59e0b', sway: -50 },
];

const BATS = [
  { top: 14, size: 38, dur: 27, delay: -6, rev: false },
  { top: 24, size: 24, dur: 35, delay: -21, rev: true },
  { top: 9, size: 18, dur: 44, delay: -33, rev: false },
  { top: 31, size: 28, dur: 39, delay: -12, rev: true },
];

export function SeasonDecor() {
  const season = useSeason((s) => s.season);
  const [location] = useLocation();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (season !== 'halloween') return;
    const el = document.createElement('div');
    el.className = 'season-layer';
    el.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(el, document.body.firstChild);
    setHost(el);
    return () => {
      el.remove();
      setHost(null);
    };
  }, [season]);

  if (season !== 'halloween' || !host) return null;
  const atTable = location.startsWith('/t/') || location.startsWith('/dev');

  return createPortal(
    <div className={clsx('hw-scene', atTable && 'hw-scene--table')}>
      <div className="hw-stars" />
      <div className="hw-stars hw-stars--b" />
      <div className="hw-moon" />
      {BATS.map((b, i) => (
        <div
          key={i}
          className={clsx('hw-bat', b.rev && 'hw-bat--rev')}
          style={{ '--top': `${b.top}vh`, '--size': `${b.size}px`, '--dur': `${b.dur}s`, '--delay': `${b.delay}s` } as React.CSSProperties}
        >
          <Bat />
        </div>
      ))}
      {LEAVES.map((l, i) => (
        <div
          key={i}
          className="hw-leaf"
          style={{ '--x': `${l.x}vw`, '--size': `${l.size}px`, '--dur': `${l.dur}s`, '--delay': `${l.delay}s`, '--sway': `${l.sway}px` } as React.CSSProperties}
        >
          <Leaf color={l.color} />
        </div>
      ))}
      {!atTable && <HauntedSkyline className="hw-skyline" />}
      <div className="hw-fog" />
      <div className="hw-fog hw-fog--front" />
    </div>,
    host,
  );
}

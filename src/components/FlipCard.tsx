import { useEffect, useState } from 'react';
import { PlayingCard } from './PlayingCard';

interface Props {
  card: string | null;
  /** Delay before flipping face-up (ms). 0 shows the face immediately on mount. */
  revealDelay?: number;
  size?: 'board' | 'seat' | 'hero' | 'mini';
  highlight?: boolean;
  dim?: boolean;
}

/** A card that lands face-down and flips over after `revealDelay`. */
export function FlipCard({ card, revealDelay = 0, size, highlight, dim }: Props) {
  const [up, setUp] = useState(() => !!card && revealDelay <= 0);
  useEffect(() => {
    if (!card) {
      setUp(false);
      return;
    }
    if (revealDelay <= 0) {
      // Defer one frame so a newly revealed card visibly flips.
      const raf = requestAnimationFrame(() => setUp(true));
      return () => cancelAnimationFrame(raf);
    }
    const id = window.setTimeout(() => setUp(true), revealDelay);
    return () => clearTimeout(id);
  }, [card, revealDelay]);
  return <PlayingCard card={card} faceUp={up} size={size} highlight={highlight} dim={dim} />;
}

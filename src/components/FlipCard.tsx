import { useEffect, useRef, useState } from 'react';
import { PlayingCard } from './PlayingCard';

interface Props {
  card: string | null;
  /** Delay before flipping face-up (ms). 0 shows the face immediately on mount. */
  revealDelay?: number;
  size?: 'board' | 'seat' | 'hero' | 'mini';
  highlight?: boolean;
  dim?: boolean;
}

/** A card that lands face-down, then lifts off the felt and turns over after `revealDelay`. */
export function FlipCard({ card, revealDelay = 0, size, highlight, dim }: Props) {
  const [up, setUp] = useState(() => !!card && revealDelay <= 0);
  const [flipping, setFlipping] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    if (!card) {
      setUp(false);
      return;
    }
    const turn = () => {
      setUp((was) => {
        if (!was) {
          setFlipping(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setFlipping(false), 650);
        }
        return true;
      });
    };
    if (revealDelay <= 0) {
      // Defer one frame so a newly revealed card visibly flips.
      const raf = requestAnimationFrame(turn);
      return () => cancelAnimationFrame(raf);
    }
    const id = window.setTimeout(turn, revealDelay);
    return () => clearTimeout(id);
  }, [card, revealDelay]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <PlayingCard
      card={card}
      faceUp={up}
      size={size}
      highlight={highlight}
      dim={dim}
      className={flipping ? 'is-flipping' : undefined}
    />
  );
}

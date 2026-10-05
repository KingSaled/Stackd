import clsx from 'clsx';
import { rankLabel } from '../../shared/poker/cards';
import { useSettings } from '../store/settings';

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

interface Props {
  card?: string | null;
  faceUp?: boolean;
  size?: 'board' | 'seat' | 'hero' | 'mini';
  highlight?: boolean;
  dim?: boolean;
  className?: string;
}

/** A playing card with a 3D flip between back and face. */
export function PlayingCard({ card, faceUp = true, size = 'board', highlight, dim, className }: Props) {
  const fourColor = useSettings((s) => s.fourColor);
  const show = Boolean(faceUp && card);
  const suit = card?.[1] ?? 's';
  return (
    <div
      className={clsx(
        'pcard',
        `pcard--${size}`,
        highlight && 'is-highlight',
        dim && 'is-dim',
        className,
      )}
      aria-label={show && card ? `${rankLabel(card)} of ${{ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }[suit]}` : 'Card'}
    >
      <div className={clsx('pcard__inner', show && 'is-up')}>
        <div className={clsx('pcard__face pcard__front', `suit-${suit}`, fourColor && 'four-color')}>
          {card && (
            <>
              <span className="pcard__corner">
                <span className="pcard__rank">{rankLabel(card)}</span>
                <span className="pcard__suit">{SUIT_GLYPH[suit]}</span>
              </span>
              <span className="pcard__pip">{SUIT_GLYPH[suit]}</span>
            </>
          )}
        </div>
        <div className="pcard__face pcard__back">
          <span className="pcard__logo">S</span>
        </div>
      </div>
    </div>
  );
}

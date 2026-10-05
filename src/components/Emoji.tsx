import clsx from 'clsx';
import { AVATARS, REACTIONS } from '../../shared/economy';

/**
 * Emoji rendered from bundled Fluent Emoji images (public/emoji) so every
 * device shows the same picture — native emoji fonts differ a lot between
 * iOS, Android and Windows. Unknown emoji fall back to the native glyph.
 */
const BUNDLED = new Set([...AVATARS, ...REACTIONS].map(strip));

function strip(s: string) {
  return s.replace(/️/g, '');
}

export function emojiSrc(char: string): string | null {
  const c = strip(char);
  if (!BUNDLED.has(c)) return null;
  const code = [...c].map((ch) => ch.codePointAt(0)!.toString(16)).join('-');
  return `/emoji/${code}.webp`;
}

export function Emoji({ char, className, label }: { char: string; className?: string; label?: string }) {
  const src = emojiSrc(char);
  if (!src) {
    return (
      <span className={clsx('emoji emoji--text', className)} role="img" aria-label={label ?? char}>
        {char}
      </span>
    );
  }
  return (
    <img
      className={clsx('emoji', className)}
      src={src}
      alt={label ?? char}
      draggable={false}
      decoding="async"
      loading="eager"
    />
  );
}

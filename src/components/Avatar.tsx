import clsx from 'clsx';
import { PORTRAIT_SHIFT, portraitOf } from '../../shared/portraits';
import { backdropClass, frameClass } from '../../shared/cosmetics';
import { FrameArt } from './cosmetics/FrameArt';
import { BackdropArt } from './cosmetics/BackdropArt';

interface PortraitProps {
  avatar: string;
  frame?: string | null;
  backdrop?: string | null;
}

/**
 * The layered picture inside any avatar circle: backdrop, pixel-art portrait
 * and (if equipped) a Cosmetic Shop frame. Fills its positioned parent.
 */
export function Portrait({ avatar, frame, backdrop }: PortraitProps) {
  const f = frameClass(frame);
  const b = backdropClass(backdrop);
  const id = portraitOf(avatar);
  const shift = PORTRAIT_SHIFT[id] ?? 0;
  return (
    <>
      <span className="portrait">
        <span className={clsx('portrait__bg', b ?? 'bg-default')} aria-hidden>
          {b && <BackdropArt id={b} />}
        </span>
        <img
          className="portrait__img"
          src={`/portraits/${id}.png`}
          alt=""
          draggable={false}
          decoding="async"
          style={shift ? ({ '--dx': shift } as React.CSSProperties) : undefined}
        />
      </span>
      {f && (
        <span className={clsx('portrait__frame', f)} aria-hidden>
          <FrameArt id={f} />
        </span>
      )}
    </>
  );
}

export function Avatar({
  avatar,
  color,
  frame,
  backdrop,
  size = 40,
  className,
  children,
}: PortraitProps & {
  color: string;
  size?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={clsx('avatar', frameClass(frame) && 'avatar--framed', className)}
      style={{ '--c': color, '--s': `${size}px`, width: size, height: size } as React.CSSProperties}
    >
      <Portrait avatar={avatar} frame={frame} backdrop={backdrop} />
      {children}
    </span>
  );
}

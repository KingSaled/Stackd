import clsx from 'clsx';
import { portraitSrc } from '../../shared/portraits';
import { backdropClass, frameClass } from '../../shared/cosmetics';

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
  return (
    <>
      <span className="portrait">
        <span className={clsx('portrait__bg', b ?? 'bg-default')} aria-hidden />
        <img className="portrait__img" src={portraitSrc(avatar)} alt="" draggable={false} decoding="async" />
      </span>
      {f && <span className={clsx('portrait__frame', f)} aria-hidden />}
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

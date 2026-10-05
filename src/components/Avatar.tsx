import clsx from 'clsx';

export function Avatar({
  emoji,
  color,
  size = 40,
  className,
  children,
}: {
  emoji: string;
  color: string;
  size?: number | string;
  className?: string;
  children?: React.ReactNode;
}) {
  const s = typeof size === 'number' ? `${size}px` : size;
  const fontSize = typeof size === 'number' ? `${Math.round(size * 0.56)}px` : `calc(${size} * 0.56)`;
  return (
    <span className={clsx('avatar', className)} style={{ '--c': color, width: s, height: s, fontSize } as React.CSSProperties}>
      <span className="avatar__emoji">{emoji}</span>
      {children}
    </span>
  );
}

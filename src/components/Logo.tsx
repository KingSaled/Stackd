import clsx from 'clsx';

export function Logo({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={clsx('logo', `logo--${size}`, className)}>
      <span className="logo__mark" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span className="logo__word">
        Stack<em>d</em>
      </span>
    </span>
  );
}

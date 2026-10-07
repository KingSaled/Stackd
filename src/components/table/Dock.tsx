import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * The bar pinned under the table. It keeps one height in every state
 * (watching, waiting, your turn, betting) so the table above never resizes:
 * a main row for the buttons and a slim row underneath for details.
 * `mode` names the state; when it changes the main row fades in place.
 */
export function Dock({ mode, turn, className, main, sub }: { mode: string; turn?: boolean; className?: string; main: ReactNode; sub?: ReactNode }) {
  return (
    <div className={clsx('actionbar', turn && 'actionbar--turn', className)}>
      <div key={mode} className="dock__main">
        {main}
      </div>
      <div className="dock__sub">{sub}</div>
    </div>
  );
}

/** Same footprint as a dock, for while the table is still loading. */
export function DockPlaceholder({ className }: { className?: string }) {
  return <div className={clsx('actionbar', className)} aria-hidden />;
}

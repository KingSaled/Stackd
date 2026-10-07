import { Suspense, lazy } from 'react';
import type { IconWeight } from '@phosphor-icons/react';

// The achievement/changelog icon set is loaded on demand so it stays out of the first download.
const IconByName = lazy(() => import('./IconSet'));

/** A Phosphor icon referenced by name (see IconSet.tsx for the registered names). */
export function NamedIcon({ name, size = 20, weight = 'duotone' }: { name: string; size?: number; weight?: IconWeight }) {
  return (
    <Suspense fallback={<span style={{ display: 'inline-block', width: size, height: size }} />}>
      <IconByName name={name} size={size} weight={weight} />
    </Suspense>
  );
}

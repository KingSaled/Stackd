import clsx from 'clsx';
import { chipsShort } from '../lib/format';

export const DENOMINATIONS: { value: number; color: string; edge: string }[] = [
  { value: 1_000_000, color: '#c9a227', edge: '#fff4c2' },
  { value: 100_000, color: '#e0559c', edge: '#ffe0f0' },
  { value: 25_000, color: '#22b8d8', edge: '#e0f8ff' },
  { value: 5_000, color: '#f07a2a', edge: '#ffe8d6' },
  { value: 1_000, color: '#e8b923', edge: '#fff6d6' },
  { value: 500, color: '#7c5cf0', edge: '#ece6ff' },
  { value: 100, color: '#22252e', edge: '#d9dce6' },
  { value: 25, color: '#21a35f', edge: '#e2fff0' },
  { value: 5, color: '#d93a45', edge: '#ffe3e5' },
  { value: 1, color: '#e9eaf0', edge: '#5b6070' },
];

/** Break an amount into a short, visually pleasing column of chips (largest first). */
export function chipBreakdown(amount: number, max = 6): { color: string; edge: string }[] {
  const out: { color: string; edge: string }[] = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const d of DENOMINATIONS) {
    while (rest >= d.value && out.length < max) {
      out.push({ color: d.color, edge: d.edge });
      rest -= d.value;
    }
    if (out.length >= max) break;
  }
  return out.reverse(); // biggest chip on top
}

export function Chip({ color, edge, className, style }: { color: string; edge: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={clsx('chip', className)}
      style={{ '--chip': color, '--chip-edge': edge, ...style } as React.CSSProperties}
    />
  );
}

export function ChipStack({
  amount,
  label = true,
  max = 6,
  className,
}: {
  amount: number;
  label?: boolean;
  max?: number;
  className?: string;
}) {
  const chips = chipBreakdown(amount, max);
  return (
    <span className={clsx('chipstack', className)}>
      <span className="chipstack__chips" style={{ '--n': chips.length } as React.CSSProperties}>
        {chips.map((c, i) => (
          <Chip key={i} color={c.color} edge={c.edge} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </span>
      {label && <span className="chipstack__label">{chipsShort(amount)}</span>}
    </span>
  );
}

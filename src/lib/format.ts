export function chips(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString('en-US');
}

/** Compact chip amounts for tight spaces: 950, 1.2K, 12.5K, 1.25M. */
export function chipsShort(n: number | null | undefined): string {
  const v = Math.round(n ?? 0);
  const abs = Math.abs(v);
  if (abs < 10_000) return v.toLocaleString('en-US');
  if (abs < 1_000_000) return `${trim(v / 1000, abs < 100_000 ? 1 : 0)}K`;
  if (abs < 1_000_000_000) return `${trim(v / 1_000_000, 2)}M`;
  return `${trim(v / 1_000_000_000, 2)}B`;
}

function trim(n: number, digits: number) {
  return n.toFixed(digits).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1');
}

export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function timeAgo(iso: string | number): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function blindsLabel(sb: number, bb: number) {
  return `${chipsShort(sb)}/${chipsShort(bb)}`;
}

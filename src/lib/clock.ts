import { supabase } from './supabase';

/**
 * Server clock estimate. Turn deadlines are server timestamps, so every
 * countdown is computed against serverNow() rather than the device clock.
 */
let offset = 0;
let bestRtt = Number.POSITIVE_INFINITY;
let lastSyncAt = 0;

export function serverNow(): number {
  return Date.now() + offset;
}

/** Feed a server timestamp observed during a request that took `rtt` ms. */
export function sampleClock(serverTime: number, sentAt: number, receivedAt: number) {
  const rtt = receivedAt - sentAt;
  if (!Number.isFinite(serverTime) || rtt < 0 || rtt > 10_000) return;
  // Prefer low-latency samples; allow occasional re-anchoring as clocks drift.
  const stale = Date.now() - lastSyncAt > 5 * 60_000;
  if (rtt <= bestRtt * 1.5 || stale) {
    offset = serverTime - (sentAt + rtt / 2);
    bestRtt = Math.min(bestRtt, rtt);
    lastSyncAt = Date.now();
  }
}

export async function syncClock() {
  if (!supabase) return;
  for (let i = 0; i < 3; i++) {
    const sentAt = Date.now();
    const { data, error } = await supabase.rpc('server_time');
    const receivedAt = Date.now();
    if (!error && data != null) sampleClock(Number(data), sentAt, receivedAt);
  }
}

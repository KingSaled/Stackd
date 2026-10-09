import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { deviceId } from '../lib/device';
import { chips } from '../lib/format';
import { sound } from '../lib/sound';
import { toast } from './toast';
import { useAuth } from './auth';
import { CHALLENGE_BY_ID, isClaimable, isComplete, type ChallengePeriod, type ChallengeSlot, type ChallengeStatus } from '../../shared/challenges';

interface Row {
  id: string;
  period: ChallengePeriod;
  slot: ChallengeSlot;
  target: number | string;
  reward: number | string;
  progress: number | string;
  claimed: boolean;
  period_key: string;
  ends_at: string;
  daily_cap?: number | string | null;
  today?: number | string | null;
}

const fromRow = (r: Row): ChallengeStatus => ({
  id: r.id,
  period: r.period,
  slot: r.slot,
  target: Number(r.target),
  reward: Number(r.reward),
  progress: Number(r.progress),
  claimed: !!r.claimed,
  periodKey: r.period_key,
  endsAt: r.ends_at,
  dailyCap: r.daily_cap == null ? null : Number(r.daily_cap),
  today: Number(r.today ?? 0),
});

/** The row Realtime sends when a challenge's progress changes. */
export interface ProgressRow {
  challenge_id: string;
  period_key: string;
  progress: number | string;
  claimed_at: string | null;
  day_key?: string | null;
  day_progress?: number | string | null;
}

interface ChallengeState {
  /** The challenges in play (null until the first load). */
  items: ChallengeStatus[] | null;
  /** The database hasn't been upgraded for challenges yet: the app hides them. */
  unavailable: boolean;
  /** Id of the challenge being claimed right now. */
  claiming: string | null;
  refresh(): Promise<void>;
  claim(id: string): Promise<void>;
  patch(row: ProgressRow): void;
  reset(): void;
}

let loading: Promise<void> | null = null;

export const useChallenges = create<ChallengeState>((set, get) => ({
  items: null,
  unavailable: false,
  claiming: null,

  refresh() {
    // Several callers (mount, focus, rollover timer) share one request.
    loading ??= (async () => {
      try {
        const { data, error } = await supabase.rpc('my_challenges');
        if (error) {
          // The function doesn't exist until schema.sql has been re-run.
          if (error.code === 'PGRST202' || /could not find|does not exist/i.test(error.message)) set({ unavailable: true, items: [] });
          return;
        }
        const items = ((data as Row[] | null) ?? []).map(fromRow).filter((c) => CHALLENGE_BY_ID.has(c.id));
        set({ items, unavailable: false });
      } finally {
        loading = null;
      }
    })();
    return loading;
  },

  patch(row) {
    const items = get().items;
    const known = items?.find((c) => c.id === row.challenge_id && c.periodKey === row.period_key);
    // A challenge we don't know about: a new day or week has started.
    if (!items || !known) {
      void get().refresh();
      return;
    }
    const progress = Number(row.progress);
    const claimed = !!row.claimed_at;
    // Today's share of a daily-capped challenge (the row's day matches today's daily challenges).
    const dayKey = items.find((c) => c.period === 'daily')?.periodKey;
    const today = row.day_key != null && row.day_key === dayKey ? Number(row.day_progress ?? 0) : known.today;
    if (progress === known.progress && claimed === known.claimed && today === known.today) return;
    const done = isComplete({ progress, target: known.target });
    set({ items: items.map((c) => (c === known ? { ...c, progress, claimed, today } : c)) });
    if (done && !isComplete(known)) announceDone(known.id, known.slot === 'bonus');
  },

  async claim(id) {
    if (get().claiming) return;
    const item = get().items?.find((c) => c.id === id);
    if (!item || !isClaimable(item)) return;
    set({ claiming: id });
    try {
      let res = await supabase.rpc('claim_challenge', { p_id: id, p_device: deviceId() });
      if (res.error?.code === 'PGRST202') res = await supabase.rpc('claim_challenge', { p_id: id });
      if (res.error) throw res.error;
      const r = res.data as { ok: boolean; reason?: string; amount?: number; chips?: number };
      if (r.ok) {
        useAuth.getState().patchProfile({ chips: Number(r.chips) });
        sound.play('bonus');
        toast.success(`${CHALLENGE_BY_ID.get(id)?.name ?? 'Challenge'}: +${chips(r.amount)} chips`);
        set({ items: get().items?.map((c) => (c.id === id ? { ...c, claimed: true } : c)) ?? null });
      } else if (r.reason === 'device_limit') {
        toast.info('This device has already collected challenge rewards on 2 accounts today. Try again tomorrow.');
      } else if (r.reason === 'expired') {
        toast.info('That challenge has ended');
      }
      // Claiming moves the bonus challenge along, and any refusal means our copy is stale.
      await get().refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Could not claim that reward');
    } finally {
      set({ claiming: null });
    }
  },

  reset() {
    loading = null;
    set({ items: null, unavailable: false, claiming: null });
  },
}));

function announceDone(id: string, bonus: boolean) {
  const c = CHALLENGE_BY_ID.get(id);
  if (!c) return;
  sound.play('bonus');
  toast.success(bonus ? `${c.name} unlocked: collect your bonus in Challenges` : `Challenge complete: ${c.name}. Collect it in Challenges!`);
}

/** Rewards ready to collect. */
export const selectClaimable = (s: ChallengeState) => (s.items ?? []).filter(isClaimable).length;

/** Challenges of one period in display order (poker, blackjack, any game, bonus). */
export function inPeriod(items: ChallengeStatus[] | null, period: ChallengePeriod): ChallengeStatus[] {
  const order = ['poker', 'blackjack', 'any', 'bonus'];
  return (items ?? []).filter((c) => c.period === period).sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
}

/** When the earliest challenge in play ends (server time), or null before loading. */
export function nextRollover(items: ChallengeStatus[] | null): number | null {
  const ends = (items ?? []).map((c) => Date.parse(c.endsAt)).filter((t) => Number.isFinite(t));
  return ends.length ? Math.min(...ends) : null;
}

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { sound } from '../lib/sound';
import { chips } from '../lib/format';
import { ECONOMY, dailyBonusFor } from '../../shared/economy';
import { useLocalNow } from './useNow';
import { deviceId } from '../lib/device';

const HOUR = 3_600_000;

/** Bonus RPCs take the device id; fall back to the old signature if the database isn't upgraded yet. */
async function withDevice(fn: 'claim_daily_bonus' | 'emergency_reload') {
  const res = await supabase.rpc(fn, { p_device: deviceId() });
  if (res.error?.code === 'PGRST202') return supabase.rpc(fn);
  return res;
}

const DEVICE_LIMIT = 'This device has already collected that bonus on 2 accounts today. Try again tomorrow.';

export function useEconomy() {
  const profile = useAuth((s) => s.profile);
  const seated = useAuth((s) => s.seatedChips);
  const patchProfile = useAuth((s) => s.patchProfile);
  const refreshSeated = useAuth((s) => s.refreshSeated);
  const now = useLocalNow(1000);
  const [busy, setBusy] = useState(false);

  const lastDaily = profile?.last_daily_claim ? Date.parse(profile.last_daily_claim) : 0;
  const nextDailyAt = lastDaily ? lastDaily + ECONOMY.dailyCooldownHours * HOUR : 0;
  const dailyReady = !!profile && now >= nextDailyAt;
  const streakContinues = lastDaily && now - lastDaily < 48 * HOUR;
  const nextStreak = streakContinues ? Math.min((profile?.daily_streak ?? 0) + 1, ECONOMY.dailyBonusMaxStreak) : 1;
  const dailyAmount = dailyBonusFor(nextStreak);

  const total = (profile?.chips ?? 0) + seated;
  const broke = !!profile && total < ECONOMY.reloadThreshold;
  const lastReload = profile?.last_reload_at ? Date.parse(profile.last_reload_at) : 0;
  const nextReloadAt = lastReload ? lastReload + ECONOMY.reloadCooldownMinutes * 60_000 : 0;
  const reloadReady = broke && now >= nextReloadAt;

  async function claimDaily() {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await withDevice('claim_daily_bonus');
      if (error) throw error;
      const r = data as { ok: boolean; reason?: string; amount?: number; chips: number; streak?: number; next_claim_at?: string };
      if (r.ok) {
        patchProfile({ chips: Number(r.chips), last_daily_claim: new Date().toISOString(), daily_streak: r.streak ?? 1 });
        sound.play('bonus');
        toast.success(`Daily bonus: +${chips(r.amount)} chips${(r.streak ?? 1) > 1 ? ` · ${r.streak}-day streak!` : ''}`);
      } else if (r.reason === 'device_limit') {
        toast.info(DEVICE_LIMIT);
      } else {
        toast.info('Your next daily bonus is not ready yet');
      }
    } catch (e) {
      toast.error((e as Error).message || 'Could not claim the bonus');
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    if (busy) return;
    setBusy(true);
    try {
      await refreshSeated();
      const { data, error } = await withDevice('emergency_reload');
      if (error) throw error;
      const r = data as { ok: boolean; reason?: string; amount?: number; chips: number };
      if (r.ok) {
        patchProfile({ chips: Number(r.chips), last_reload_at: new Date().toISOString() });
        sound.play('bonus');
        toast.success(`Emergency reload: +${chips(r.amount)} chips. Good luck!`);
      } else if (r.reason === 'not_broke') {
        toast.info(`Reloads are for players under ${chips(ECONOMY.reloadThreshold)} chips (including chips at tables)`);
      } else if (r.reason === 'device_limit') {
        toast.info(DEVICE_LIMIT);
      } else {
        toast.info('Reload is cooling down');
      }
    } catch (e) {
      toast.error((e as Error).message || 'Reload failed');
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    now,
    dailyReady,
    nextDailyAt,
    dailyAmount,
    nextStreak,
    broke,
    total,
    reloadReady,
    nextReloadAt,
    claimDaily,
    reload,
  };
}

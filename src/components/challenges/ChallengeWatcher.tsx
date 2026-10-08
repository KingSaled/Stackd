import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { serverNow } from '../../lib/clock';
import { nextRollover, useChallenges, type ProgressRow } from '../../store/challenges';

/**
 * Keeps the player's challenges current wherever they are: loads them at
 * sign-in, follows progress live (Realtime), and reloads when a new day or week
 * starts or the tab comes back to the front.
 */
export function ChallengeWatcher({ userId }: { userId: string }) {
  useEffect(() => {
    const { refresh, patch, reset } = useChallenges.getState();
    reset();
    void refresh();
    const channel = supabase
      .channel(`challenges:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenge_progress', filter: `user_id=eq.${userId}` },
        (payload) => payload.new && patch(payload.new as ProgressRow),
      )
      .subscribe();
    // New challenges appear at the rollover (08:00 UTC); check every 30 seconds.
    const timer = window.setInterval(() => {
      const end = nextRollover(useChallenges.getState().items);
      if (end != null && serverNow() >= end) void useChallenges.getState().refresh();
    }, 30_000);
    const onVisible = () => document.visibilityState === 'visible' && void useChallenges.getState().refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId]);
  return null;
}

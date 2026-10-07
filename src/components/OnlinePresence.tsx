import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useOnline } from '../store/online';

/**
 * Counts players online: every signed-in tab joins one Realtime presence
 * channel (keyed by player, so several tabs count once). Mounted for the
 * whole app, so players at tables count too.
 */
export function OnlinePresence({ userId }: { userId: string }) {
  useEffect(() => {
    let channel: RealtimeChannel | null = supabase.channel('online', { config: { presence: { key: userId } } });
    channel
      .on('presence', { event: 'sync' }, () => {
        if (channel) useOnline.setState({ count: Object.keys(channel.presenceState()).length });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel?.track({ at: Date.now() });
      });
    return () => {
      const c = channel;
      channel = null;
      if (c) void supabase.removeChannel(c);
      useOnline.setState({ count: null });
    };
  }, [userId]);
  return null;
}

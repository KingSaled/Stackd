import { create } from 'zustand';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { syncClock } from '../lib/clock';

export interface Profile {
  id: string;
  display_name: string;
  avatar: string;
  color: string;
  chips: number;
  hands_played: number;
  hands_won: number;
  biggest_pot: number;
  best_hand: number;
  daily_streak: number;
  last_daily_claim: string | null;
  last_reload_at: string | null;
  reload_count: number;
  is_guest: boolean;
  created_at: string;
}

interface AuthState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Chips currently sitting on tables (for broke checks). */
  seatedChips: number;
  init(): void;
  refreshProfile(): Promise<void>;
  refreshSeated(): Promise<void>;
  patchProfile(patch: Partial<Profile>): void;
  signOut(): Promise<void>;
}

let channel: RealtimeChannel | null = null;
let initialized = false;

function normalize(p: Record<string, unknown>): Profile {
  return {
    ...(p as unknown as Profile),
    chips: Number(p.chips ?? 0),
    biggest_pot: Number(p.biggest_pot ?? 0),
  };
}

export const useAuth = create<AuthState>((set, get) => ({
  ready: false,
  session: null,
  profile: null,
  seatedChips: 0,

  init() {
    if (initialized || !supabase) return;
    initialized = true;
    void syncClock();

    const onSession = async (session: Session | null) => {
      const prevUser = get().session?.user.id;
      set({ session });
      if (!session) {
        if (channel) void supabase.removeChannel(channel);
        channel = null;
        set({ profile: null, ready: true, seatedChips: 0 });
        return;
      }
      if (prevUser !== session.user.id || !get().profile) {
        await get().refreshProfile();
        void get().refreshSeated();
        if (channel) void supabase.removeChannel(channel);
        channel = supabase
          .channel(`profile:${session.user.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
            (payload) => {
              if (payload.new) set({ profile: normalize(payload.new as Record<string, unknown>) });
            },
          )
          .subscribe();
      }
      set({ ready: true });
    };

    supabase.auth.getSession().then(({ data }) => onSession(data.session));
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      // Defer to avoid calling Supabase inside the auth callback (deadlock-safe).
      setTimeout(() => void onSession(session), 0);
    });
  },

  async refreshProfile() {
    const uid = get().session?.user.id;
    if (!uid) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (data) {
        set({ profile: normalize(data) });
        return;
      }
      // The profile row is created by a trigger right after sign-up; give it a moment.
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  },

  async refreshSeated() {
    const { data } = await supabase.rpc('my_tables');
    const total = ((data as { stack: number }[] | null) ?? []).reduce((a, r) => a + Number(r.stack), 0);
    set({ seatedChips: total });
  },

  patchProfile(patch) {
    const p = get().profile;
    if (p) set({ profile: { ...p, ...patch } });
  },

  async signOut() {
    await supabase.auth.signOut();
  },
}));

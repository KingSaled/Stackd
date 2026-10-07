import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { supabase } from '../lib/supabase';
import { sound } from '../lib/sound';
import { chips } from '../lib/format';
import { ACHIEVEMENT_BY_ID, type Achievement } from '../../shared/achievements';
import { NamedIcon } from './AchievementIcon';

interface Pop {
  key: number;
  a: Achievement;
}

let seq = 0;

/** Listens for newly unlocked achievements and celebrates them, wherever the player is. */
export function AchievementWatcher() {
  const uid = useAuth((s) => s.session?.user.id);
  const [pops, setPops] = useState<Pop[]>([]);

  const celebrate = (id: string) => {
    const a = ACHIEVEMENT_BY_ID.get(id);
    if (!a) return;
    const key = ++seq;
    sound.play('bonus');
    setPops((p) => [...p.slice(-2), { key, a }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.key !== key)), 5200);
  };

  // Dev builds: window.__achievement('win_royal') previews the pop-up.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __achievement?: (id: string) => void }).__achievement = celebrate;
  });

  useEffect(() => {
    if (!uid || !supabase) return;
    const channel = supabase
      .channel(`achievements:${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'player_achievements', filter: `user_id=eq.${uid}` },
        (payload) => celebrate(String((payload.new as { achievement_id?: string }).achievement_id)),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="achv-pops" aria-live="polite">
      <AnimatePresence>
        {pops.map(({ key, a }) => (
          <motion.div
            key={key}
            className={`achv-pop tier-${a.tier}`}
            layout
            initial={{ y: -40, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onClick={() => setPops((p) => p.filter((x) => x.key !== key))}
          >
            <span className="achv-pop__icon">
              <NamedIcon name={a.icon} size={26} weight="fill" />
            </span>
            <span className="achv-pop__text">
              <small>Achievement unlocked</small>
              <strong>{a.name}</strong>
            </span>
            {a.reward > 0 && <span className="achv-pop__reward">+{chips(a.reward)}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

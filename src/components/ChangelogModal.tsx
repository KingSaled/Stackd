import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Modal } from './Modal';
import { NamedIcon } from './AchievementIcon';
import { LATEST_CHANGELOG, unseenEntries, type ChangelogEntry } from '../changelog';
import { useAuth } from '../store/auth';
import { supabase } from '../lib/supabase';
import { readJSON, writeJSON } from '../lib/storage';

const localKey = (uid: string) => `stackd:changelog:${uid}`;

/**
 * Shows the release notes a player has missed, once. "Seen" is stored on the
 * account (so it follows them across devices) with a local fallback.
 * Releases from before an account was created are skipped.
 */
export function ChangelogModal() {
  const profile = useAuth((s) => s.profile);
  const patchProfile = useAuth((s) => s.patchProfile);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const latest = LATEST_CHANGELOG;

  useEffect(() => {
    if (!profile || !latest) return;
    const seenOnAccount = profile.last_seen_changelog ?? null;
    const seenLocally = readJSON<string | null>(localKey(profile.id), null);
    const lastSeen = [seenOnAccount, seenLocally].filter((v): v is string => !!v).sort().pop() ?? null;
    if (lastSeen && lastSeen >= latest.version) return;
    const missed = unseenEntries(lastSeen, profile.created_at);
    // Players who joined after these releases have nothing to catch up on.
    if (missed.length === 0) {
      void markSeen(profile.id);
      return;
    }
    setEntries(missed);
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markSeen(uid: string) {
    writeJSON(localKey(uid), latest.version);
    patchProfile({ last_seen_changelog: latest.version });
    await supabase.rpc('mark_changelog_seen', { p_version: latest.version }).then(
      () => undefined,
      () => undefined,
    );
  }

  const close = () => {
    setOpen(false);
    if (profile) void markSeen(profile.id);
  };

  if (!latest) return null;
  let row = 0;
  return (
    <Modal open={open} onClose={close} title={<span className="changelog__title">What's new in Stackd</span>}>
      <div className="changelog">
        {entries.map((entry, n) => (
          <section key={entry.version} className="changelog__entry">
            {n > 0 && <span className="changelog__earlier">Earlier</span>}
            <div className="changelog__head">
              <strong>{entry.title}</strong>
              <span className="muted small">{entry.date}</span>
            </div>
            <ul className="changelog__list">
              {entry.items.map((it, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + Math.min(row++, 10) * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="changelog__icon">
                    <NamedIcon name={it.icon} size={18} />
                  </span>
                  <span>{it.text}</span>
                </motion.li>
              ))}
            </ul>
          </section>
        ))}
        <button className="btn btn--gold btn--block changelog__ok" onClick={close}>
          Let's play
        </button>
      </div>
    </Modal>
  );
}

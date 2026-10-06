import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Modal } from './Modal';
import { Emoji } from './Emoji';
import { LATEST_CHANGELOG } from '../changelog';
import { useAuth } from '../store/auth';
import { supabase } from '../lib/supabase';
import { readJSON, writeJSON } from '../lib/storage';

const localKey = (uid: string) => `stackd:changelog:${uid}`;

/**
 * Shows the newest release notes once per player. "Seen" is stored on the
 * account (so it follows them across devices) with a local fallback.
 * Accounts created after the release never see it.
 */
export function ChangelogModal() {
  const profile = useAuth((s) => s.profile);
  const patchProfile = useAuth((s) => s.patchProfile);
  const [open, setOpen] = useState(false);
  const entry = LATEST_CHANGELOG;

  useEffect(() => {
    if (!profile || !entry) return;
    const seenOnAccount = profile.last_seen_changelog;
    const seenLocally = readJSON<string | null>(localKey(profile.id), null);
    if (seenOnAccount === entry.version || seenLocally === entry.version) return;
    // Players who joined after this release have nothing to catch up on.
    if (Date.parse(profile.created_at) > Date.parse(`${entry.version}T23:59:59Z`)) {
      void markSeen(profile.id);
      return;
    }
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markSeen(uid: string) {
    writeJSON(localKey(uid), entry.version);
    patchProfile({ last_seen_changelog: entry.version });
    await supabase.rpc('mark_changelog_seen', { p_version: entry.version }).then(
      () => undefined,
      () => undefined,
    );
  }

  const close = () => {
    setOpen(false);
    if (profile) void markSeen(profile.id);
  };

  if (!entry) return null;
  return (
    <Modal open={open} onClose={close} title={<span className="changelog__title">What's new in Stackd</span>}>
      <div className="changelog">
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
              transition={{ delay: 0.08 + i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="changelog__icon">
                <Emoji char={it.icon} />
              </span>
              <span>{it.text}</span>
            </motion.li>
          ))}
        </ul>
        <button className="btn btn--gold btn--block" onClick={close}>
          Let's play
        </button>
      </div>
    </Modal>
  );
}

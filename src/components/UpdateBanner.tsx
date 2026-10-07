import { AnimatePresence, motion } from 'framer-motion';
import { ArrowsClockwiseIcon, SparkleIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 3 * 60 * 1000;

/**
 * Tells players with the game already open that a new version was deployed.
 * Never reloads on its own (nobody is pulled out of a hand); they refresh when ready.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stop = false;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!stop && build && build !== __BUILD_ID__) setReady(true);
      } catch {
        /* offline: try again later */
      }
    };
    const id = window.setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    void check();
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <AnimatePresence>
      {ready && !hidden && (
        <motion.div
          className="update-banner"
          role="status"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        >
          <SparkleIcon size={16} />
          <span>
            <strong>A new version of Stackd is ready.</strong> Refresh when you're between hands — your seat and chips are safe.
          </span>
          <button className="btn btn--gold btn--sm" onClick={() => window.location.reload()}>
            <ArrowsClockwiseIcon size={14} /> Refresh
          </button>
          <button className="link-btn" onClick={() => setHidden(true)}>
            Later
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheckIcon } from '@phosphor-icons/react';
import { useAuth } from '../store/auth';
import { acceptTerms, clearPendingAcceptance, pendingAcceptance } from '../lib/terms';
import { MIN_AGE, TERMS_VERSION } from '../legal';

/**
 * Asks every signed-in player, once per Terms version, to confirm they are 18+
 * and accept the Terms and Privacy Policy. Existing accounts keep everything;
 * they just confirm on their next visit.
 */
export function TermsGate() {
  const profile = useAuth((s) => s.profile);
  const patchProfile = useAuth((s) => s.patchProfile);
  const signOut = useAuth((s) => s.signOut);
  const [location, navigate] = useLocation();
  const [age, setAge] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Only databases with the terms column can record acceptance.
  const needed = !!profile && 'terms_version' in profile && profile.terms_version !== TERMS_VERSION;

  const [auto, setAuto] = useState(pendingAcceptance);

  // Ticked on the sign-in screen just now: record it without asking again.
  useEffect(() => {
    if (!needed || !auto) return;
    void acceptTerms().then((r) => {
      if (r.ok) patchProfile({ terms_version: TERMS_VERSION });
      else {
        clearPendingAcceptance();
        setAuto(false);
      }
    });
  }, [needed, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reading = location === '/terms' || location === '/privacy';
  const open = needed && !auto && !reading;

  const confirm = async () => {
    setBusy(true);
    setError('');
    const r = await acceptTerms();
    setBusy(false);
    if (r.ok) patchProfile({ terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() });
    else setError(r.message ?? 'Something went wrong — please try again');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop terms-gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-title"
            className="modal terms-gate__card"
            initial={{ y: 30, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="terms-gate__icon">
              <ShieldCheckIcon size={30} weight="duotone" />
            </div>
            <h2 id="terms-title">Before you play</h2>
            <p className="muted">
              Stackd is a free poker game played with <strong>virtual chips that have no cash value</strong>. Chips can't be
              bought with real money or cashed out, and no real-money gambling takes place.
            </p>
            <label className="check">
              <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
              <span>I am {MIN_AGE} years of age or older.</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I agree to the{' '}
                <Link href="/terms" className="terms-gate__link">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="terms-gate__link">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn--gold btn--block btn--lg" disabled={!age || !agree || busy} onClick={confirm}>
              {busy ? 'One moment…' : 'Agree and continue'}
            </button>
            <button
              className="link-btn"
              onClick={async () => {
                await signOut();
                navigate('/auth');
              }}
            >
              Not now — sign out
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { UserIcon, EnvelopeSimpleIcon, KeyIcon, SparkleIcon, EyeIcon, EyeSlashIcon, ArrowLeftIcon, CoinsIcon, UsersIcon, DeviceMobileIcon } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { Logo } from '../components/Logo';
import { PlayingCard } from '../components/PlayingCard';
import { sound } from '../lib/sound';
import { chips } from '../lib/format';
import { ECONOMY } from '../../shared/economy';
import { LegalFooter } from '../components/LegalFooter';
import { rememberTermsAccepted } from '../lib/terms';
import { MIN_AGE } from '../legal';
import { useSeason } from '../lib/season';
import { Bat, JackOLantern } from '../components/season/HalloweenArt';

type Mode = 'signin' | 'signup' | 'guest' | 'forgot';

const TABS: { mode: Mode; label: string }[] = [
  { mode: 'signin', label: 'Sign in' },
  { mode: 'signup', label: 'Sign up' },
  { mode: 'guest', label: 'Guest' },
];

const HEADINGS: Record<Mode, { title: string; sub: string }> = {
  signin: { title: 'Welcome back', sub: 'Sign in to pick up where you left off.' },
  signup: { title: 'Create your account', sub: `${chips(ECONOMY.startingChips)} free chips and a spot on the leaderboard.` },
  guest: { title: 'Jump straight in', sub: 'No sign-up needed. You can save your account with an email later.' },
  forgot: { title: 'Reset your password', sub: "We'll email you a link to choose a new one." },
};

/** Desktop gets the cursor in the first field; phones keep the keyboard closed until tapped. */
const finePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export function AuthPage() {
  const session = useAuth((s) => s.session);
  const search = useSearch();
  const next = safeNext(new URLSearchParams(search).get('next'));
  const [, navigate] = useLocation();
  const invited = next.startsWith('/t/');
  const [mode, setMode] = useState<Mode>(invited ? 'guest' : 'signin');
  const [showPassword, setShowPassword] = useState(false);
  const [adult, setAdult] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setError('');
    setNotice('');
  }, [mode]);

  // Once signed in (here or in another tab), continue to where the user was headed.
  useEffect(() => {
    if (!session) return;
    // A hard navigation keeps the #key fragment of password-protected invite links.
    if (next.includes('#')) window.location.replace(next);
    else navigate(next, { replace: true });
  }, [session, next, navigate]);

  const halloween = useSeason((s) => s.season) === 'halloween';

  if (session) return null;

  const go = () => sound.play('chips', { count: 5 });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        go();
      } else if (mode === 'signup') {
        if (!adult) throw new Error(`Please confirm you are ${MIN_AGE} or older and accept the Terms to create an account.`);
        rememberTermsAccepted();
        const display = name.trim();
        if (display.length < 2 || display.length > 20) throw new Error('Pick a display name of 2-20 characters');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: display }, emailRedirectTo: `${window.location.origin}${next}` },
        });
        if (error) throw error;
        if (data.session) go();
        else setNotice('Check your inbox to confirm your email, then sign in.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset`,
        });
        if (error) throw error;
        setNotice('If that email has an account, a reset link is on its way.');
      }
    } catch (err) {
      setError((err as Error).message || 'Something went wrong');
      sound.play('error');
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    if (!adult) {
      setError(`Please confirm you are ${MIN_AGE} or older and accept the Terms to play.`);
      return;
    }
    setBusy(true);
    setError('');
    rememberTermsAccepted();
    try {
      const display = guestName.trim();
      const { error } = await supabase.auth.signInAnonymously(
        display.length >= 2 ? { options: { data: { display_name: display.slice(0, 20) } } } : undefined,
      );
      if (error) throw error;
      go();
    } catch (err) {
      const msg = (err as Error).message || '';
      setError(
        /anonymous/i.test(msg)
          ? 'Guest play is disabled on this server. Create a free account instead — it takes 10 seconds.'
          : msg || 'Could not start a guest session',
      );
      sound.play('error');
    } finally {
      setBusy(false);
    }
  };

  const head = HEADINGS[mode];
  const submitLabel = busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link';

  return (
    <div className="auth">
      <main className="auth__shell">
        <section className="auth__hero">
          <div className="auth__brand">
            <Logo size="lg" />
            <h1 className="auth__tagline">
              Stackd Casino: play with friends, <span className="gold">one link away.</span>
            </h1>
          </div>
          <ul className="auth__perks">
            <li>
              <CoinsIcon size={16} /> {chips(ECONOMY.startingChips)} free chips to start
            </li>
            <li>
              <UsersIcon size={16} /> Hold'em and blackjack tables, plus Crash, Coin Flip, Roulette and Cases
            </li>
            <li>
              <DeviceMobileIcon size={16} /> Real-time on any device, no download
            </li>
          </ul>
          {halloween && (
            <div className="auth__spooky" aria-hidden>
              <Bat className="auth__bat" />
              <Bat className="auth__bat auth__bat--2" />
              <JackOLantern className="auth__pumpkin" />
            </div>
          )}
          <div className="auth__fan" aria-hidden>
            {['Ah', 'Ad', 'Kc', 'Ks', 'As'].map((c, i) => (
              <motion.div
                key={c}
                className="auth__fan-card"
                style={{ '--i': i - 2 } as React.CSSProperties}
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.12 + i * 0.07, type: 'spring', stiffness: 150, damping: 15 }}
              >
                <PlayingCard card={c} size="hero" faceUp />
              </motion.div>
            ))}
          </div>
        </section>

        <section className="auth__panel">
          {invited && (
            <div className="invite-note">
              <SparkleIcon size={16} /> You've been invited to a table — play as a guest or sign in to take a seat.
            </div>
          )}

          {mode === 'forgot' ? (
            <button type="button" className="auth__back" onClick={() => setMode('signin')}>
              <ArrowLeftIcon size={16} /> Back to sign in
            </button>
          ) : (
            <div className="segmented segmented--full auth__tabs" role="tablist" aria-label="How do you want to play?">
              {TABS.map((t) => (
                <button
                  key={t.mode}
                  type="button"
                  role="tab"
                  aria-selected={mode === t.mode}
                  className={clsx(mode === t.mode && 'is-on')}
                  onClick={() => setMode(t.mode)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <motion.div
            key={mode}
            className="auth__body"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="auth__head">
              <h2>{head.title}</h2>
              <p className="muted">{head.sub}</p>
            </div>

            {mode === 'guest' ? (
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void guest();
                }}
              >
                <label className="field">
                  <span className="field__label">
                    <UserIcon size={13} /> Name at the table <em>(optional)</em>
                  </span>
                  <input
                    className="input"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="What should the table call you?"
                    maxLength={20}
                    autoComplete="nickname"
                    autoFocus={finePointer}
                  />
                </label>

                <label className="check check--consent">
                  <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
                  <span>
                    I'm {MIN_AGE} or older and agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
                    Chips are play money with no cash value.
                  </span>
                </label>
                {error && <p className="form-error">{error}</p>}
                <button className="btn btn--gold btn--block btn--lg" disabled={busy}>
                  {busy ? 'One moment…' : invited ? 'Take a seat' : 'Play now'}
                </button>
                <p className="muted small center auth__fine">Guests aren't ranked on the leaderboard. Save your account any time from your profile.</p>
              </form>
            ) : (
              <form className="form" onSubmit={submit}>
                {mode === 'signup' && (
                  <label className="field">
                    <span className="field__label">
                      <UserIcon size={13} /> Display name
                    </span>
                    <input
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="What should the table call you?"
                      maxLength={20}
                      autoComplete="nickname"
                      required
                    />
                  </label>
                )}
                <label className="field">
                  <span className="field__label">
                    <EnvelopeSimpleIcon size={13} /> Email
                  </span>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus={finePointer && mode !== 'signup'}
                    required
                  />
                </label>
                {mode !== 'forgot' && (
                  <div className="field">
                    <div className="field__row">
                      <label className="field__label" htmlFor="auth-password">
                        <KeyIcon size={13} /> Password
                      </label>
                      {mode === 'signin' && (
                        <button type="button" className="auth__link" onClick={() => setMode('forgot')}>
                          Forgot?
                        </button>
                      )}
                    </div>
                    <div className="input-wrap">
                      <input
                        id="auth-password"
                        className="input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        className="input-wrap__btn"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeSlashIcon size={18} /> : <EyeIcon size={18} />}
                      </button>
                    </div>
                  </div>
                )}
                {mode === 'signup' && (
                  <label className="check check--consent">
                    <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
                    <span>
                      I'm {MIN_AGE} or older and agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
                      Chips are play money with no cash value.
                    </span>
                  </label>
                )}
                {error && <p className="form-error">{error}</p>}
                {notice && <p className="form-notice">{notice}</p>}
                <button className="btn btn--gold btn--block btn--lg" disabled={busy}>
                  {submitLabel}
                </button>
                {mode === 'signin' && (
                  <p className="muted small center auth__fine">
                    By signing in you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
                  </p>
                )}
                {mode === 'signin' && (
                  <p className="muted small center auth__fine">
                    New to Stackd?{' '}
                    <button type="button" className="auth__link" onClick={() => setMode('signup')}>
                      Create an account
                    </button>{' '}
                    or{' '}
                    <button type="button" className="auth__link" onClick={() => setMode('guest')}>
                      play as a guest
                    </button>
                  </p>
                )}
                {mode === 'signup' && (
                  <p className="muted small center auth__fine">
                    Already playing?{' '}
                    <button type="button" className="auth__link" onClick={() => setMode('signin')}>
                      Sign in
                    </button>
                  </p>
                )}
              </form>
            )}
          </motion.div>

          <p className="auth__perks-line">
            {chips(ECONOMY.startingChips)} free chips · Private tables · No downloads
          </p>
        </section>
      </main>
      <LegalFooter className="auth__legal" />
    </div>
  );
}

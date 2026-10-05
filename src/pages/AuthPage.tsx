import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { UserRound, Mail, KeyRound, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { Logo } from '../components/Logo';
import { PlayingCard } from '../components/PlayingCard';
import { sound } from '../lib/sound';
import { chips } from '../lib/format';
import { ECONOMY } from '../../shared/economy';

type Mode = 'signin' | 'signup' | 'forgot';

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export function AuthPage() {
  const session = useAuth((s) => s.session);
  const search = useSearch();
  const next = safeNext(new URLSearchParams(search).get('next'));
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>('signin');
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
    setBusy(true);
    setError('');
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

  const invited = next.startsWith('/t/');
  const guestBlock = (
    <div className="guest">
      <input
        className="input"
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
        placeholder="Your name at the table (optional)"
        maxLength={20}
        aria-label="Guest name"
      />
      <button className={invited ? 'btn btn--gold btn--block btn--lg' : 'btn btn--ghost btn--block'} onClick={guest} disabled={busy}>
        Play instantly as a guest
      </button>
      <p className="muted small center">No sign-up needed. You can save a guest account with an email later.</p>
    </div>
  );

  return (
    <div className="auth">
      <div className="auth__brand">
        <Logo size="lg" />
        <h1>
          Texas Hold'em with friends,
          <br />
          <span className="gold">one link away.</span>
        </h1>
        <p className="muted">
          Private tables, real-time play on any device, and {chips(ECONOMY.startingChips)} free chips to start. No downloads.
        </p>
        <div className="auth__cards" aria-hidden>
          {['Ah', 'Ad', 'Kc', 'Ks', 'As'].map((c, i) => (
            <motion.div
              key={c}
              initial={{ y: 60, opacity: 0, rotate: 0 }}
              animate={{ y: 0, opacity: 1, rotate: (i - 2) * 8 }}
              transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 140, damping: 14 }}
            >
              <PlayingCard card={c} size="hero" faceUp />
            </motion.div>
          ))}
        </div>
      </div>

      <div className="auth__panel">
        <div className="card auth__card">
          {next.startsWith('/t/') && (
            <div className="invite-note">
              <Sparkles size={16} /> You've been invited to a table — sign in or play as a guest to take a seat.
            </div>
          )}
          {invited && mode !== 'forgot' && (
            <>
              {guestBlock}
              <div className="divider">
                <span>or use an account</span>
              </div>
            </>
          )}
          {mode !== 'forgot' && (
            <div className="segmented segmented--full">
              <button type="button" className={clsx(mode === 'signin' && 'is-on')} onClick={() => setMode('signin')}>
                Sign in
              </button>
              <button type="button" className={clsx(mode === 'signup' && 'is-on')} onClick={() => setMode('signup')}>
                Create account
              </button>
            </div>
          )}
          <form className="form" onSubmit={submit}>
            {mode === 'forgot' && <h2>Reset your password</h2>}
            {mode === 'signup' && (
              <label className="field">
                <span className="field__label">
                  <UserRound size={13} /> Display name
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
                <Mail size={13} /> Email
              </span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            {mode !== 'forgot' && (
              <label className="field">
                <span className="field__label">
                  <KeyRound size={13} /> Password
                </span>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                />
              </label>
            )}
            {error && <p className="form-error">{error}</p>}
            {notice && <p className="form-notice">{notice}</p>}
            <button className="btn btn--gold btn--block btn--lg" disabled={busy}>
              {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </button>
            {mode === 'signin' && (
              <button type="button" className="link-btn" onClick={() => setMode('forgot')}>
                Forgot your password?
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" className="link-btn" onClick={() => setMode('signin')}>
                Back to sign in
              </button>
            )}
          </form>
          {!invited && mode !== 'forgot' && (
            <>
              <div className="divider">
                <span>or</span>
              </div>
              {guestBlock}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

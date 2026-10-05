import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { Logo } from '../components/Logo';
import { toast } from '../store/toast';

export function ResetPasswordPage() {
  const session = useAuth((s) => s.session);
  const [, navigate] = useLocation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="page page--center">
      <div className="card gate">
        <Logo />
        {!session ? (
          <>
            <h2>Reset link expired</h2>
            <p className="muted">Open the newest link from your email, or request another one.</p>
            <Link className="btn btn--gold" href="/auth">
              Back to sign in
            </Link>
          </>
        ) : (
          <form
            className="gate__form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const { error } = await supabase.auth.updateUser({ password });
              setBusy(false);
              if (error) setError(error.message);
              else {
                toast.success('Password updated');
                navigate('/');
              }
            }}
          >
            <h2>Choose a new password</h2>
            <input
              className="input"
              type="password"
              minLength={6}
              required
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn--gold btn--block" disabled={busy}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

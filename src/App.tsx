import { useEffect } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import { isConfigured } from './lib/config';
import { useAuth } from './store/auth';
import { sound } from './lib/sound';
import { Toaster } from './components/Toaster';
import { Logo } from './components/Logo';
import { AuthPage } from './pages/AuthPage';
import { LobbyPage } from './pages/LobbyPage';
import { TablePage } from './pages/TablePage';
import { ProfilePage } from './pages/ProfilePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SetupPage } from './pages/SetupPage';
import { NotFoundPage } from './pages/NotFoundPage';

function Splash() {
  return (
    <div className="page page--center splash">
      <Logo size="lg" />
      <div className="spinner" aria-label="Loading" />
    </div>
  );
}

function authRedirect() {
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/auth?next=${encodeURIComponent(next)}`;
}

function Routes() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);

  useEffect(() => {
    useAuth.getState().init();
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  if (!ready) return <Splash />;

  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset" component={ResetPasswordPage} />
      <Route path="/t/:id">{(params) => (session ? <TablePage id={params.id} /> : <Redirect to={authRedirect()} />)}</Route>
      <Route path="/profile">{session ? <ProfilePage /> : <Redirect to={authRedirect()} />}</Route>
      <Route path="/">{session ? <LobbyPage /> : <Redirect to="/auth" />}</Route>
      <Route component={NotFoundPage} />
    </Switch>
  );
}

export function App() {
  if (!isConfigured) return <SetupPage />;
  return (
    <>
      <Routes />
      <Toaster />
    </>
  );
}

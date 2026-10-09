import { Suspense, lazy, useEffect } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import { isConfigured } from './lib/config';
import { useAuth } from './store/auth';
import { sound } from './lib/sound';
import { Toaster } from './components/Toaster';
import { UpdateBanner } from './components/UpdateBanner';
import { Logo } from './components/Logo';
import { AuthPage } from './pages/AuthPage';
import { LobbyPage } from './pages/LobbyPage';
import { TablePage } from './pages/TablePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SetupPage } from './pages/SetupPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TermsGate } from './components/TermsGate';
import { AchievementWatcher } from './components/AchievementWatcher';
import { OnlinePresence } from './components/OnlinePresence';
import { ChallengeWatcher } from './components/challenges/ChallengeWatcher';
import { SeasonDecor } from './components/season/SeasonDecor';
import { SideMenu } from './components/SideMenu';
import { CrashGuard } from './components/CrashGuard';

// Less-visited pages load on demand to keep the first download small.
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const ShopPage = lazy(() => import('./pages/ShopPage').then((m) => ({ default: m.ShopPage })));
const CasesPage = lazy(() => import('./pages/minigames/CasesPage').then((m) => ({ default: m.CasesPage })));
const CoinFlipPage = lazy(() => import('./pages/minigames/CoinFlipPage').then((m) => ({ default: m.CoinFlipPage })));
const RoulettePage = lazy(() => import('./pages/minigames/RoulettePage').then((m) => ({ default: m.RoulettePage })));
const CrashPage = lazy(() => import('./pages/minigames/CrashPage').then((m) => ({ default: m.CrashPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })));

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
    <>
      <SeasonDecor />
      {session && <TermsGate />}
      {session && <AchievementWatcher />}
      {session && <OnlinePresence userId={session.user.id} />}
      {session && <ChallengeWatcher userId={session.user.id} />}
      {session && <SideMenu />}
      <Suspense fallback={<Splash />}>
      <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset" component={ResetPasswordPage} />
      <Route path="/terms">
        <LegalPage doc="terms" />
      </Route>
      <Route path="/privacy">
        <LegalPage doc="privacy" />
      </Route>
      <Route path="/shop">{session ? <ShopPage /> : <Redirect to={authRedirect()} />}</Route>
      <Route path="/t/:id">{(params) => (session ? <TablePage id={params.id} /> : <Redirect to={authRedirect()} />)}</Route>
      <Route path="/games/cases">{session ? <CasesPage /> : <Redirect to={authRedirect()} />}</Route>
      <Route path="/games/coinflip">{session ? <CoinFlipPage /> : <Redirect to={authRedirect()} />}</Route>
      <Route path="/games/roulette">{session ? <RoulettePage /> : <Redirect to={authRedirect()} />}</Route>
      <Route path="/games/crash">{session ? <CrashPage /> : <Redirect to={authRedirect()} />}</Route>
      <Route path="/profile">{session ? <ProfilePage /> : <Redirect to={authRedirect()} />}</Route>
      <Route path="/">{session ? <LobbyPage /> : <Redirect to="/auth" />}</Route>
      <Route component={NotFoundPage} />
      </Switch>
      </Suspense>
    </>
  );
}

export function App() {
  if (!isConfigured) return <SetupPage />;
  return (
    <>
      <CrashGuard>
        <Routes />
      </CrashGuard>
      <Toaster />
      <UpdateBanner />
    </>
  );
}

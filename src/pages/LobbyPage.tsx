import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowRightIcon, RobotIcon, CaretRightIcon, PlusIcon, ArrowsClockwiseIcon, UsersIcon, GiftIcon, FireIcon, ArmchairIcon, LockIcon, SignInIcon, TrophyIcon, LightningIcon, GearSixIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { TopNav } from '../components/TopNav';
import { CreateTableDialog } from '../components/CreateTableDialog';
import { CreateBlackjackDialog } from '../components/CreateBlackjackDialog';
import { QuickPlayDialog } from '../components/QuickPlayDialog';
import { pokerSetupSummary } from '../components/PokerSetupFields';
import { useQuickPlay, type BlackjackQuickPlay, type PokerQuickPlay } from '../store/quickplay';
import { quickPlayRoom } from '../lib/quickplay';
import { quickBuyInNeeded } from '../lib/quickMatch';
import { toast } from '../store/toast';
import { useGameMode } from '../store/game';
import { ChangelogModal } from '../components/ChangelogModal';
import { LegalFooter } from '../components/LegalFooter';
import { BrokeHelp } from '../components/BrokeHelp';
import { Avatar } from '../components/Avatar';
import { Emoji } from '../components/Emoji';
import { Leaderboard, type Leader } from '../components/Leaderboard';
import { ChallengesPanel } from '../components/challenges/Challenges';
import { MinigameArt } from '../components/minigames/MinigameArt';
import { MINIGAMES } from '../../shared/minigames';
import { PlayingCard } from '../components/PlayingCard';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { useEconomy } from '../hooks/useEconomy';
import { blindsLabel, chips, countdown, timeAgo } from '../lib/format';
import { ECONOMY, dailyBonusFor } from '../../shared/economy';
import { sound } from '../lib/sound';
import { setChampion } from '../store/champion';
import { useSeason } from '../lib/season';
import { Ghost, JackOLantern } from '../components/season/HalloweenArt';

interface MyTable {
  table_id: string;
  name: string;
  seat: number;
  stack: number;
  big_blind: number;
  small_blind: number;
  player_count: number;
  max_seats: number;
  updated_at: string;
  game?: string;
}

interface OpenTable {
  id: string;
  name: string;
  small_blind: number;
  big_blind: number;
  max_seats: number;
  min_buy_in: number;
  max_buy_in: number;
  player_count: number;
  status: string;
  updated_at: string;
  bots?: boolean;
  game?: string;
  turn_seconds?: number;
}

const gameOf = (t: { game?: string }) => (t.game === 'blackjack' ? 'blackjack' : 'holdem');

export function LobbyPage() {
  const profile = useAuth((s) => s.profile);
  const me = useAuth((s) => s.session?.user.id);
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [code, setCode] = useState('');
  const [mine, setMine] = useState<MyTable[]>([]);
  const [open, setOpen] = useState<OpenTable[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const econ = useEconomy();
  const mode = useGameMode((s) => s.mode);
  const bj = mode === 'blackjack';
  const halloween = useSeason((s) => s.season) === 'halloween';
  const openHere = open.filter((t) => gameOf(t) === mode);
  const heroCards = bj ? ['Kh', 'As'] : ['As', 'Ks', 'Qs', 'Js', 'Ts'];

  const load = useCallback(async () => {
    setLoading(true);
    const [a, b, c] = await Promise.all([supabase.rpc('my_tables'), supabase.rpc('list_open_tables'), supabase.rpc('leaderboard')]);
    if (a.data) {
      setMine(a.data as MyTable[]);
      useAuth.setState({ seatedChips: (a.data as MyTable[]).reduce((s, r) => s + Number(r.stack), 0) });
    }
    if (b.data) setOpen(b.data as OpenTable[]);
    if (c.data) {
      setLeaders(c.data as Leader[]);
      setChampion((c.data as Leader[])[0]?.id ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Quick play: straight to a seat with the saved settings (asks for them the first time).
  const quick = useQuickPlay((q) => (bj ? q.blackjack : q.holdem));
  const quickSummary = !quick ? 'Your game in one tap' : bj ? `Blackjack · ${(quick as BlackjackQuickPlay).timer}s turns` : pokerSetupSummary(quick as PokerQuickPlay);
  const startQuick = async (prefs: PokerQuickPlay | BlackjackQuickPlay) => {
    const wallet = useAuth.getState().profile?.chips ?? 0;
    if (!bj && wallet < quickBuyInNeeded(prefs as PokerQuickPlay)) {
      toast.error(`You need ${chips(quickBuyInNeeded(prefs as PokerQuickPlay))} chips for your Quick play stakes. Pick lower blinds in the settings.`);
      setQuickOpen(true);
      return;
    }
    setQuickBusy(true);
    try {
      const id = await quickPlayRoom(mode, prefs, wallet);
      sound.play('chips', { count: 4 });
      navigate(`/t/${id}?quick=1`);
    } catch (e) {
      toast.error((e as Error).message || 'Quick play failed');
      sound.play('error');
      setQuickBusy(false);
    }
  };
  const quickPlay = () => {
    sound.play('click');
    if (quick) void startQuick(quick);
    else setQuickOpen(true);
  };

  const joinCode = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = code.trim();
    const fromUrl = raw.match(/\/t\/([A-Za-z0-9]+)/);
    const id = (fromUrl ? fromUrl[1] : raw).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (id.length < 4) return;
    sound.play('click');
    navigate(`/t/${id}`);
  };

  const streak = profile?.daily_streak ?? 0;
  // Dots already earned: a broken streak starts again from day one.
  const litDots = econ.dailyReady ? econ.nextStreak - 1 : streak;
  const myRank = leaders.findIndex((l) => l.id === me);
  const isChampion = myRank === 0;

  return (
    <div className="page lobby">
      <TopNav />
      <main className="home">
        <section className="home-hero">
          <div className="home-hero__intro">
            {profile && (
              <motion.div
                className="home-hero__avatar"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 20 }}
              >
                {isChampion && <Emoji char="👑" className="home-hero__crown" label="Champion" />}
                <Avatar avatar={profile.avatar} color={profile.color} frame={profile.frame} backdrop={profile.backdrop} size={56} />
              </motion.div>
            )}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <p className="home-hero__eyebrow">{halloween ? 'Happy Halloween' : profile ? 'Welcome back' : 'Welcome to Stackd'}</p>
              <h1 className={clsx('home-hero__name', (profile?.display_name.length ?? 0) > 12 && 'is-long')}>
                {profile ? profile.display_name : 'Ready to play?'}
              </h1>
              <p className="home-hero__sub">
                {isChampion
                  ? "You're the reigning champion — defend that crown."
                  : myRank > 0
                    ? `#${myRank + 1} on the leaderboard · ${chips(econ.total)} chips`
                    : `${chips(econ.total)} chips to play with`}
              </p>
            </motion.div>
          </div>

          {halloween && <JackOLantern className="hero-pumpkin hero-pumpkin--corner" />}
          <div className="home-hero__art" aria-hidden>
            {halloween && (
              <>
                <JackOLantern className="hero-pumpkin" />
                <Ghost className="hero-ghost" />
              </>
            )}
            <div className={clsx('fan', bj && 'fan--bj')} key={mode}>
              {heroCards.map((c, i) => (
                <motion.div
                  key={c}
                  className="fan__card"
                  initial={{ rotate: 0, y: 40, opacity: 0 }}
                  animate={{
                    rotate: (i - (heroCards.length - 1) / 2) * (bj ? 14 : 11),
                    y: Math.abs(i - (heroCards.length - 1) / 2) * 8,
                    opacity: 1,
                  }}
                  transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 160, damping: 16 }}
                >
                  <PlayingCard card={c} size="hero" />
                </motion.div>
              ))}
            </div>
          </div>

          <div className="home-actions">
            <div className="home-actions__stack">
              <button
                className="home-action home-action--half home-action--create"
                onClick={() => {
                  sound.play('click');
                  setCreateOpen(true);
                }}
              >
                <span className="home-action__icon">
                  <PlusIcon size={20} weight="bold" />
                </span>
                <span className="home-action__text">
                  <strong>{bj ? 'Open a blackjack table' : 'Create table'}</strong>
                  <span>{bj ? '6 seats against the house' : 'Your blinds, your rules'}</span>
                </span>
                <CaretRightIcon className="home-action__go" size={20} />
              </button>

              <div className={clsx('home-action home-action--half home-action--quick', quickBusy && 'is-busy')}>
                <button className="home-action__main" onClick={quickPlay} disabled={quickBusy} aria-label={`Quick play ${bj ? 'blackjack' : "Hold'em"}`}>
                  <span className="home-action__icon">
                    <LightningIcon size={20} weight="fill" />
                  </span>
                  <span className="home-action__text">
                    <strong>{quickBusy ? 'Finding a seat…' : 'Quick play'}</strong>
                    <span>{quickSummary}</span>
                  </span>
                </button>
                <button
                  className="home-action__gear"
                  onClick={() => {
                    sound.play('click');
                    setQuickOpen(true);
                  }}
                  aria-label="Quick play settings"
                  title="Quick play settings"
                >
                  <GearSixIcon size={20} weight="bold" />
                </button>
              </div>
            </div>

            <form className="home-action home-action--join" onSubmit={joinCode}>
              <span className="home-action__icon">
                <SignInIcon size={21} />
              </span>
              <span className="home-action__text">
                <label htmlFor="join-code">
                  <strong>Join a table</strong>
                </label>
                <span>Paste a table code or invite link.</span>
              </span>
              <div className="join-code">
                <input
                  id="join-code"
                  className="input"
                  placeholder="Code or link"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className="btn btn--ghost" disabled={code.trim().length < 4}>
                  Join <ArrowRightIcon size={16} />
                </button>
              </div>
            </form>
          </div>
        </section>

        {econ.broke && (
          <section className="panel panel--alert home-alert">
            <h2 className="home-panel__title">
              <FireIcon size={18} /> Running low on chips
            </h2>
            <p className="muted">
              You have {chips(econ.total)} chips in total. Grab your daily bonus or an emergency reload to get back in the game.
            </p>
            <BrokeHelp />
          </section>
        )}

        <div className="home-grid">
          <div className="home-col home-col--main">
            <section className="panel home-panel home-panel--seats">
              <header className="home-panel__head">
                <h2 className="home-panel__title">
                  <ArmchairIcon size={18} /> Your seats
                  {mine.length > 0 && <span className="home-panel__count">{mine.length}</span>}
                </h2>
              </header>
              {mine.length === 0 ? (
                <p className="muted empty">You're not seated anywhere. {bj ? 'Open a blackjack table' : 'Create a table'} or pick an open one.</p>
              ) : (
                <ul className="table-list">
                  {mine.map((t) => (
                    <li key={t.table_id}>
                      <Link href={`/t/${t.table_id}`} className="table-row table-row--mine">
                        {gameOf(t) === 'blackjack' ? <BlackjackBadge /> : <Stakes sb={t.small_blind} bb={t.big_blind} />}
                        <span className="table-row__main">
                          <span className="table-row__name">{t.name}</span>
                          <span className="table-row__meta">
                            <span>{gameOf(t) === 'blackjack' ? 'Blackjack' : `${blindsLabel(t.small_blind, t.big_blind)} blinds`}</span>
                            <SeatMeter count={t.player_count} max={t.max_seats} />
                            {Number(t.stack) > 0 && <span className="table-row__stack">{chips(t.stack)} at the table</span>}
                          </span>
                        </span>
                        <span className="btn btn--mint btn--sm">Rejoin</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel home-panel home-panel--open">
              <header className="home-panel__head">
                <h2 className="home-panel__title">
                  <UsersIcon size={18} /> {bj ? 'Open blackjack tables' : 'Open tables'}
                  {openHere.length > 0 && <span className="home-panel__count">{openHere.length}</span>}
                </h2>
                <button className="icon-btn" onClick={load} aria-label="Refresh tables" title="Refresh">
                  <ArrowsClockwiseIcon size={16} className={clsx(loading && 'spin')} />
                </button>
              </header>
              {openHere.length === 0 ? (
                <p className="muted empty">
                  No open {bj ? 'blackjack ' : ''}tables right now. Hit Quick play or create one: every table without a password shows up here.
                </p>
              ) : (
                <ul className="table-list">
                  {openHere.map((t) => {
                    const full = t.player_count >= t.max_seats;
                    if (gameOf(t) === 'blackjack')
                      return (
                        <li key={t.id}>
                          <Link href={`/t/${t.id}`} className="table-row">
                            <BlackjackBadge />
                            <span className="table-row__main">
                              <span className="table-row__name">{t.name}</span>
                              <span className="table-row__meta">
                                <span>Blackjack · 3:2</span>
                                <SeatMeter count={t.player_count} max={t.max_seats} />
                                {t.turn_seconds ? <span>{t.turn_seconds}s turns</span> : null}
                                <span className="table-row__code">{t.id}</span>
                                <span className="table-row__ago">{timeAgo(t.updated_at)}</span>
                              </span>
                            </span>
                            <span className={clsx('btn btn--sm', full ? 'btn--ghost' : 'btn--gold')}>{full ? 'Watch' : 'Join'}</span>
                          </Link>
                        </li>
                      );
                    return (
                      <li key={t.id}>
                        <Link href={`/t/${t.id}`} className="table-row">
                          <Stakes sb={t.small_blind} bb={t.big_blind} />
                          <span className="table-row__main">
                            <span className="table-row__name">
                              {t.name}
                              {t.bots && (
                                <span className="table-row__tag">
                                  <RobotIcon size={12} /> Bots
                                </span>
                              )}
                            </span>
                            <span className="table-row__meta">
                              <span>{blindsLabel(t.small_blind, t.big_blind)} blinds</span>
                              <SeatMeter count={t.player_count} max={t.max_seats} />
                              <span>
                                buy-in {stake(t.min_buy_in)}–{stake(t.max_buy_in)}
                              </span>
                              <span className="table-row__code">{t.id}</span>
                              <span className="table-row__ago">{timeAgo(t.updated_at)}</span>
                            </span>
                          </span>
                          <span className={clsx('btn btn--sm', full ? 'btn--ghost' : 'btn--gold')}>{full ? 'Watch' : 'Join'}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="panel home-panel home-panel--minigames">
              <header className="home-panel__head">
                <h2 className="home-panel__title">
                  <LightningIcon size={18} weight="fill" /> Minigames
                </h2>
                <span className="home-panel__hint">Quick rounds</span>
              </header>
              <div className="mg-tiles">
                {MINIGAMES.map((g) => (
                  <Link key={g.id} href={g.path} className="mg-tile" onClick={() => sound.play('click')}>
                    <MinigameArt id={g.id} size={46} />
                    <span className="mg-tile__text">
                      <strong>{g.name}</strong>
                      <small>{g.tagline}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <aside className="home-col home-col--side">
            <ChallengesPanel className="home-panel--challenges" />

            <section className="panel home-panel home-panel--bonus bonus">
              <header className="home-panel__head">
                <h2 className="home-panel__title">
                  <GiftIcon size={18} /> Daily bonus
                </h2>
                <span className="bonus__day">{econ.dailyReady ? `Day ${econ.nextStreak} ready` : `Day ${streak} claimed`}</span>
              </header>
              <div className="streak">
                {Array.from({ length: ECONOMY.dailyBonusMaxStreak }, (_, i) => (
                  <span
                    key={i}
                    className={clsx('streak__dot', i < litDots && 'is-on', i === econ.nextStreak - 1 && econ.dailyReady && 'is-next')}
                    title={`Day ${i + 1}: ${chips(dailyBonusFor(i + 1))}`}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
              <button className="btn btn--gold btn--block" disabled={!econ.dailyReady || econ.busy} onClick={econ.claimDaily}>
                {econ.dailyReady ? `Claim +${chips(econ.dailyAmount)}` : `Next bonus in ${countdown(econ.nextDailyAt - econ.now)}`}
              </button>
              <p className="muted small bonus__note">
                Claim every 24h. Come back within 48h to grow your streak (up to +{chips(dailyBonusFor(ECONOMY.dailyBonusMaxStreak))}).
              </p>
            </section>

            <section className="panel home-panel home-panel--leaders">
              <header className="home-panel__head">
                <h2 className="home-panel__title">
                  <TrophyIcon size={18} /> Leaderboard
                </h2>
                <span className="home-panel__hint">Total chips</span>
              </header>
              <Leaderboard leaders={leaders} me={me} />
            </section>

            {profile?.is_guest && (
              <section className="panel panel--note home-panel home-panel--guest">
                <h2 className="home-panel__title">
                  <LockIcon size={16} /> Playing as a guest
                </h2>
                <p className="muted small">Save your account to keep your chips and stats on any device — and get on the leaderboard.</p>
                <Link href="/profile" className="btn btn--ghost btn--block">
                  Save my account
                </Link>
              </section>
            )}
          </aside>
        </div>
        <LegalFooter />
      </main>
      <CreateTableDialog open={createOpen && !bj} onClose={() => setCreateOpen(false)} />
      <CreateBlackjackDialog open={createOpen && bj} onClose={() => setCreateOpen(false)} />
      <QuickPlayDialog open={quickOpen} game={mode} onClose={() => setQuickOpen(false)} onPlay={(p) => void startQuick(p)} />
      <ChangelogModal />
    </div>
  );
}

/** The big blind as a casino chip, coloured by stake level like real denominations. */
function Stakes({ sb, bb }: { sb: number; bb: number }) {
  const tier = bb < 50 ? 'blue' : bb < 200 ? 'red' : bb < 1000 ? 'green' : bb < 10_000 ? 'black' : bb < 100_000 ? 'purple' : 'gold';
  return (
    <span className={clsx('stakes', `stakes--${tier}`, stake(bb).length > 3 && 'is-wide')} title={`Blinds ${blindsLabel(sb, bb)}`}>
      <span className="stakes__value">{stake(bb)}</span>
      <span className="stakes__label">BB</span>
    </span>
  );
}

/** Blackjack tables get a "21" chip in place of the stakes chip. */
function BlackjackBadge() {
  return (
    <span className="stakes stakes--bj" title="Blackjack">
      <span className="stakes__value">21</span>
      <span className="stakes__label">BJ</span>
    </span>
  );
}

/** Shortest readable amount for the badge: 500, 1K, 2.5K, 100K, 1M. */
function stake(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${+(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${+(n / 1_000_000).toFixed(1)}M`;
}

function SeatMeter({ count, max }: { count: number; max: number }) {
  return (
    <span className="seat-meter">
      <span className="seat-meter__dots" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <i key={i} className={clsx(i < count && 'is-on')} />
        ))}
      </span>
      {count}/{max} seated
    </span>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowRight, Bot, Crown, Plus, RefreshCw, Users, Gift, Flame, Armchair, Lock } from 'lucide-react';
import clsx from 'clsx';
import { TopNav } from '../components/TopNav';
import { CreateTableDialog } from '../components/CreateTableDialog';
import { ChangelogModal } from '../components/ChangelogModal';
import { BrokeHelp } from '../components/BrokeHelp';
import { Avatar } from '../components/Avatar';
import { PlayingCard } from '../components/PlayingCard';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { useEconomy } from '../hooks/useEconomy';
import { blindsLabel, chips, chipsShort, countdown, timeAgo } from '../lib/format';
import { ECONOMY, dailyBonusFor } from '../../shared/economy';
import { sound } from '../lib/sound';

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
}

interface Leader {
  id: string;
  display_name: string;
  avatar: string;
  color: string;
  total_chips: number;
  hands_played: number;
  hands_won: number;
  biggest_pot: number;
}

export function LobbyPage() {
  const profile = useAuth((s) => s.profile);
  const me = useAuth((s) => s.session?.user.id);
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState('');
  const [mine, setMine] = useState<MyTable[]>([]);
  const [open, setOpen] = useState<OpenTable[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const econ = useEconomy();

  const load = useCallback(async () => {
    setLoading(true);
    const [a, b, c] = await Promise.all([supabase.rpc('my_tables'), supabase.rpc('list_open_tables'), supabase.rpc('leaderboard')]);
    if (a.data) {
      setMine(a.data as MyTable[]);
      useAuth.setState({ seatedChips: (a.data as MyTable[]).reduce((s, r) => s + Number(r.stack), 0) });
    }
    if (b.data) setOpen(b.data as OpenTable[]);
    if (c.data) setLeaders(c.data as Leader[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

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

  return (
    <div className="page lobby">
      <TopNav />
      <main className="lobby__main">
        <section className="hero">
          <div className="hero__copy">
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              {profile ? (
                <>
                  Welcome back, <span className="gold">{profile.display_name}</span>
                </>
              ) : (
                'Welcome to Stackd'
              )}
            </motion.h1>
            <p className="muted">Spin up a private table, share the link, and play Hold'em with friends in seconds.</p>
            <div className="hero__actions">
              <button
                className="btn btn--gold btn--lg"
                onClick={() => {
                  sound.play('click');
                  setCreateOpen(true);
                }}
              >
                <Plus size={18} /> Create table
              </button>
              <form className="join-code" onSubmit={joinCode}>
                <input
                  className="input"
                  placeholder="Table code or link"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-label="Table code"
                  autoCapitalize="characters"
                />
                <button className="btn btn--ghost" disabled={code.trim().length < 4}>
                  Join <ArrowRight size={16} />
                </button>
              </form>
            </div>
          </div>
          <div className="hero__art" aria-hidden>
            <div className="fan">
              {['As', 'Ks', 'Qs', 'Js', 'Ts'].map((c, i) => (
                <motion.div
                  key={c}
                  className="fan__card"
                  initial={{ rotate: 0, y: 40, opacity: 0 }}
                  animate={{ rotate: (i - 2) * 11, y: Math.abs(i - 2) * 8, opacity: 1 }}
                  transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 160, damping: 16 }}
                >
                  <PlayingCard card={c} size="hero" />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="lobby__grid">
          <div className="lobby__col">
            {econ.broke && (
              <div className="panel panel--alert">
                <h3>
                  <Flame size={18} /> Running low on chips
                </h3>
                <p className="muted">
                  You have {chips(econ.total)} chips in total. Grab your daily bonus or an emergency reload to get back in the game.
                </p>
                <BrokeHelp />
              </div>
            )}

            <div className="panel">
              <div className="panel__head">
                <h3>
                  <Armchair size={18} /> Your seats
                </h3>
                <button className="icon-btn" onClick={load} aria-label="Refresh">
                  <RefreshCw size={16} className={clsx(loading && 'spin')} />
                </button>
              </div>
              {mine.length === 0 ? (
                <p className="muted empty">You're not seated anywhere. Create a table or join one below.</p>
              ) : (
                <ul className="table-list">
                  {mine.map((t) => (
                    <li key={t.table_id}>
                      <Link href={`/t/${t.table_id}`} className="table-row">
                        <span className="table-row__name">{t.name}</span>
                        <span className="table-row__meta">
                          {blindsLabel(t.small_blind, t.big_blind)} · {t.player_count}/{t.max_seats} · {chips(t.stack)} at the table
                        </span>
                        <span className="btn btn--mint btn--sm">Rejoin</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="panel">
              <div className="panel__head">
                <h3>
                  <Users size={18} /> Open tables
                </h3>
              </div>
              {open.length === 0 ? (
                <p className="muted empty">
                  No public tables right now. Tables are private by default — tick "List in the lobby" when creating one to show it here.
                </p>
              ) : (
                <ul className="table-list">
                  {open.map((t) => (
                    <li key={t.id}>
                      <Link href={`/t/${t.id}`} className="table-row">
                        <span className="table-row__name">
                          {t.name} <span className="table-row__code">{t.id}</span>
                          {t.bots && (
                            <span className="table-row__tag">
                              <Bot size={12} /> Bots
                            </span>
                          )}
                        </span>
                        <span className="table-row__meta">
                          {blindsLabel(t.small_blind, t.big_blind)} · buy-in {chipsShort(t.min_buy_in)}–{chipsShort(t.max_buy_in)} ·{' '}
                          {t.player_count}/{t.max_seats} seated · {timeAgo(t.updated_at)}
                        </span>
                        <span className={clsx('btn btn--sm', t.player_count >= t.max_seats ? 'btn--ghost' : 'btn--gold')}>
                          {t.player_count >= t.max_seats ? 'Watch' : 'Join'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="lobby__col lobby__col--side">
            <div className="panel bonus">
              <h3>
                <Gift size={18} /> Daily bonus
              </h3>
              <div className="streak">
                {Array.from({ length: ECONOMY.dailyBonusMaxStreak }, (_, i) => (
                  <span
                    key={i}
                    className={clsx('streak__dot', i < streak && 'is-on', i === econ.nextStreak - 1 && econ.dailyReady && 'is-next')}
                    title={`Day ${i + 1}: ${chips(dailyBonusFor(i + 1))}`}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
              <p className="muted small">
                Claim every 24h. Come back within 48h to grow your streak (up to +{chips(dailyBonusFor(ECONOMY.dailyBonusMaxStreak))}).
              </p>
              <button className="btn btn--gold btn--block" disabled={!econ.dailyReady || econ.busy} onClick={econ.claimDaily}>
                {econ.dailyReady ? `Claim +${chips(econ.dailyAmount)}` : `Next bonus in ${countdown(econ.nextDailyAt - econ.now)}`}
              </button>
            </div>

            <div className="panel">
              <h3>
                <Crown size={18} /> Leaderboard
              </h3>
              {leaders.length === 0 ? (
                <p className="muted empty">Play a hand to get on the board.</p>
              ) : (
                <ol className="leaders">
                  {leaders.map((l, i) => (
                    <li key={l.id} className={clsx(l.id === me && 'is-me')}>
                      <span className={clsx('leaders__rank', i < 3 && `rank-${i + 1}`)}>{i + 1}</span>
                      <Avatar emoji={l.avatar} color={l.color} size={28} />
                      <span className="leaders__name">{l.display_name}</span>
                      <span className="leaders__chips">{chipsShort(l.total_chips)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {profile?.is_guest && (
              <div className="panel panel--note">
                <h3>
                  <Lock size={16} /> Playing as a guest
                </h3>
                <p className="muted small">Save your account to keep your chips and stats on any device.</p>
                <Link href="/profile" className="btn btn--ghost btn--block">
                  Save my account
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>
      <CreateTableDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ChangelogModal />
    </div>
  );
}

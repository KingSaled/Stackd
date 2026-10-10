import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { PlayerName } from '../../components/flair/PlayerName';
import { profileLink } from '../../store/profileViewer';
import { MinigameShell, BetInput } from '../../components/minigames/MinigameShell';
import { Avatar } from '../../components/Avatar';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/auth';
import { useWalletHold } from '../../store/walletHold';
import { toast } from '../../store/toast';
import { sound } from '../../lib/sound';
import { serverNow } from '../../lib/clock';
import { chips, chipsShort, timeAgo } from '../../lib/format';
import { useServerNow } from '../../hooks/useNow';
import { useMediaQuery } from '../../hooks/useMediaQuery';

type Side = 'heads' | 'tails';

interface Flip {
  id: number;
  creator: string;
  creator_name: string;
  creator_avatar: string;
  creator_color: string;
  creator_frame: string | null;
  creator_name_fx?: string | null;
  creator_club?: string | null;
  stake: number;
  status: 'open' | 'flipped' | 'cancelled';
  challenger: string | null;
  challenger_name: string | null;
  challenger_avatar: string | null;
  challenger_color: string | null;
  challenger_frame: string | null;
  challenger_name_fx?: string | null;
  challenger_club?: string | null;
  challenger_side: Side | null;
  result: Side | null;
  winner: string | null;
  flip_at: string | null;
  created_at: string;
}

/** How long the coin spins after the countdown. */
const SPIN_MS = 2400;
const LIMITS = { min: 100, max: 1_000_000 };

// Both emblems are centred on (50, 50): the crown spans y 29.5-70.5, the star y 26.75-73.25.
const CROWN = 'M27 60.5 L31 34.5 L41 46.5 L50 29.5 L59 46.5 L69 34.5 L73 60.5 Z M27 64.5 H73 V70.5 H27 Z';
const STAR = 'M50 26.75 L56.8 43.25 L74.5 44.35 L61 55.75 L65.2 73.25 L50 63.75 L34.8 73.25 L39 55.75 L25.5 44.35 L43.2 43.25 Z';

/** A tiny coin showing a side's emblem, for buttons and the key. */
function SideIcon({ side }: { side: Side }) {
  return (
    <svg className={clsx('side-icon', `side-icon--${side}`)} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="48" />
      <path d={side === 'heads' ? CROWN : STAR} />
    </svg>
  );
}

/** Which emblem is which: shown wherever players pick or watch a side. */
function SideKey() {
  return (
    <div className="side-key">
      <span>
        <SideIcon side="heads" /> Heads
      </span>
      <span>
        <SideIcon side="tails" /> Tails
      </span>
    </div>
  );
}

/** One face of the coin: a crown for heads, a star for tails (the seasonal look recolours it). No words: the key explains it. */
function CoinFace({ side }: { side: Side }) {
  // Each coin needs its own gradient id: a hidden coin elsewhere on the page would otherwise own it.
  const grad = `coin-${side}-${useId().replace(/:/g, '')}`;
  return (
    <svg className={clsx('coin__face', `coin__face--${side}`)} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id={grad} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="var(--coin-hi)" />
          <stop offset="0.6" stopColor="var(--coin-mid)" />
          <stop offset="1" stopColor="var(--coin-lo)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${grad})`} />
      <circle cx="50" cy="50" r="40" fill="none" stroke="var(--coin-ink)" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="3 3" />
      <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      <path d={side === 'heads' ? CROWN : STAR} fill="var(--coin-ink)" fillOpacity="0.85" transform="translate(50 50) scale(0.95) translate(-50 -50)" />
    </svg>
  );
}

/** A two-sided 3D coin. `turns` full spins land on `side`. */
function Coin({ side, spinning, size = 160 }: { side: Side; spinning: boolean; size?: number }) {
  const final = (spinning ? 6 * 360 : 0) + (side === 'tails' ? 180 : 0);
  return (
    <div className="coin-wrap" style={{ width: size, height: size }}>
      <motion.div
        className="coin"
        initial={false}
        animate={{ rotateY: final, y: spinning ? [0, -size * 0.45, 0] : 0 }}
        transition={{
          rotateY: { duration: spinning ? SPIN_MS / 1000 : 0.3, ease: [0.2, 0.7, 0.25, 1] },
          y: { duration: SPIN_MS / 1000, ease: 'easeInOut', times: [0, 0.45, 1] },
        }}
      >
        <CoinFace side="heads" />
        <CoinFace side="tails" />
      </motion.div>
      <motion.div className="coin-shadow" animate={spinning ? { scale: [1, 0.55, 1], opacity: [0.5, 0.2, 0.5] } : {}} transition={{ duration: SPIN_MS / 1000 }} />
    </div>
  );
}

/** Full-screen moment for a flip you're in: the two players, a countdown, the coin, the result. */
function FlipShow({ flip, me, onDone }: { flip: Flip; me: string; onDone: () => void }) {
  const now = useServerNow(100);
  const narrow = useMediaQuery('(max-width: 480px)');
  const at = Date.parse(flip.flip_at ?? '') || 0;
  const left = Math.ceil((at - now) / 1000);
  const phase = now < at ? 'countdown' : now < at + SPIN_MS ? 'spin' : 'result';
  const won = flip.winner === me;
  const creatorSide: Side = flip.challenger_side === 'heads' ? 'tails' : 'heads';
  const lastBeep = useRef(0);
  useEffect(() => {
    if (phase === 'countdown' && left > 0 && left !== lastBeep.current) {
      lastBeep.current = left;
      sound.play('tick');
    }
  }, [phase, left]);
  const played = useRef(false);
  useEffect(() => {
    if (phase === 'spin') sound.play('flip');
    if (phase === 'result' && !played.current) {
      played.current = true;
      useWalletHold.getState().release();
      sound.play(won ? 'bigwin' : 'chip');
    }
  }, [phase, won]);

  const player = (who: 'creator' | 'challenger') => {
    const isC = who === 'creator';
    const id = isC ? flip.creator : flip.challenger;
    const side = isC ? creatorSide : flip.challenger_side!;
    return (
      <div className={clsx('flip-player', phase === 'result' && (flip.winner === id ? 'is-winner' : 'is-loser'))}>
        <Avatar
          avatar={(isC ? flip.creator_avatar : flip.challenger_avatar) ?? 'p01'}
          color={(isC ? flip.creator_color : flip.challenger_color) ?? '#fff'}
          frame={isC ? flip.creator_frame : flip.challenger_frame}
          size={64}
        />
        <strong>
          <PlayerName
            name={(id === me ? 'You' : isC ? flip.creator_name : flip.challenger_name) ?? ''}
            fx={isC ? flip.creator_name_fx : flip.challenger_name_fx}
            club={isC ? flip.creator_club : flip.challenger_club}
          />
        </strong>
        <span className={clsx('flip-side', `flip-side--${side}`)}>
          <SideIcon side={side} /> {side === 'heads' ? 'Heads' : 'Tails'}
        </span>
      </div>
    );
  };

  return (
    <motion.div className="flip-show" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="flip-show__card" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}>
        <div className="flip-show__pot">
          Pot <strong>{chips(flip.stake * 2)}</strong>
        </div>
        <SideKey />
        <div className="flip-show__row">
          {player('creator')}
          <div className="flip-show__coin">
            <Coin side={phase === 'countdown' ? 'heads' : flip.result!} spinning={phase !== 'countdown'} size={narrow ? 104 : 150} />
            <AnimatePresence mode="wait">
              {phase === 'countdown' && (
                <motion.span key={left} className="flip-show__count" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                  {Math.max(1, left)}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {player('challenger')}
        </div>
        <div className="flip-show__result">
          {phase === 'result' ? (
            <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={clsx('flip-show__verdict', won ? 'is-won' : 'is-lost')}>
              <span>{flip.result === 'heads' ? 'Heads' : 'Tails'}!</span>
              <strong>{won ? `You win ${chips(flip.stake * 2)}` : `You lose ${chips(flip.stake)}`}</strong>
            </motion.div>
          ) : (
            <span className="muted">{phase === 'countdown' ? 'Get ready…' : 'Flipping…'}</span>
          )}
        </div>
        <button className="btn btn--ghost btn--block" disabled={phase !== 'result'} onClick={onDone}>
          {phase === 'result' ? 'Back to the lobbies' : 'Hold on…'}
        </button>
      </motion.div>
    </motion.div>
  );
}

export function CoinFlipPage() {
  const me = useAuth((s) => s.session?.user.id ?? '');
  const wallet = useAuth((s) => s.profile?.chips ?? 0);
  const patchProfile = useAuth((s) => s.patchProfile);
  const [stake, setStake] = useState(10_000);
  const [flips, setFlips] = useState<Flip[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ id: number; side: Side } | null>(null);
  const [show, setShow] = useState<Flip | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const seen = useRef(new Set<number>());

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('coinflips')
      .select('*')
      .or(`status.eq.open,and(status.eq.flipped,flip_at.gt.${new Date(Date.now() - 86_400_000).toISOString()})`)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) setUnavailable(true);
      return;
    }
    setFlips(((data as Flip[]) ?? []).map((f) => ({ ...f, stake: Number(f.stake) })));
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('coinflips')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coinflips' }, () => void load())
      .subscribe();
    const id = window.setInterval(load, 20_000);
    return () => {
      window.clearInterval(id);
      void supabase.removeChannel(channel);
    };
  }, [load]);
  useEffect(() => () => useWalletHold.getState().release(), []);

  // Someone took one of my lobbies: show the flip.
  useEffect(() => {
    for (const f of flips) {
      if (f.status !== 'flipped' || seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      const fresh = f.flip_at && Date.parse(f.flip_at) + SPIN_MS > serverNow();
      if (fresh && f.creator === me && !show) {
        if (f.winner === me) useWalletHold.getState().hold(f.stake * 2);
        setShow(f);
      }
    }
  }, [flips, me, show]);

  const open = useMemo(() => flips.filter((f) => f.status === 'open').sort((a, b) => b.stake - a.stake), [flips]);
  const recent = useMemo(
    () => flips.filter((f) => f.status === 'flipped').sort((a, b) => Date.parse(b.flip_at!) - Date.parse(a.flip_at!)).slice(0, 12),
    [flips],
  );

  const create = async () => {
    if (busy) return;
    if (stake < LIMITS.min) return toast.info(`Flips start at ${chips(LIMITS.min)} chips`);
    if (stake > wallet) return toast.info("You don't have enough chips in your wallet");
    setBusy(true);
    const { data, error } = await supabase.rpc('create_coinflip', { p_stake: stake });
    setBusy(false);
    const r = data as { ok: boolean; reason?: string; chips?: number } | null;
    if (error || !r?.ok) {
      sound.play('error');
      return toast.error(
        r?.reason === 'too_many' ? 'You can have up to 3 open lobbies at once' : r?.reason === 'insufficient_chips' ? "You don't have enough chips" : error?.message || 'Could not open the lobby',
      );
    }
    patchProfile({ chips: Number(r.chips) });
    sound.play('chips', { count: 3 });
    toast.success(`Lobby open for ${chips(stake)}. Waiting for a challenger…`);
    void load();
  };

  const cancel = async (id: number) => {
    const { data } = await supabase.rpc('cancel_coinflip', { p_id: id });
    const r = data as { ok: boolean; chips?: number; reason?: string } | null;
    if (r?.ok) {
      patchProfile({ chips: Number(r.chips) });
      toast.info('Lobby closed, stake returned');
    } else toast.info(r?.reason === 'taken' ? 'Someone already took that flip' : 'Could not close the lobby');
    void load();
  };

  const join = async (f: Flip, side: Side) => {
    if (busy) return;
    if (!confirm || confirm.id !== f.id || confirm.side !== side) {
      sound.play('click');
      setConfirm({ id: f.id, side });
      return;
    }
    setConfirm(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('join_coinflip', { p_id: f.id, p_side: side });
    setBusy(false);
    const r = data as { ok: boolean; reason?: string; chips?: number; result?: Side; winner?: string; flip_at?: string } | null;
    if (error || !r?.ok) {
      sound.play('error');
      void load();
      return toast.error(
        r?.reason === 'taken' ? 'Too slow! Someone else took that flip' : r?.reason === 'insufficient_chips' ? "You don't have enough chips" : error?.message || 'Could not join the flip',
      );
    }
    seen.current.add(f.id);
    if (r.winner === me) useWalletHold.getState().hold(f.stake * 2);
    patchProfile({ chips: Number(r.chips) });
    setShow({
      ...f,
      status: 'flipped',
      challenger: me,
      challenger_name: useAuth.getState().profile?.display_name ?? 'You',
      challenger_avatar: useAuth.getState().profile?.avatar ?? 'p01',
      challenger_color: useAuth.getState().profile?.color ?? '#fff',
      challenger_frame: useAuth.getState().profile?.frame ?? null,
      challenger_side: side,
      result: r.result!,
      winner: r.winner!,
      flip_at: r.flip_at!,
    });
  };

  const rules = (
    <>
      <p>
        <strong>Open a lobby</strong> with any stake from {chips(LIMITS.min)} to {chips(LIMITS.max)} chips. It stays listed until another player
        matches your stake and picks <strong>heads</strong> or <strong>tails</strong> (you get the other side).
      </p>
      <p>
        After a 3 second countdown the coin flips. It's a true 50/50 and the winner takes the whole pot, both stakes. You can close an
        untaken lobby at any time and get your stake back; lobbies nobody takes within 2 hours close by themselves.
      </p>
    </>
  );

  return (
    <MinigameShell id="coinflip" rules={rules}>
      {unavailable ? (
        <section className="panel mg-unavailable">Coin Flip is being set up. Check back soon!</section>
      ) : (
        <div className="mg-layout">
          <div className="cf-col">
            <section className="panel cf-create">
              <div className="cf-create__coin">
                <Coin side="heads" spinning={false} size={92} />
              </div>
              <div className="cf-create__form">
                <BetInput label="Your stake" value={stake} onChange={setStake} max={Math.min(LIMITS.max, wallet)} min={LIMITS.min} disabled={busy} />
                <button className="btn btn--gold btn--lg" disabled={busy || stake < LIMITS.min || stake > wallet} onClick={() => void create()}>
                  Open a lobby · {chips(stake)}
                </button>
              </div>
            </section>

            <section className="panel">
              <h2 className="mg-panel-title">
                Open lobbies <small>{open.length} waiting</small>
              </h2>
              <SideKey />
              {open.length === 0 ? (
                <p className="muted empty">No open flips right now. Open one and wait for a challenger!</p>
              ) : (
                <ul className="cf-lobbies">
                  <AnimatePresence initial={false}>
                    {open.map((f) => {
                      const mine = f.creator === me;
                      const short = wallet < f.stake;
                      return (
                        <motion.li key={f.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className={clsx('cf-lobby', mine && 'is-mine')}>
                          <span className="is-profile-link" {...profileLink(f.creator)}>
                            <Avatar avatar={f.creator_avatar} color={f.creator_color} frame={f.creator_frame} size={42} />
                          </span>
                          <span className="cf-lobby__who">
                            <strong className={mine ? undefined : 'is-profile-link'} {...(mine ? {} : profileLink(f.creator))}>
                              {mine ? 'Your lobby' : <PlayerName name={f.creator_name} fx={f.creator_name_fx} club={f.creator_club} />}
                            </strong>
                            <small>{timeAgo(f.created_at)}</small>
                          </span>
                          <span className="cf-lobby__stake">
                            <b>{chipsShort(f.stake)}</b>
                            <small>to win {chipsShort(f.stake * 2)}</small>
                          </span>
                          <span className="cf-lobby__go">
                            {mine ? (
                              <button className="btn btn--ghost btn--sm" onClick={() => void cancel(f.id)}>
                                Close
                              </button>
                            ) : (
                              (['heads', 'tails'] as Side[]).map((side) => {
                                const armed = confirm?.id === f.id && confirm.side === side;
                                return (
                                  <button
                                    key={side}
                                    className={clsx('btn btn--sm cf-side', `cf-side--${side}`, armed && 'is-armed')}
                                    disabled={busy || short}
                                    title={short ? `You need ${chips(f.stake)} chips` : `Join and call ${side}`}
                                    onClick={() => void join(f, side)}
                                  >
                                    <SideIcon side={side} />
                                    {armed ? `Confirm ${chipsShort(f.stake)}` : side === 'heads' ? 'Heads' : 'Tails'}
                                  </button>
                                );
                              })
                            )}
                          </span>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </section>
          </div>

          <aside className="cf-side-panel">
            <section className="panel">
              <h2 className="mg-panel-title">
                Recent flips <small>today</small>
              </h2>
              {recent.length === 0 ? (
                <p className="muted small">No flips yet today.</p>
              ) : (
                <ul className="cf-recent">
                  {recent.map((f) => {
                    const creatorWon = f.winner === f.creator;
                    return (
                      <li key={f.id}>
                        <span className="cf-recent__coin" title={f.result === 'heads' ? 'Heads' : 'Tails'}>
                          <SideIcon side={f.result!} />
                        </span>
                        <span className="cf-recent__who">
                          <strong className="is-profile-link" {...profileLink(creatorWon ? f.creator : f.challenger)}>
                            <PlayerName
                              name={(creatorWon ? f.creator_name : f.challenger_name) ?? ''}
                              fx={creatorWon ? f.creator_name_fx : f.challenger_name_fx}
                              club={creatorWon ? f.creator_club : f.challenger_club}
                            />
                          </strong>
                          <small>beat {creatorWon ? f.challenger_name : f.creator_name}</small>
                        </span>
                        <b>+{chipsShort(f.stake)}</b>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
      <AnimatePresence>{show && <FlipShow key={show.id} flip={show} me={me} onDone={() => setShow(null)} />}</AnimatePresence>
    </MinigameShell>
  );
}

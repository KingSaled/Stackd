import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useMotionValue } from 'framer-motion';
import clsx from 'clsx';
import { MinigameShell, BetInput } from '../../components/minigames/MinigameShell';
import { Avatar } from '../../components/Avatar';
import { supabase } from '../../lib/supabase';
import { serverNow } from '../../lib/clock';
import { useServerNow } from '../../hooks/useNow';
import { useAuth } from '../../store/auth';
import { useWalletHold } from '../../store/walletHold';
import { toast } from '../../store/toast';
import { sound } from '../../lib/sound';
import { chips, chipsShort } from '../../lib/format';

type Color = 'red' | 'black' | 'green';

interface Bet {
  user_id: string;
  display_name: string;
  avatar: string;
  color: string;
  bet_color: Color;
  amount: number;
  payout: number | null;
}

interface State {
  round: { id: number; opens_at: string; spin_at: string; result_slot: number | null; settled: boolean };
  bets: Bet[];
  history: number[];
}

const SLOTS = 15;
const SLICE = 360 / SLOTS;
/** How long the wheel spins once the result is in. */
const SPIN_MS = 6000;
/** The result stays on show this long after the spin before the next round opens (matches the server's 9s). */
const SHOW_MS = 9000;
const PAYS: Record<Color, number> = { red: 2, black: 2, green: 14 };

const slotColor = (slot: number): Color => (slot === 0 ? 'green' : slot % 2 === 1 ? 'red' : 'black');

/** The wheel: 15 slices, slot 0 (green) at the top when the wheel is at rest. */
function Wheel({ rotation }: { rotation: ReturnType<typeof useMotionValue<number>> }) {
  const u = useId().replace(/:/g, '');
  const r = 100;
  return (
    <div className="rl-wheel">
      <motion.svg viewBox="-110 -110 220 220" className="rl-wheel__disc" style={{ rotate: rotation }} aria-hidden>
        <defs>
          <radialGradient id={`rl-hub-${u}`} cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#fff2c4" />
            <stop offset="0.6" stopColor="#f5c451" />
            <stop offset="1" stopColor="#9b6d14" />
          </radialGradient>
          <linearGradient id={`rl-rim-${u}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe9a8" />
            <stop offset="0.5" stopColor="#b8892a" />
            <stop offset="1" stopColor="#ffe08f" />
          </linearGradient>
        </defs>
        <circle r="108" fill="#0b0f1c" />
        {Array.from({ length: SLOTS }, (_, i) => {
          // Slice i is centred on angle i * SLICE, measured clockwise from the top.
          const a0 = ((i - 0.5) * SLICE - 90) * (Math.PI / 180);
          const a1 = ((i + 0.5) * SLICE - 90) * (Math.PI / 180);
          const mid = (i * SLICE - 90) * (Math.PI / 180);
          const c = slotColor(i);
          return (
            <g key={i}>
              <path
                d={`M0 0 L${Math.cos(a0) * r} ${Math.sin(a0) * r} A${r} ${r} 0 0 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r} Z`}
                className={`rl-slice rl-slice--${c}`}
              />
              <text
                x={Math.cos(mid) * 80}
                y={Math.sin(mid) * 80}
                transform={`rotate(${i * SLICE} ${Math.cos(mid) * 80} ${Math.sin(mid) * 80})`}
                textAnchor="middle"
                dominantBaseline="central"
                className="rl-num"
              >
                {c === 'green' ? '14x' : '2x'}
              </text>
            </g>
          );
        })}
        <circle r="101" fill="none" stroke={`url(#rl-rim-${u})`} strokeWidth="5" />
        <circle r="56" fill="#0d1222" stroke="rgba(255,255,255,0.12)" />
        {Array.from({ length: SLOTS }, (_, i) => (
          <circle key={i} cx={Math.cos(((i + 0.5) * SLICE - 90) * (Math.PI / 180)) * 104} cy={Math.sin(((i + 0.5) * SLICE - 90) * (Math.PI / 180)) * 104} r="2.2" fill="#ffe9a8" />
        ))}
        <circle r="20" fill={`url(#rl-hub-${u})`} />
        <circle r="7" fill="#7a5410" />
      </motion.svg>
      <div className="rl-wheel__pointer" aria-hidden />
    </div>
  );
}

export function RoulettePage() {
  const me = useAuth((s) => s.session?.user.id ?? '');
  const wallet = useAuth((s) => s.profile?.chips ?? 0);
  const patchProfile = useAuth((s) => s.patchProfile);
  const [state, setState] = useState<State | null>(null);
  const [amount, setAmount] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState<number | null>(null);
  const rotation = useMotionValue(0);
  const spunRound = useRef(0);
  const now = useServerNow(200);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('roulette_state');
    if (error) {
      if (error.code === 'PGRST202') setUnavailable(true);
      return;
    }
    const s = data as State;
    s.bets = s.bets.map((b) => ({ ...b, amount: Number(b.amount), payout: b.payout == null ? null : Number(b.payout) }));
    setState(s);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('roulette')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roulette_bets' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roulette_rounds' }, () => void load())
      .subscribe();
    const id = window.setInterval(load, 15_000);
    return () => {
      window.clearInterval(id);
      void supabase.removeChannel(channel);
      useWalletHold.getState().release();
    };
  }, [load]);

  // Ask for the result as soon as betting closes, and for the next round once the result has been shown.
  const round = state?.round;
  useEffect(() => {
    if (!round) return;
    const spinAt = Date.parse(round.spin_at);
    const due = round.settled ? spinAt + SHOW_MS + 150 : spinAt + 80;
    const t = window.setTimeout(load, Math.max(0, due - serverNow()));
    return () => window.clearTimeout(t);
  }, [round, load]);

  // Spin to the result when it arrives.
  useEffect(() => {
    if (!round || !round.settled || round.result_slot == null || spunRound.current === round.id) return;
    spunRound.current = round.id;
    const slot = round.result_slot;
    const myWin = (state?.bets ?? []).filter((b) => b.user_id === me).reduce((a, b) => a + (b.payout ?? 0), 0);
    const left = Date.parse(round.spin_at) + SPIN_MS - serverNow();
    // Turning the wheel by -slot slices brings that slice to the pointer at the top.
    const base = Math.ceil(rotation.get() / 360) * 360;
    const target = base + 360 * 5 - slot * SLICE + (Math.random() - 0.5) * SLICE * 0.6;
    if (left < 800) {
      // Opened the page after the spin: just show where it landed.
      rotation.set(target);
      setLanded(slot);
      return;
    }
    if (myWin > 0) useWalletHold.getState().hold(myWin);
    setSpinning(true);
    setLanded(null);
    sound.play('shuffle');
    void animate(rotation, target, { duration: Math.min(SPIN_MS, left) / 1000, ease: [0.12, 0.7, 0.18, 1] }).then(() => {
      setSpinning(false);
      setLanded(slot);
      useWalletHold.getState().release();
      if (myWin > 0) sound.play(slotColor(slot) === 'green' ? 'bigwin' : 'win');
      else sound.play('chip');
    });
  }, [round, state, me, rotation]);

  // A new round: the wheel stays where it stopped, the result chip clears.
  useEffect(() => {
    if (round && !round.settled) setLanded(null);
  }, [round?.id, round?.settled]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = !!round && !round.settled && now < Date.parse(round.spin_at) - 500;
  const secs = round ? Math.max(0, Math.ceil((Date.parse(round.spin_at) - now) / 1000)) : 0;
  const pct = round ? Math.max(0, Math.min(1, (Date.parse(round.spin_at) - now) / 25_000)) : 0;

  const byColor = useMemo(() => {
    const out: Record<Color, Bet[]> = { red: [], black: [], green: [] };
    for (const b of state?.bets ?? []) out[b.bet_color].push(b);
    return out;
  }, [state]);
  const mine = (c: Color) => byColor[c].filter((b) => b.user_id === me).reduce((a, b) => a + b.amount, 0);
  const total = (c: Color) => byColor[c].reduce((a, b) => a + b.amount, 0);
  const myTotal = mine('red') + mine('black') + mine('green');

  const bet = async (color: Color) => {
    if (busy || !open) return;
    if (amount < 10) return toast.info('The smallest bet is 10 chips');
    if (amount > wallet) return toast.info("You don't have enough chips in your wallet");
    setBusy(true);
    const { data, error } = await supabase.rpc('place_roulette_bet', { p_color: color, p_amount: amount });
    setBusy(false);
    const r = data as { ok: boolean; reason?: string; chips?: number } | null;
    if (error || !r?.ok) {
      sound.play('error');
      if (error?.code === 'PGRST202') setUnavailable(true);
      return toast.error(
        r?.reason === 'closed'
          ? 'Too late, the wheel is spinning'
          : r?.reason === 'over_limit'
            ? 'Bets top out at 500,000 per colour each round'
            : r?.reason === 'insufficient_chips'
              ? "You don't have enough chips"
              : error?.message || 'Could not place the bet',
      );
    }
    patchProfile({ chips: Number(r.chips) });
    sound.play('chips', { count: 2 });
    void load();
  };

  const clear = async () => {
    const { data } = await supabase.rpc('clear_roulette_bets');
    const r = data as { ok: boolean; chips?: number; refunded?: number } | null;
    if (r?.ok) {
      patchProfile({ chips: Number(r.chips) });
      toast.info(`Bets taken back: ${chips(r.refunded)}`);
    } else toast.info('Too late, the wheel is spinning');
    void load();
  };

  const status = !round
    ? 'Loading…'
    : spinning
      ? 'Spinning…'
      : round.settled && landed != null
        ? null
        : open
          ? `Spinning in ${secs}s`
          : 'No more bets';

  const rules = (
    <>
      <p>
        One wheel for everyone, with <strong>7 red</strong>, <strong>7 black</strong> and <strong>1 green</strong> slot. Bets are open for{' '}
        <strong>25 seconds</strong>, then the wheel spins. Red and black pay <strong>2x</strong>, green pays <strong>14x</strong>.
      </p>
      <p>
        Bet on as many colours as you like, add to a bet while the timer runs, or take your bets back before the spin. Bets go up to 500,000 per colour
        each round. Come and go whenever you like: there's always a round about to start.
      </p>
    </>
  );

  return (
    <MinigameShell id="roulette" rules={rules}>
      {unavailable ? (
        <section className="panel mg-unavailable">Roulette is being set up. Check back soon!</section>
      ) : (
        <div className="mg-layout">
          <div className="rl-col">
            <section className="panel rl-stage">
              <div className="rl-history" aria-label="Last results">
                {(state?.history ?? []).slice(0, 16).map((s, i) => (
                  <span key={i} className={clsx('rl-dot', `rl-dot--${slotColor(s)}`)} />
                ))}
              </div>
              <div className="rl-stage__wheel">
                <Wheel rotation={rotation} />
                <div className="rl-center">
                  <AnimatePresence mode="wait">
                    {round?.settled && landed != null ? (
                      <motion.div
                        key={`res-${round.id}`}
                        className={clsx('rl-center__result', `is-${slotColor(landed)}`)}
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                      >
                        {slotColor(landed)}
                      </motion.div>
                    ) : (
                      <motion.div key={`st-${status}`} className="rl-center__status" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {status}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <div className="rl-timer" aria-hidden>
                <i style={{ width: `${open ? pct * 100 : 0}%` }} />
              </div>
              {round?.settled && landed != null && myTotal > 0 && (
                <div className="rl-mine">
                  {(() => {
                    const won = (state?.bets ?? []).filter((b) => b.user_id === me).reduce((a, b) => a + (b.payout ?? 0), 0);
                    return won > 0 ? <span className="is-up">You won {chips(won)}!</span> : <span className="is-down">No luck this time ({chips(myTotal)})</span>;
                  })()}
                </div>
              )}
            </section>

            <section className="panel rl-controls">
              <BetInput label="Bet per tap" value={amount} onChange={setAmount} max={Math.min(500_000, wallet)} min={10} disabled={busy} />
              <div className="rl-picks">
                {(['red', 'green', 'black'] as Color[]).map((c) => (
                  <button key={c} className={clsx('rl-pick', `rl-pick--${c}`)} disabled={!open || busy || amount < 10 || amount > wallet} onClick={() => void bet(c)}>
                    <span className="rl-pick__name">{c}</span>
                    <span className="rl-pick__pays">pays {PAYS[c]}x</span>
                    {mine(c) > 0 && <span className="rl-pick__mine">You: {chipsShort(mine(c))}</span>}
                  </button>
                ))}
              </div>
              {myTotal > 0 && open && (
                <button className="btn btn--ghost btn--sm rl-clear" onClick={() => void clear()}>
                  Take back my bets ({chips(myTotal)})
                </button>
              )}
            </section>
          </div>

          <aside className="rl-side">
            {(['red', 'green', 'black'] as Color[]).map((c) => (
              <section key={c} className={clsx('panel rl-pool', `rl-pool--${c}`)}>
                <h2 className="mg-panel-title">
                  <span className="rl-pool__title">
                    <i className={`rl-dot rl-dot--${c}`} /> {c}
                  </span>
                  <small className="rl-pool__sum">
                    {byColor[c].length} bet{byColor[c].length === 1 ? '' : 's'} · {chipsShort(total(c))}
                  </small>
                </h2>
                {byColor[c].length === 0 ? (
                  <p className="muted small">No bets yet</p>
                ) : (
                  <ul>
                    {byColor[c].slice(0, 8).map((b) => (
                      <li key={b.user_id} className={clsx(b.user_id === me && 'is-me', b.payout != null && (b.payout > 0 ? 'is-won' : 'is-lost'))}>
                        <Avatar avatar={b.avatar} color={b.color} size={24} />
                        <span>{b.user_id === me ? 'You' : b.display_name}</span>
                        <b>{b.payout != null && b.payout > 0 && landed != null ? `+${chipsShort(b.payout)}` : chipsShort(b.amount)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </aside>
        </div>
      )}
    </MinigameShell>
  );
}

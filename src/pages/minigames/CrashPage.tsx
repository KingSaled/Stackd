import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { PlayerName } from '../../components/flair/PlayerName';
import { profileLink } from '../../store/profileViewer';
import { MinigameShell, BetInput } from '../../components/minigames/MinigameShell';
import { Avatar } from '../../components/Avatar';
import { supabase } from '../../lib/supabase';
import { serverNow } from '../../lib/clock';
import { useAuth } from '../../store/auth';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { toast } from '../../store/toast';
import { sound } from '../../lib/sound';
import { chips, chipsShort } from '../../lib/format';
import { CRASH, crashMultiplier, crashTimeFor } from '../../../shared/crash';

interface Bet {
  user_id: string;
  display_name: string;
  avatar: string;
  color: string;
  name_fx?: string | null;
  club?: string | null;
  amount: number;
  auto_cashout: number | null;
  cashout_mult: number | null;
  payout: number | null;
}

interface State {
  round: { id: number; opens_at: string; run_at: string; crash_point: number | null; crashed_at: string | null };
  bets: Bet[];
  history: number[];
}

const fmt = (m: number) => `${m.toFixed(2)}x`;
const tone = (m: number) => (m < 2 ? 'low' : m < 10 ? 'mid' : 'high');

/** Re-render every animation frame while `on`. */
function useFrame(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    let id = 0;
    const tick = () => {
      set((x) => x + 1);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [on]);
}

/** The climbing curve with the rocket at its tip. */
function Graph({ ms, crashed, mult, tall }: { ms: number; crashed: boolean; mult: number; tall: boolean }) {
  // Same shape as its box (2:1, or 4:3 on phones) so lines and labels are never stretched.
  const W = tall ? 400 : 600;
  const H = 300;
  const pad = { l: 40, r: 16, t: 18, b: 28 };
  // The view grows with the round: at least 10 seconds and 2x, then follows the rocket.
  const tMax = Math.max(10_000, ms * 1.15);
  const mMax = Math.max(2, mult * 1.25);
  const x = (t: number) => pad.l + (t / tMax) * (W - pad.l - pad.r);
  const y = (m: number) => H - pad.b - ((m - 1) / (mMax - 1)) * (H - pad.t - pad.b);
  const pts: string[] = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = (ms * i) / steps;
    pts.push(`${x(t).toFixed(1)},${y(Math.exp((CRASH.growth * t) / 1000)).toFixed(1)}`);
  }
  const tip = { x: x(ms), y: y(Math.exp((CRASH.growth * ms) / 1000)) };
  // Rocket angle follows the slope of the curve.
  const t2 = Math.max(0, ms - 300);
  const ang = (Math.atan2(tip.y - y(Math.exp((CRASH.growth * t2) / 1000)), tip.x - x(t2)) * 180) / Math.PI;
  const ticksM = [1, ...niceTicks(mMax)];
  const ticksT = Array.from({ length: Math.floor(tMax / 5000) + 1 }, (_, i) => i * 5000).filter((t) => t > 0);
  return (
    <svg className={clsx('crash-graph', crashed && 'is-crashed')} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <linearGradient id="crash-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--crash-line)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--crash-line)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticksM.map((m) => (
        <g key={`m${m}`}>
          <line x1={pad.l} x2={W - pad.r} y1={y(m)} y2={y(m)} className="crash-grid" />
          <text x={pad.l - 8} y={y(m)} className="crash-axis" textAnchor="end" dominantBaseline="central">
            {m}x
          </text>
        </g>
      ))}
      {ticksT.map((t) => (
        <text key={`t${t}`} x={x(t)} y={H - 10} className="crash-axis" textAnchor="middle">
          {t / 1000}s
        </text>
      ))}
      {ms > 0 && (
        <>
          <polygon points={`${x(0)},${y(1)} ${pts.join(' ')} ${tip.x},${y(1)}`} fill="url(#crash-fill)" />
          <polyline points={pts.join(' ')} className="crash-line" />
          <g transform={`translate(${tip.x} ${tip.y}) rotate(${ang + 90})`}>
            {crashed ? (
              <g className="crash-boom">
                <circle r="14" />
                <path d="M0 -20 L4 -6 L18 -10 L8 0 L18 10 L4 6 L0 20 L-4 6 L-18 10 L-8 0 L-18 -10 L-4 -6 Z" />
              </g>
            ) : (
              <g className="crash-rocket">
                <path d="M-5 10 L0 22 L5 10 Z" className="crash-rocket__flame" />
                <path d="M0 -16 C 7 -9, 8 2, 6 11 L-6 11 C -8 2, -7 -9, 0 -16 Z" className="crash-rocket__body" />
                <circle cy="-3" r="3" className="crash-rocket__window" />
                <path d="M-6 4 L-11 13 L-6 11 Z M6 4 L11 13 L6 11 Z" className="crash-rocket__fin" />
              </g>
            )}
          </g>
        </>
      )}
    </svg>
  );
}

function niceTicks(max: number): number[] {
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500];
  const span = max - 1;
  const step = steps.find((s) => span / s <= 4) ?? 1000;
  const out: number[] = [];
  for (let v = 1 + step; v <= max; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export function CrashPage() {
  const me = useAuth((s) => s.session?.user.id ?? '');
  const wallet = useAuth((s) => s.profile?.chips ?? 0);
  const patchProfile = useAuth((s) => s.patchProfile);
  const [state, setState] = useState<State | null>(null);
  const [amount, setAmount] = useState(1_000);
  const [auto, setAuto] = useState('');
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const loading = useRef(false);
  const narrow = useMediaQuery('(max-width: 560px)');

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const { data, error } = await supabase.rpc('crash_state');
    loading.current = false;
    if (error) {
      if (error.code === 'PGRST202') setUnavailable(true);
      return;
    }
    const s = data as State;
    s.round.crash_point = s.round.crash_point == null ? null : Number(s.round.crash_point);
    s.history = s.history.map(Number);
    s.bets = s.bets.map((b) => ({
      ...b,
      amount: Number(b.amount),
      auto_cashout: b.auto_cashout == null ? null : Number(b.auto_cashout),
      cashout_mult: b.cashout_mult == null ? null : Number(b.cashout_mult),
      payout: b.payout == null ? null : Number(b.payout),
    }));
    setState(s);
  }, []);

  const round = state?.round;
  const runAt = round ? Date.parse(round.run_at) : 0;
  const crashed = !!round?.crashed_at;
  const nowS = serverNow();
  const running = !!round && !crashed && nowS >= runAt;
  useFrame(running || (!!round && !crashed && runAt - nowS < 10_000));

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('crash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crash_bets' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crash_rounds' }, () => void load())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [load]);

  // While the rocket flies, ask the server (about twice a second) whether it has crashed;
  // otherwise check in at launch and when the next round is due.
  useEffect(() => {
    if (!round) return;
    let t = 0;
    if (running) t = window.setInterval(load, 450);
    else {
      const due = crashed ? Date.parse(round.crashed_at!) + CRASH.showSeconds * 1000 + 150 : runAt + 60;
      t = window.setTimeout(load, Math.max(50, due - serverNow()));
    }
    return () => {
      window.clearInterval(t);
      window.clearTimeout(t);
    };
  }, [round, running, crashed, runAt, load]);

  // Sounds: launch and crash.
  const sounded = useRef({ launch: 0, crash: 0 });
  useEffect(() => {
    if (!round) return;
    if (running && sounded.current.launch !== round.id) {
      sounded.current.launch = round.id;
      sound.play('deal');
    }
    if (crashed && sounded.current.crash !== round.id && serverNow() - Date.parse(round.crashed_at!) < 3000) {
      sounded.current.crash = round.id;
      sound.play('fold');
    }
  }, [round, running, crashed]);

  const ms = !round ? 0 : crashed ? crashTimeFor(round.crash_point!) : Math.max(0, nowS - runAt);
  const mult = crashed ? round!.crash_point! : running ? crashMultiplier(ms) : 1;
  const myBet = state?.bets.find((b) => b.user_id === me) ?? null;
  const betting = !!round && !crashed && nowS < runAt - 300;
  const autoNum = Number(auto) || 0;
  // A player's automatic cash-out shows as soon as the curve passes it.
  const outMult = (b: Bet) => b.cashout_mult ?? (b.auto_cashout != null && mult >= b.auto_cashout && (running || crashed) && (!crashed || b.auto_cashout < mult) ? b.auto_cashout : null);

  const place = async () => {
    if (busy || !betting) return;
    if (amount < CRASH.minBet) return toast.info(`The smallest bet is ${CRASH.minBet} chips`);
    if (amount > wallet) return toast.info("You don't have enough chips in your wallet");
    if (auto && (autoNum < 1.01 || autoNum > CRASH.maxMultiplier)) return toast.info('Auto cash-out goes from 1.01x to 1000x');
    setBusy(true);
    const { data, error } = await supabase.rpc('place_crash_bet', { p_amount: amount, p_auto: auto ? autoNum : null });
    setBusy(false);
    const r = data as { ok: boolean; reason?: string; chips?: number } | null;
    if (error || !r?.ok) {
      sound.play('error');
      if (error?.code === 'PGRST202') setUnavailable(true);
      return toast.error(
        r?.reason === 'closed'
          ? 'Too late, the rocket is launching. Catch the next one!'
          : r?.reason === 'already_in'
            ? "You're already in this round"
            : r?.reason === 'insufficient_chips'
              ? "You don't have enough chips"
              : error?.message || 'Could not place the bet',
      );
    }
    patchProfile({ chips: Number(r.chips) });
    sound.play('chips', { count: 2 });
    void load();
  };

  const cashOut = async () => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('crash_cashout');
    setBusy(false);
    const r = data as { ok: boolean; reason?: string; mult?: number; payout?: number; chips?: number; crash_point?: number } | null;
    if (error || !r?.ok) {
      if (r?.reason === 'crashed') {
        sound.play('fold');
        toast.error(`Too late, it crashed at ${fmt(Number(r.crash_point))}`);
      } else if (r?.reason !== 'already_out') toast.error(error?.message || 'Could not cash out');
      void load();
      return;
    }
    patchProfile({ chips: Number(r.chips) });
    sound.play('win');
    toast.success(`Cashed out at ${fmt(Number(r.mult))}: +${chips(r.payout)}`);
    void load();
  };

  const myOut = myBet ? outMult(myBet) : null;
  const canCash = !!myBet && running && myOut == null;
  const players = useMemo(() => state?.bets ?? [], [state]);

  const rules = (
    <>
      <p>
        Place a bet before the rocket launches (bets are open for {CRASH.bettingSeconds} seconds). Once it's flying the multiplier climbs:{' '}
        <strong>cash out</strong> any time to win your bet times the multiplier. If the rocket <strong>crashes</strong> first, the bet is lost.
      </p>
      <p>
        Set an <strong>auto cash-out</strong> (for example 2.00x) to cash out automatically the moment it gets there. Each round crashes at a
        random point decided before it starts: about half of all rounds reach 2x, 1 in 10 reaches 10x, and 3% crash straight away at 1.00x.
        Bets go from {CRASH.minBet} to {chips(CRASH.maxBet)} chips.
      </p>
    </>
  );

  return (
    <MinigameShell id="crash" rules={rules}>
      {unavailable ? (
        <section className="panel mg-unavailable">Crash is being set up. Check back soon!</section>
      ) : (
        <div className="mg-layout">
          <div className="crash-col">
            <section className="panel crash-stage">
              <div className="crash-history" aria-label="Recent crash points">
                {(state?.history ?? []).slice(0, 14).map((m, i) => (
                  <span key={i} className={clsx('crash-pill', `is-${tone(m)}`)}>
                    {fmt(m)}
                  </span>
                ))}
              </div>
              <div className="crash-view">
                <Graph ms={ms} crashed={crashed} mult={mult} tall={narrow} />
                <div className="crash-readout">
                  <AnimatePresence mode="wait">
                    {!round ? null : crashed ? (
                      <motion.div key={`c${round.id}`} className="crash-readout__crashed" initial={{ scale: 1.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                        <small>Crashed at</small>
                        <strong>{fmt(round.crash_point!)}</strong>
                      </motion.div>
                    ) : running ? (
                      <motion.div key={`r${round.id}`} className={clsx('crash-readout__mult', `is-${tone(mult)}`)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {fmt(mult)}
                      </motion.div>
                    ) : (
                      <motion.div key={`w${round.id}`} className="crash-readout__wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <small>Launching in</small>
                        <strong>{Math.max(0, (runAt - nowS) / 1000).toFixed(1)}s</strong>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </section>

            <section className="panel crash-controls">
              <div className="crash-controls__inputs">
                <BetInput value={amount} onChange={setAmount} max={Math.min(CRASH.maxBet, wallet)} min={CRASH.minBet} disabled={busy || !!myBet} />
                <label className="crash-auto">
                  <span>Auto cash-out</span>
                  <div className="crash-auto__field">
                    <input
                      className="input"
                      inputMode="decimal"
                      placeholder="Off"
                      value={auto}
                      disabled={!!myBet}
                      onChange={(e) => setAuto(e.target.value.replace(/[^0-9.]/g, '').slice(0, 7))}
                    />
                    <i>x</i>
                  </div>
                  <div className="crash-auto__quick">
                    {['1.5', '2', '5', '10'].map((v) => (
                      <button key={v} type="button" className="bet-chip" disabled={!!myBet} onClick={() => setAuto(v)}>
                        {v}x
                      </button>
                    ))}
                  </div>
                </label>
              </div>
              {canCash ? (
                <button className="btn btn--mint btn--lg crash-go is-cash" disabled={busy} onClick={() => void cashOut()}>
                  Cash out {chips(Math.floor(myBet!.amount * mult))}
                </button>
              ) : myBet ? (
                <button className="btn btn--ghost btn--lg crash-go" disabled>
                  {myOut != null
                    ? `Cashed out at ${fmt(myOut)} · +${chips(Math.floor(myBet.amount * myOut))}`
                    : crashed
                      ? `Crashed · lost ${chips(myBet.amount)}`
                      : `In for ${chips(myBet.amount)}${myBet.auto_cashout ? ` · auto ${fmt(myBet.auto_cashout)}` : ''} · waiting for launch`}
                </button>
              ) : (
                <button className="btn btn--gold btn--lg crash-go" disabled={busy || !betting || amount < CRASH.minBet || amount > wallet} onClick={() => void place()}>
                  {betting ? `Bet ${chips(amount)}` : running ? 'Next round…' : 'Next round soon…'}
                </button>
              )}
            </section>
          </div>

          <aside className="crash-side">
            <section className="panel">
              <h2 className="mg-panel-title">
                Players <small>{players.length} in</small>
              </h2>
              {players.length === 0 ? (
                <p className="muted small">Nobody's in this round yet.</p>
              ) : (
                <ul className="crash-players">
                  {players.map((b) => {
                    const out = outMult(b);
                    const lost = crashed && out == null;
                    return (
                      <li
                        key={b.user_id}
                        className={clsx('is-profile-link', b.user_id === me && 'is-me', out != null && 'is-out', lost && 'is-lost')}
                        {...profileLink(b.user_id)}
                      >
                        <Avatar avatar={b.avatar} color={b.color} size={26} />
                        <span className="crash-players__name">
                          <PlayerName name={b.user_id === me ? 'You' : b.display_name} fx={b.name_fx} club={b.club} />
                        </span>
                        <span className="crash-players__bet">{chipsShort(b.amount)}</span>
                        <span className="crash-players__res">{out != null ? `${fmt(out)} · +${chipsShort(Math.floor(b.amount * out))}` : lost ? 'Bust' : '—'}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </MinigameShell>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent } from 'framer-motion';
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
import { chips, chipsShort, timeAgo } from '../../lib/format';
import { CASE_LIMITS, CASE_TIERS, TIER_BY_ID, type CaseTier } from '../../../shared/cases';

interface Drop {
  tier: CaseTier;
  multiplier: number;
}

interface OpenResult extends Drop {
  id: number;
  prize: number;
  cost: number;
}

interface FeedRow {
  id: number;
  display_name: string;
  avatar: string;
  color: string;
  tier: CaseTier;
  multiplier: number;
  prize: number;
  created_at: string;
  user_id?: string;
  name_fx?: string | null;
  club?: string | null;
}

const STRIP = 56;
const WIN_AT = 48;
const SPIN_MS = 5200;
const FAST_MS = 1400;

/** Reel filler: real tiers, with the rarer ones shown a bit more often so the reel looks exciting. */
function fillerDrop(): Drop {
  const r = Math.random();
  const tier: CaseTier = r < 0.56 ? 'common' : r < 0.82 ? 'uncommon' : r < 0.95 ? 'rare' : 'covert';
  const t = TIER_BY_ID.get(tier)!;
  return { tier, multiplier: +(t.min + (t.max - t.min) * Math.pow(Math.random(), t.skew)).toFixed(2) };
}

function multLabel(m: number) {
  return `${m >= 10 ? m.toFixed(1) : m.toFixed(2)}x`;
}

/** The case itself, drawn as a crate in the casino's colours (the seasonal look recolours it). */
function CaseArt({ opening }: { opening: boolean }) {
  return (
    <motion.svg
      className="case-art"
      viewBox="0 0 220 170"
      aria-hidden
      animate={opening ? { rotate: [0, -3, 3, -2, 2, 0], y: [0, -4, 0] } : { rotate: 0, y: [0, -5, 0] }}
      transition={opening ? { duration: 0.6 } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <defs>
        <linearGradient id="case-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--case-a)" />
          <stop offset="1" stopColor="var(--case-b)" />
        </linearGradient>
        <linearGradient id="case-lid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--case-lid-a)" />
          <stop offset="1" stopColor="var(--case-lid-b)" />
        </linearGradient>
        <linearGradient id="case-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="0.5" stopColor="#f5c451" />
          <stop offset="1" stopColor="#a8761c" />
        </linearGradient>
        <radialGradient id="case-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--case-glow)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--case-glow)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="110" cy="92" rx="105" ry="70" fill="url(#case-glow)" />
      <ellipse cx="110" cy="158" rx="80" ry="8" fill="rgba(0,0,0,0.45)" />
      {/* body */}
      <rect x="30" y="62" width="160" height="90" rx="12" fill="url(#case-body)" />
      <rect x="30" y="62" width="160" height="90" rx="12" fill="none" stroke="rgba(255,255,255,0.18)" />
      {/* lid */}
      <rect x="24" y="40" width="172" height="34" rx="10" fill="url(#case-lid)" />
      <rect x="24" y="40" width="172" height="34" rx="10" fill="none" stroke="rgba(255,255,255,0.25)" />
      {/* gold straps */}
      <rect x="42" y="40" width="12" height="112" rx="3" fill="url(#case-gold)" />
      <rect x="166" y="40" width="12" height="112" rx="3" fill="url(#case-gold)" />
      {/* lock */}
      <rect x="93" y="62" width="34" height="30" rx="6" fill="url(#case-gold)" />
      <circle cx="110" cy="74" r="4.5" fill="#5a3d08" />
      <rect x="108" y="76" width="4" height="9" rx="2" fill="#5a3d08" />
        <text x="110" y="129" textAnchor="middle" fontFamily="Outfit, sans-serif" fontWeight="900" fontSize="17" letterSpacing="3" fill="rgba(255,255,255,0.85)">
      STACKD
        </text>
      {/* sparkles */}
      <path d="M190 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" fill="#ffe9a8" opacity="0.9" />
      <path d="M26 24 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill="#ffe9a8" opacity="0.7" />
    </motion.svg>
  );
}

/** One chip voucher on the reel. */
function Voucher({ drop, cost, win }: { drop: Drop; cost: number; win?: boolean }) {
  return (
    <div className={clsx('voucher', `voucher--${drop.tier}`, win && 'is-win')}>
      <span className="voucher__chip" aria-hidden>
        <i />
      </span>
      <strong className="voucher__mult">{multLabel(drop.multiplier)}</strong>
      <span className="voucher__amt">{chipsShort(Math.floor(cost * drop.multiplier))}</span>
      <span className="voucher__tier">{TIER_BY_ID.get(drop.tier)!.name}</span>
    </div>
  );
}

export function CasesPage() {
  const wallet = useAuth((s) => s.profile?.chips ?? 0);
  const patchProfile = useAuth((s) => s.patchProfile);
  const hold = useWalletHold((h) => h.hold);
  const release = useWalletHold((h) => h.release);
  const [cost, setCost] = useState(10_000);
  const [fast, setFast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [strip, setStrip] = useState<Drop[]>(() => Array.from({ length: STRIP }, fillerDrop));
  const [stripCost, setStripCost] = useState(cost);
  const [result, setResult] = useState<OpenResult | null>(null);
  const [shown, setShown] = useState<OpenResult | null>(null);
  const [history, setHistory] = useState<OpenResult[]>([]);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const reelRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const lastTick = useRef(-1);
  const itemW = useRef(116);

  const loadFeed = useCallback(async () => {
    const { data, error } = await supabase.rpc('recent_case_drops');
    if (error?.code === 'PGRST202') setUnavailable(true);
    if (data) setFeed(data as FeedRow[]);
  }, []);
  useEffect(() => {
    void loadFeed();
    const id = window.setInterval(loadFeed, 15_000);
    return () => window.clearInterval(id);
  }, [loadFeed]);
  // Never leave the wallet display holding winnings back.
  useEffect(() => release, [release]);

  // A tick as each voucher passes the marker.
  useMotionValueEvent(x, 'change', (v) => {
    const idx = Math.floor(-v / itemW.current);
    if (idx !== lastTick.current) {
      lastTick.current = idx;
      if (busy) sound.play('tick');
    }
  });

  const open = async () => {
    if (busy) return;
    if (cost < CASE_LIMITS.minCost) return toast.info(`Cases start at ${chips(CASE_LIMITS.minCost)} chips`);
    if (cost > wallet) return toast.info("You don't have enough chips in your wallet for that case");
    setBusy(true);
    setShown(null);
    sound.play('click');
    const { data, error } = await supabase.rpc('open_case', { p_cost: cost });
    const r = data as ({ ok: boolean; reason?: string; chips: number } & Partial<OpenResult>) | null;
    if (error || !r?.ok) {
      setBusy(false);
      if (error?.code === 'PGRST202') setUnavailable(true);
      toast.error(r?.reason === 'insufficient_chips' ? "You don't have enough chips for that case" : error?.message || 'Could not open the case');
      sound.play('error');
      return;
    }
    const res: OpenResult = { id: r.id!, tier: r.tier!, multiplier: Number(r.multiplier), prize: Number(r.prize), cost: Number(r.cost) };
    // Show the cost leaving the wallet now and the prize arriving when the reel stops.
    hold(res.prize);
    patchProfile({ chips: Number(r.chips) });
    // A fresh reel with the real drop at the landing spot.
    const next = Array.from({ length: STRIP }, fillerDrop);
    next[WIN_AT] = { tier: res.tier, multiplier: res.multiplier };
    const w = reelRef.current?.querySelector<HTMLElement>('.voucher')?.offsetWidth ?? 108;
    const gap = 8;
    itemW.current = w + gap;
    const view = reelRef.current?.clientWidth ?? 600;
    setStripCost(res.cost);
    setStrip(next);
    setResult(res);
    x.set(0);
    lastTick.current = -1;
    const jitter = (Math.random() - 0.5) * w * 0.7;
    const target = -(WIN_AT * itemW.current + w / 2 - view / 2 + jitter);
    await animate(x, target, { duration: (fast ? FAST_MS : SPIN_MS) / 1000, ease: [0.08, 0.82, 0.17, 1] });
    release();
    setShown(res);
    setHistory((h) => [res, ...h].slice(0, 8));
    setBusy(false);
    const net = res.prize - res.cost;
    if (res.tier === 'covert') sound.play('bigwin');
    else if (res.tier === 'rare' || net > 0) sound.play('win');
    else sound.play('chip');
    if (res.tier === 'rare' || res.tier === 'covert') void loadFeed();
  };

  const table = useMemo(
    () =>
      CASE_TIERS.map((t) => ({
        ...t,
        lo: Math.floor(cost * t.min),
        hi: Math.floor(cost * t.max),
      })),
    [cost],
  );

  const rules = (
    <>
      <p>
        Pick how much the case costs, open it, and the reel lands on a <strong>chip voucher</strong> worth a multiple of the price.
        Most cases pay back less than they cost, but rare drops pay 2x to 5x and a Covert drop pays <strong>10x to 50x</strong>.
      </p>
      <table>
        <thead>
          <tr>
            <th>Tier</th>
            <th>Chance</th>
            <th>Pays</th>
          </tr>
        </thead>
        <tbody>
          {CASE_TIERS.map((t) => (
            <tr key={t.id}>
              <td className={`tier-name tier-name--${t.id}`}>{t.name}</td>
              <td>{t.odds * 100}%</td>
              <td>
                {t.min}x – {t.max}x
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>On average a case pays back about 96% of its price. Cases cost {chips(CASE_LIMITS.minCost)} to {chips(CASE_LIMITS.maxCost)} chips.</p>
    </>
  );

  return (
    <MinigameShell id="cases" rules={rules}>
      {unavailable ? (
        <section className="panel mg-unavailable">Case Opening is being set up. Check back soon!</section>
      ) : (
        <div className="mg-layout">
          <div className="cases-col">
            <section className="panel cases-stage">
              <div className="cases-stage__case">
                <CaseArt opening={busy} />
              </div>
              <div className="reel" ref={reelRef}>
                <div className="reel__marker" aria-hidden />
                <motion.div className="reel__strip" style={{ x }}>
                  {strip.map((d, i) => (
                    <Voucher key={`${result?.id ?? 'idle'}-${i}`} drop={d} cost={stripCost} win={!busy && shown != null && i === WIN_AT} />
                  ))}
                </motion.div>
                <div className="reel__fade reel__fade--l" aria-hidden />
                <div className="reel__fade reel__fade--r" aria-hidden />
              </div>
              <div className="cases-result" aria-live="polite">
                {shown ? (
                  <motion.div
                    key={shown.id}
                    className={clsx('cases-result__card', `is-${shown.tier}`)}
                    initial={{ opacity: 0, scale: 0.8, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  >
                    <span className="cases-result__tier">{TIER_BY_ID.get(shown.tier)!.name} drop</span>
                    <strong>
                      {multLabel(shown.multiplier)} · {chips(shown.prize)} chips
                    </strong>
                    <span className={clsx('cases-result__net', shown.prize >= shown.cost ? 'is-up' : 'is-down')}>
                      {shown.prize >= shown.cost ? '+' : '−'}
                      {chips(Math.abs(shown.prize - shown.cost))}
                    </span>
                  </motion.div>
                ) : (
                  <span className="cases-result__hint">{busy ? 'Opening…' : 'Pick a price and open the case'}</span>
                )}
              </div>
            </section>

            <section className="panel cases-controls">
              <BetInput label="Case price" value={cost} onChange={setCost} max={Math.min(CASE_LIMITS.maxCost, wallet)} min={CASE_LIMITS.minCost} disabled={busy} />
              <div className="cases-controls__go">
                <label className="switch cases-fast">
                  <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} />
                  <span className="switch__track" />
                  Fast open
                </label>
                <button className="btn btn--gold btn--lg cases-open" disabled={busy || cost < CASE_LIMITS.minCost || cost > wallet} onClick={() => void open()}>
                  {busy ? 'Opening…' : `Open case · ${chips(cost)}`}
                </button>
              </div>
            </section>

            <section className="panel cases-odds">
              <h2 className="mg-panel-title">
                What's inside <small>at {chipsShort(cost)} a case</small>
              </h2>
              <ul>
                {table.map((t) => (
                  <li key={t.id} className={`odds-row odds-row--${t.id}`}>
                    <span className="odds-row__bar" />
                    <span className="odds-row__name">{t.name}</span>
                    <span className="odds-row__odds">{t.odds * 100}%</span>
                    <span className="odds-row__range">
                      {chipsShort(t.lo)} – {chipsShort(t.hi)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="cases-side">
            <section className="panel">
              <h2 className="mg-panel-title">Your last opens</h2>
              {history.length === 0 ? (
                <p className="muted small">Nothing yet. Good luck!</p>
              ) : (
                <ul className="cases-history">
                  {history.map((h) => (
                    <li key={h.id} className={`is-${h.tier}`}>
                      <span className="cases-history__dot" />
                      <span>{multLabel(h.multiplier)}</span>
                      <span className={h.prize >= h.cost ? 'is-up' : 'is-down'}>
                        {h.prize >= h.cost ? '+' : '−'}
                        {chipsShort(Math.abs(h.prize - h.cost))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel">
              <h2 className="mg-panel-title">
                Big drops <small>live</small>
              </h2>
              {feed.length === 0 ? (
                <p className="muted small">No rare drops yet. Be the first!</p>
              ) : (
                <ul className="cases-feed">
                  {feed.map((f) => (
                    <li key={f.id} className={`is-${f.tier} is-profile-link`} {...profileLink(f.user_id)}>
                      <Avatar avatar={f.avatar} color={f.color} size={28} />
                      <span className="cases-feed__who">
                        <strong>
                          <PlayerName name={f.display_name} fx={f.name_fx} club={f.club} />
                        </strong>
                        <small>{timeAgo(f.created_at)}</small>
                      </span>
                      <span className="cases-feed__win">
                        <b>{multLabel(Number(f.multiplier))}</b>
                        <small>{chipsShort(f.prize)}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </MinigameShell>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import clsx from 'clsx';
import {
  CaretDownIcon,
  CheckIcon,
  FloppyDiskIcon,
  PencilSimpleIcon,
  ShieldCheckIcon,
  SignOutIcon,
  StorefrontIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { TopNav } from '../components/TopNav';
import { Avatar, Portrait } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { LegalFooter } from '../components/LegalFooter';
import { NamedIcon } from '../components/AchievementIcon';
import { supabase } from '../lib/supabase';
import { deleteAccount } from '../lib/api';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { COLORS } from '../../shared/economy';
import { PORTRAITS, portraitOf } from '../../shared/portraits';
import { BACKDROPS, FRAMES, cosmeticById, type CosmeticKind } from '../../shared/cosmetics';
import { ACHIEVEMENTS } from '../../shared/achievements';
import { chips, chipsShort } from '../lib/format';
import { sound } from '../lib/sound';

type Picker = 'portrait' | 'color' | CosmeticKind | null;

interface Tracked {
  counters: Record<string, number>;
  since: string;
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

/** Short names that fit a stat tile, by hand category (high card … royal flush). */
const HAND_SHORT = ['High card', 'Pair', 'Two pair', 'Trips', 'Straight', 'Flush', 'Full house', 'Quads', 'Str. flush', 'Royal flush'];
/** Which of the five cards make each hand: 1 and 2 are the card groups, 0 is a kicker. */
const HAND_SHAPE = ['10000', '11000', '11220', '11100', '11111', '11111', '11122', '11110', '11111', '11111'];

function BestHand({ category }: { category: number }) {
  return (
    <span className="hand-shape" aria-hidden>
      {[...HAND_SHAPE[category]].map((g, i) => (
        <i key={i} className={g === '0' ? undefined : g === '2' ? 'is-alt' : 'is-on'} />
      ))}
    </span>
  );
}

/** Achievements from smallest to biggest reward (ties: easiest tier first). */
const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, platinum: 3 } as const;
const SORTED_ACHIEVEMENTS = [...ACHIEVEMENTS].sort((a, b) => a.reward - b.reward || TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

export function ProfilePage() {
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const patchProfile = useAuth((s) => s.patchProfile);
  const signOut = useAuth((s) => s.signOut);
  const [, navigate] = useLocation();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [avatar, setAvatar] = useState(portraitOf(profile?.avatar));
  const [color, setColor] = useState(profile?.color ?? COLORS[0]);
  const [picker, setPicker] = useState<Picker>(null);
  const [saving, setSaving] = useState(false);
  const [tracked, setTracked] = useState<Tracked | null>(null);
  const [unlocked, setUnlocked] = useState<Map<string, string>>(new Map());
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name);
    setAvatar(portraitOf(profile.avatar));
    setColor(profile.color);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!profile) return;
    const [s, a, c] = await Promise.all([
      supabase.from('player_stats').select('counters, since').eq('user_id', profile.id).maybeSingle(),
      supabase.from('player_achievements').select('achievement_id, unlocked_at').eq('user_id', profile.id),
      supabase.from('player_cosmetics').select('cosmetic_id'),
    ]);
    setTracked(s.data ? { counters: (s.data.counters ?? {}) as Record<string, number>, since: s.data.since as string } : null);
    setUnlocked(new Map((a.data ?? []).map((r) => [r.achievement_id as string, r.unlocked_at as string])));
    setOwned(new Set((c.data ?? []).map((r) => r.cosmetic_id as string)));
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const c = tracked?.counters ?? {};
  const n = (k: string) => Number(c[k] ?? 0);
  const unlockedCount = useMemo(() => ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length, [unlocked]);
  const earned = useMemo(() => ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).reduce((sum, a) => sum + a.reward, 0), [unlocked]);
  const totalRewards = ACHIEVEMENTS.reduce((sum, a) => sum + a.reward, 0);
  const [focusId, setFocusId] = useState<string | null>(null);
  // Default to the locked achievement the player is closest to finishing.
  const focus = useMemo(() => {
    if (focusId) return ACHIEVEMENTS.find((a) => a.id === focusId) ?? null;
    const counters = tracked?.counters ?? {};
    const locked = ACHIEVEMENTS.filter((a) => !unlocked.has(a.id));
    locked.sort((x, y) => Number(counters[y.counter] ?? 0) / y.target - Number(counters[x.counter] ?? 0) / x.target);
    return locked[0] ?? ACHIEVEMENTS[0];
  }, [focusId, tracked, unlocked]);

  if (!profile) return <div className="page page--center"><div className="spinner" /></div>;

  const dirty = name.trim() !== profile.display_name || avatar !== portraitOf(profile.avatar) || color !== profile.color;

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('update_profile', { p_display_name: name.trim(), p_avatar: avatar, p_color: color });
      if (error) throw error;
      patchProfile(data as Partial<typeof profile>);
      sound.play('chip');
      toast.success('Profile saved. Your new look shows at tables the next time you sit down.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const equip = async (kind: CosmeticKind, id: string | null) => {
    const { data, error } = await supabase.rpc('equip_cosmetic', { p_kind: kind, p_id: id });
    if (error) return toast.error(error.message);
    const r = data as { frame: string | null; backdrop: string | null };
    patchProfile({ frame: r.frame, backdrop: r.backdrop });
    sound.play('click');
    setPicker(null);
  };

  const upgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpgrading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim(), password });
      if (error) throw error;
      toast.success('Account saved! If asked, confirm your email to finish.');
      setEmail('');
      setPassword('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpgrading(false);
    }
  };

  const remove = async () => {
    setDeleteBusy(true);
    try {
      await deleteAccount();
      await signOut().catch(() => undefined);
      toast.info('Your account and its data have been deleted.');
      navigate('/auth');
    } catch (e) {
      toast.error((e as Error).message || 'Could not delete the account');
      setDeleteBusy(false);
    }
  };

  const frame = cosmeticById(profile.frame);
  const backdrop = cosmeticById(profile.backdrop);
  const lifetime = [
    { label: 'Chips', value: chipsShort(profile.chips) },
    { label: 'Hands played', value: chips(profile.hands_played) },
    { label: 'Hands won', value: chips(profile.hands_won) },
    { label: 'Win rate', value: pct(profile.hands_won, profile.hands_played) },
    { label: 'Biggest pot', value: chipsShort(profile.biggest_pot) },
  ];
  const best = profile.best_hand >= 0 && profile.best_hand < HAND_SHORT.length ? profile.best_hand : -1;
  const detailed = [
    { label: 'Biggest win', value: chipsShort(n('biggest_win')), hint: 'Most profit in one hand' },
    { label: 'Showdowns won', value: pct(n('showdown_wins'), n('showdowns')), hint: `${chips(n('showdown_wins'))} of ${chips(n('showdowns'))}` },
    { label: 'All-ins won', value: pct(n('allin_wins'), n('allins')), hint: `${chips(n('allin_wins'))} of ${chips(n('allins'))}` },
    { label: 'Best streak', value: `${n('best_streak') || profile.daily_streak} days`, hint: 'Daily bonus streak' },
  ];
  const since = tracked ? new Date(tracked.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  return (
    <div className="page profile">
      <TopNav />
      <main className="profile__main">
        <section className="panel profile-head">
          <div className="profile-head__id">
            <Avatar avatar={avatar} color={color} frame={profile.frame} backdrop={profile.backdrop} size={92} className="avatar--glow" />
            <div className="profile-head__text">
              <label className="profile-name">
                <input
                  className="profile-name__input"
                  value={name}
                  maxLength={20}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Display name"
                  style={{ color, width: `calc(${Math.max(name.length, 4) + 1}ch + 14px)` }}
                />
                <PencilSimpleIcon size={16} />
              </label>
              <p className="muted small">
                {profile.is_guest ? 'Guest account' : session?.user.email} · joined{' '}
                {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              </p>
              <p className="profile-head__badges">
                <span className="pill-stat">
                  <strong>{unlockedCount}</strong>/{ACHIEVEMENTS.length} achievements
                </span>
              </p>
            </div>
          </div>

          <div className="pickers">
            <button className="picker" onClick={() => setPicker('portrait')}>
              <span className="picker__face" style={{ '--c': color } as React.CSSProperties}>
                <Portrait avatar={avatar} />
              </span>
              <span className="picker__text">
                <small>Portrait</small>
                <strong>Change</strong>
              </span>
              <CaretDownIcon size={14} />
            </button>
            <button className="picker" onClick={() => setPicker('color')}>
              <span className="picker__swatch" style={{ background: color }} />
              <span className="picker__text">
                <small>Colour</small>
                <strong>{color.toUpperCase()}</strong>
              </span>
              <CaretDownIcon size={14} />
            </button>
            <button className="picker" onClick={() => setPicker('frame')}>
              <span className="picker__face" style={{ '--c': color } as React.CSSProperties}>
                <Portrait avatar={avatar} frame={profile.frame} />
              </span>
              <span className="picker__text">
                <small>Border</small>
                <strong>{frame?.name ?? 'Classic'}</strong>
              </span>
              <CaretDownIcon size={14} />
            </button>
            <button className="picker" onClick={() => setPicker('backdrop')}>
              <span className="picker__face" style={{ '--c': color } as React.CSSProperties}>
                <Portrait avatar={avatar} backdrop={profile.backdrop} />
              </span>
              <span className="picker__text">
                <small>Background</small>
                <strong>{backdrop?.name ?? 'Glow'}</strong>
              </span>
              <CaretDownIcon size={14} />
            </button>
          </div>

          {dirty && (
            <div className="profile-head__save">
              <span className="muted small">Unsaved changes</span>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setName(profile.display_name);
                  setAvatar(portraitOf(profile.avatar));
                  setColor(profile.color);
                }}
              >
                Undo
              </button>
              <button className="btn btn--gold btn--sm" disabled={saving || name.trim().length < 2} onClick={save}>
                <FloppyDiskIcon size={15} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="home-panel__head">
            <h2 className="home-panel__title">Stats</h2>
            <span className="home-panel__hint">Lifetime</span>
          </div>
          <div className="stat-grid stat-grid--6">
            {lifetime.map((s) => (
              <div key={s.label} className="stat-tile">
                <span className="stat-tile__value">{s.value}</span>
                <span className="stat-tile__label">{s.label}</span>
              </div>
            ))}
            <div className="stat-tile" title={best >= 0 ? HAND_SHORT[best] : undefined}>
              <span className="stat-tile__value">{best >= 0 ? HAND_SHORT[best] : '—'}</span>
              <span className="stat-tile__label stat-tile__label--hand">
                Best hand {best >= 0 && <BestHand category={best} />}
              </span>
            </div>
          </div>
          <div className="home-panel__head profile__subhead">
            <h3 className="profile__h3">Play style</h3>
            <span className="home-panel__hint">{since ? `Since ${since}` : 'Starts with your next hand'}</span>
          </div>
          <div className="stat-grid stat-grid--4">
            {detailed.map((s) => (
              <div key={s.label} className="stat-tile" title={s.hint}>
                <span className="stat-tile__value">{s.value}</span>
                <span className="stat-tile__label">{s.label}</span>
                <span className="stat-tile__hint">{s.hint}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="home-panel__head">
            <h2 className="home-panel__title">Achievements</h2>
            <span className="home-panel__hint">
              {unlockedCount} of {ACHIEVEMENTS.length} · {chipsShort(earned)} of {chipsShort(totalRewards)} chips earned
            </span>
          </div>
          <div className="achv-bar">
            <span style={{ width: `${(unlockedCount / ACHIEVEMENTS.length) * 100}%` }} />
          </div>
          {focus && (
            <div className={clsx('achv-detail', `tier-${focus.tier}`, unlocked.has(focus.id) && 'is-on')}>
              <span className="achv__medal">
                <NamedIcon name={focus.icon} size={22} weight={unlocked.has(focus.id) ? 'fill' : 'duotone'} />
              </span>
              <span className="achv-detail__text">
                <strong>{focus.name}</strong>
                <small>{focus.description}</small>
              </span>
              <span className="achv-detail__status">
                {unlocked.has(focus.id) ? (
                  <>
                    <CheckIcon size={12} weight="bold" /> {new Date(unlocked.get(focus.id)!).toLocaleDateString()}
                  </>
                ) : (
                  `${chipsShort(Math.min(n(focus.counter), focus.target))} / ${chipsShort(focus.target)}`
                )}
                <em>+{chips(focus.reward)} chips</em>
              </span>
            </div>
          )}
          <ul className="achv-grid">
            {SORTED_ACHIEVEMENTS.map((a) => {
              const at = unlocked.get(a.id);
              const progress = Math.min(n(a.counter), a.target);
              return (
                <li key={a.id}>
                  <button
                    className={clsx('achv', `tier-${a.tier}`, at ? 'is-on' : 'is-locked', focus?.id === a.id && 'is-focus')}
                    onClick={() => setFocusId(a.id)}
                    aria-pressed={focus?.id === a.id}
                    title={a.description}
                  >
                    <span className="achv__medal">
                      <NamedIcon name={a.icon} size={20} weight={at ? 'fill' : 'duotone'} />
                    </span>
                    <strong>{a.name}</strong>
                    {at ? (
                      <em>
                        <CheckIcon size={10} weight="bold" /> +{chipsShort(a.reward)}
                      </em>
                    ) : (
                      <>
                        <span className="achv__progress">
                          <span style={{ width: `${(progress / a.target) * 100}%` }} />
                        </span>
                        <em className="achv__reward">+{chipsShort(a.reward)}</em>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {profile.is_guest && (
          <section className="panel">
            <h2 className="home-panel__title">
              <ShieldCheckIcon size={18} /> Save your account
            </h2>
            <p className="muted small">Add an email and password to keep your chips and stats, sign in on any device and get on the leaderboard.</p>
            <form className="form" onSubmit={upgrade}>
              <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input
                className="input"
                type="password"
                placeholder="Password (6+ characters)"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button className="btn btn--mint" disabled={upgrading}>
                {upgrading ? 'Saving…' : 'Save account'}
              </button>
            </form>
          </section>
        )}

        <section className="panel profile-account">
          <button
            className="btn btn--ghost"
            onClick={async () => {
              if (profile.is_guest && !window.confirm('Signing out of a guest account loses it forever unless you save it first. Sign out?')) return;
              await signOut();
              navigate('/auth');
            }}
          >
            <SignOutIcon size={16} /> Sign out
          </button>
          <button className="btn btn--ghost btn--danger" onClick={() => setDeleting(true)}>
            <TrashIcon size={16} /> Delete account
          </button>
        </section>
        <LegalFooter />
      </main>

      <Modal open={picker === 'portrait'} onClose={() => setPicker(null)} title="Choose your portrait" wide>
        <div className="portrait-grid">
          {PORTRAITS.map((p) => (
            <button
              key={p}
              className={clsx('portrait-pick', p === avatar && 'is-on')}
              style={{ '--c': color } as React.CSSProperties}
              onClick={() => {
                setAvatar(p);
                sound.play('click');
              }}
              aria-label={`Portrait ${p}`}
            >
              <Portrait avatar={p} backdrop={profile.backdrop} />
            </button>
          ))}
        </div>
        <button className="btn btn--gold btn--block picker-done" onClick={() => setPicker(null)}>
          Done
        </button>
      </Modal>

      <Modal open={picker === 'color'} onClose={() => setPicker(null)} title="Choose your colour">
        <p className="muted small">Your name, chat messages and default ring use this colour.</p>
        <div className="color-grid color-grid--big">
          {COLORS.map((col) => (
            <button
              key={col}
              className={clsx('color-pick', col === color && 'is-on')}
              style={{ background: col }}
              onClick={() => {
                setColor(col);
                sound.play('click');
              }}
              aria-label={`Colour ${col}`}
            />
          ))}
        </div>
        <button className="btn btn--gold btn--block picker-done" onClick={() => setPicker(null)}>
          Done
        </button>
      </Modal>

      {(picker === 'frame' || picker === 'backdrop') && (
        <Modal open onClose={() => setPicker(null)} title={picker === 'frame' ? 'Your borders' : 'Your backgrounds'}>
          <div className="owned-grid">
            {[null, ...(picker === 'frame' ? FRAMES : BACKDROPS)].map((item) => {
              const id = item?.id ?? null;
              const has = !item || owned.has(item.id);
              const on = (picker === 'frame' ? profile.frame : profile.backdrop) === id || (!id && !(picker === 'frame' ? profile.frame : profile.backdrop));
              return (
                <button
                  key={id ?? 'default'}
                  className={clsx('owned-pick', on && 'is-on', !has && 'is-locked')}
                  disabled={!has}
                  onClick={() => equip(picker, id)}
                >
                  <Avatar
                    avatar={avatar}
                    color={color}
                    frame={picker === 'frame' ? id : profile.frame}
                    backdrop={picker === 'backdrop' ? id : profile.backdrop}
                    size={64}
                  />
                  <span>{item?.name ?? (picker === 'frame' ? 'Classic' : 'Glow')}</span>
                  {!has && <small>{chipsShort(item!.price)}</small>}
                </button>
              );
            })}
          </div>
          <Link href="/shop" className="btn btn--gold btn--block picker-done">
            <StorefrontIcon size={16} weight="fill" /> Visit the Cosmetic Shop
          </Link>
        </Modal>
      )}

      <Modal open={deleting} onClose={() => !deleteBusy && setDeleting(false)} title="Delete your account?">
        <div className="form">
          <p className="muted">
            This permanently deletes your account, chips, stats, achievements, cosmetic items and chat messages. You'll leave any
            table you're sitting at. This can't be undone.
          </p>
          <label className="field">
            <span className="field__label">Type DELETE to confirm</span>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" />
          </label>
          <button className="btn btn--danger-solid btn--block" disabled={confirmText.trim().toUpperCase() !== 'DELETE' || deleteBusy} onClick={remove}>
            {deleteBusy ? 'Deleting…' : 'Delete my account forever'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

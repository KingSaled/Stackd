import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import clsx from 'clsx';
import { LogOut, Save, ShieldCheck, Trophy, Layers, Percent, Coins, Gem, Hand } from 'lucide-react';
import { TopNav } from '../components/TopNav';
import { Avatar } from '../components/Avatar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { AVATARS, COLORS } from '../../shared/economy';
import { HAND_CATEGORIES } from '../../shared/poker/evaluator';
import { chips } from '../lib/format';
import { sound } from '../lib/sound';

export function ProfilePage() {
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const patchProfile = useAuth((s) => s.patchProfile);
  const signOut = useAuth((s) => s.signOut);
  const [, navigate] = useLocation();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? AVATARS[0]);
  const [color, setColor] = useState(profile?.color ?? COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name);
    setAvatar(profile.avatar);
    setColor(profile.color);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return <div className="page page--center"><div className="spinner" /></div>;

  const dirty = name !== profile.display_name || avatar !== profile.avatar || color !== profile.color;
  const winRate = profile.hands_played ? Math.round((profile.hands_won / profile.hands_played) * 100) : 0;

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('update_profile', { p_display_name: name.trim(), p_avatar: avatar, p_color: color });
      if (error) throw error;
      patchProfile(data as Partial<typeof profile>);
      sound.play('chip');
      toast.success('Profile saved — your new look applies when you next sit down');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
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

  const stats = [
    { icon: Coins, label: 'Chips', value: chips(profile.chips) },
    { icon: Layers, label: 'Hands played', value: chips(profile.hands_played) },
    { icon: Trophy, label: 'Hands won', value: chips(profile.hands_won) },
    { icon: Percent, label: 'Win rate', value: `${winRate}%` },
    { icon: Gem, label: 'Biggest pot', value: chips(profile.biggest_pot) },
    { icon: Hand, label: 'Best hand', value: profile.best_hand >= 0 ? HAND_CATEGORIES[profile.best_hand] : '—' },
  ];

  return (
    <div className="page profile">
      <TopNav />
      <main className="profile__main">
        <section className="panel profile__card">
          <div className="profile__hero">
            <Avatar emoji={avatar} color={color} size={88} className="avatar--glow" />
            <div>
              <h1>{name || profile.display_name}</h1>
              <p className="muted small">
                {profile.is_guest ? 'Guest account' : session?.user.email} · joined{' '}
                {new Date(profile.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <label className="field">
            <span className="field__label">Display name</span>
            <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field">
            <span className="field__label">Avatar</span>
            <div className="avatar-grid">
              {AVATARS.map((a) => (
                <button key={a} className={clsx('avatar-pick', a === avatar && 'is-on')} onClick={() => setAvatar(a)} aria-label={`Avatar ${a}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field__label">Color</span>
            <div className="color-grid">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={clsx('color-pick', c === color && 'is-on')}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          <button className="btn btn--gold" disabled={!dirty || saving || name.trim().length < 2} onClick={save}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save profile'}
          </button>
        </section>

        <section className="panel">
          <h3>Your stats</h3>
          <div className="stats">
            {stats.map((s) => (
              <div key={s.label} className="stat">
                <s.icon size={18} />
                <span className="stat__value">{s.value}</span>
                <span className="stat__label">{s.label}</span>
              </div>
            ))}
          </div>
          <p className="muted small">Daily streak: {profile.daily_streak} day{profile.daily_streak === 1 ? '' : 's'} · Reloads used: {profile.reload_count}</p>
        </section>

        {profile.is_guest && (
          <section className="panel">
            <h3>
              <ShieldCheck size={18} /> Save your account
            </h3>
            <p className="muted small">Add an email and password to keep your chips and stats and sign in from any device.</p>
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

        <button
          className="btn btn--ghost"
          onClick={async () => {
            if (profile.is_guest && !window.confirm('Signing out of a guest account loses it forever unless you save it first. Sign out?')) return;
            await signOut();
            navigate('/auth');
          }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </main>
    </div>
  );
}

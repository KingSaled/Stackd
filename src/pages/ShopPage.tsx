import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { CheckIcon, CoinsIcon, LockSimpleIcon, SparkleIcon, StorefrontIcon } from '@phosphor-icons/react';
import { TopNav } from '../components/TopNav';
import { Avatar } from '../components/Avatar';
import { LegalFooter } from '../components/LegalFooter';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { sound } from '../lib/sound';
import { chips, chipsShort } from '../lib/format';
import { BACKDROPS, FRAMES, cosmeticById, type Cosmetic, type CosmeticKind } from '../../shared/cosmetics';

export const RARITY = ['', 'Common', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;

export function ShopPage() {
  const profile = useAuth((s) => s.profile);
  const patchProfile = useAuth((s) => s.patchProfile);
  const [tab, setTab] = useState<CosmeticKind>('frame');
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ frame: string | null; backdrop: string | null } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadOwned = useCallback(async () => {
    const { data } = await supabase.from('player_cosmetics').select('cosmetic_id');
    if (data) setOwned(new Set(data.map((r) => r.cosmetic_id as string)));
  }, []);

  useEffect(() => {
    void loadOwned();
  }, [loadOwned]);

  // A pending "tap again to confirm" expires after a few seconds.
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(null), 3500);
    return () => clearTimeout(t);
  }, [confirming]);

  const equipped = { frame: profile?.frame ?? null, backdrop: profile?.backdrop ?? null };
  const look = preview ?? equipped;
  const items = tab === 'frame' ? FRAMES : BACKDROPS;
  const ownedCount = useMemo(() => [...owned].filter((id) => cosmeticById(id)).length, [owned]);

  if (!profile) return <div className="page page--center"><div className="spinner" /></div>;

  const show = (item: Cosmetic | null, kind: CosmeticKind) =>
    setPreview({ ...look, [kind]: item ? item.id : null });

  const buy = async (item: Cosmetic) => {
    if (confirming !== item.id) {
      setConfirming(item.id);
      show(item, item.kind);
      sound.play('click');
      return;
    }
    setConfirming(null);
    setBusy(item.id);
    try {
      const { data, error } = await supabase.rpc('buy_cosmetic', { p_id: item.id });
      if (error) throw error;
      const r = data as { ok: boolean; reason?: string; chips?: number; frame?: string | null; backdrop?: string | null };
      if (r.ok) {
        patchProfile({ chips: Number(r.chips), frame: r.frame ?? null, backdrop: r.backdrop ?? null });
        setOwned((o) => new Set(o).add(item.id));
        setPreview(null);
        sound.play('chips', { count: 6 });
        toast.success(`${item.name} is yours and equipped!`);
      } else if (r.reason === 'insufficient_chips') {
        toast.error(`You need ${chips(item.price - profile.chips)} more chips in your wallet`);
      } else if (r.reason === 'owned') {
        setOwned((o) => new Set(o).add(item.id));
        toast.info('You already own that');
      } else {
        toast.error('That item is not available');
      }
    } catch (e) {
      toast.error((e as Error).message || 'Purchase failed');
    } finally {
      setBusy(null);
    }
  };

  const equip = async (kind: CosmeticKind, id: string | null) => {
    setBusy(id ?? `none-${kind}`);
    try {
      const { data, error } = await supabase.rpc('equip_cosmetic', { p_kind: kind, p_id: id });
      if (error) throw error;
      const r = data as { frame: string | null; backdrop: string | null };
      patchProfile({ frame: r.frame, backdrop: r.backdrop });
      setPreview(null);
      sound.play('click');
    } catch (e) {
      toast.error((e as Error).message || 'Could not equip that');
    } finally {
      setBusy(null);
    }
  };

  const current = tab === 'frame' ? equipped.frame : equipped.backdrop;

  return (
    <div className="page shop">
      <TopNav />
      <main className="shop__main">
        <section className="shop-hero">
          <div className="shop-hero__copy">
            <span className="shop-hero__eyebrow">
              <StorefrontIcon size={16} weight="fill" /> Cosmetic Shop
            </span>
            <h1>Make your seat stand out</h1>
            <p className="muted">
              Borders and backgrounds show on your avatar everywhere: at the table, in the lobby and on the leaderboard. Bought
              with play chips only.
            </p>
            <div className="shop-hero__wallet">
              <CoinsIcon size={18} weight="fill" />
              <span>{chips(profile.chips)}</span>
              <small>in your wallet · {ownedCount}/{FRAMES.length + BACKDROPS.length} owned</small>
            </div>
          </div>
          <motion.div className="shop-hero__preview" key={`${look.frame}-${look.backdrop}`} initial={{ scale: 0.92 }} animate={{ scale: 1 }}>
            <Avatar avatar={profile.avatar} color={profile.color} frame={look.frame} backdrop={look.backdrop} size={132} />
            <span className="shop-hero__name" style={{ color: profile.color }}>
              {profile.display_name}
            </span>
            {preview && (
              <button className="link-btn" onClick={() => setPreview(null)}>
                Back to my look
              </button>
            )}
          </motion.div>
        </section>

        <div className="segmented segmented--full shop__tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'frame'} className={clsx(tab === 'frame' && 'is-on')} onClick={() => setTab('frame')}>
            Borders
          </button>
          <button role="tab" aria-selected={tab === 'backdrop'} className={clsx(tab === 'backdrop' && 'is-on')} onClick={() => setTab('backdrop')}>
            Backgrounds
          </button>
        </div>

        <ul className="shop-grid">
          <li className={clsx('shop-item', 'tier-0', !current && 'is-equipped')} onMouseEnter={() => show(null, tab)}>
            <button className="shop-item__look" onClick={() => show(null, tab)} aria-label="Preview the default look">
              <Avatar
                avatar={profile.avatar}
                color={profile.color}
                frame={tab === 'frame' ? null : look.frame}
                backdrop={tab === 'backdrop' ? null : look.backdrop}
                size={84}
              />
            </button>
            <div className="shop-item__info">
              <span className="shop-item__rarity">Free</span>
              <strong>{tab === 'frame' ? 'Classic ring' : 'Signature glow'}</strong>
              <p>{tab === 'frame' ? 'A simple ring in your profile colour.' : 'A soft glow in your profile colour.'}</p>
            </div>
            <div className="shop-item__action">
              {!current ? (
                <span className="shop-item__state">
                  <CheckIcon size={14} weight="bold" /> Equipped
                </span>
              ) : (
                <button className="btn btn--ghost btn--sm btn--block" disabled={!!busy} onClick={() => equip(tab, null)}>
                  Use default
                </button>
              )}
            </div>
          </li>

          {items.map((item) => {
            const has = owned.has(item.id);
            const on = current === item.id;
            const short = profile.chips < item.price;
            return (
              <li
                key={item.id}
                className={clsx('shop-item', `tier-${item.tier}`, on && 'is-equipped', has && 'is-owned')}
                onMouseEnter={() => show(item, item.kind)}
              >
                <button className="shop-item__look" onClick={() => show(item, item.kind)} aria-label={`Preview ${item.name}`}>
                  <Avatar
                    avatar={profile.avatar}
                    color={profile.color}
                    frame={item.kind === 'frame' ? item.id : look.frame}
                    backdrop={item.kind === 'backdrop' ? item.id : look.backdrop}
                    size={84}
                  />
                  {item.animated && (
                    <span className="shop-item__anim">
                      <SparkleIcon size={11} weight="fill" /> Animated
                    </span>
                  )}
                </button>
                <div className="shop-item__info">
                  <span className="shop-item__rarity">{RARITY[item.tier]}</span>
                  <strong>{item.name}</strong>
                  <p>{item.blurb}</p>
                </div>
                <div className="shop-item__action">
                  {on ? (
                    <span className="shop-item__state">
                      <CheckIcon size={14} weight="bold" /> Equipped
                    </span>
                  ) : has ? (
                    <button className="btn btn--ghost btn--sm btn--block" disabled={!!busy} onClick={() => equip(item.kind, item.id)}>
                      Equip
                    </button>
                  ) : (
                    <button
                      className={clsx('btn btn--sm btn--block', confirming === item.id ? 'btn--mint' : 'btn--gold')}
                      disabled={short || !!busy}
                      onClick={() => buy(item)}
                    >
                      {short ? (
                        <>
                          <LockSimpleIcon size={14} weight="bold" /> {chipsShort(item.price)}
                        </>
                      ) : confirming === item.id ? (
                        `Confirm ${chipsShort(item.price)}`
                      ) : (
                        <>
                          <CoinsIcon size={14} weight="fill" /> {chips(item.price)}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="muted small shop__note">
          Changes show at tables the next time you sit down. Items have no cash value and can't be traded or refunded.
        </p>
        <LegalFooter />
      </main>
    </div>
  );
}

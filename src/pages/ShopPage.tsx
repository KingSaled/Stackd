import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CheckIcon, CoinsIcon, CrownSimpleIcon, LockSimpleIcon, SparkleIcon, StorefrontIcon, UsersIcon } from '@phosphor-icons/react';
import { TopNav } from '../components/TopNav';
import { Avatar } from '../components/Avatar';
import { LegalFooter } from '../components/LegalFooter';
import { PlayerName } from '../components/flair/PlayerName';
import { ClubCard } from '../components/flair/ClubCard';
import { supabase } from '../lib/supabase';
import { syncCatalog } from '../lib/api';
import { useAuth, type Profile } from '../store/auth';
import { toast } from '../store/toast';
import { sound } from '../lib/sound';
import { chips, chipsShort } from '../lib/format';
import { COSMETICS_BY_KIND, RARITY, cosmeticById, type Cosmetic, type CosmeticKind } from '../../shared/cosmetics';


const TABS: { kind: CosmeticKind; label: string; short: string }[] = [
  { kind: 'frame', label: 'Borders', short: 'Borders' },
  { kind: 'backdrop', label: 'Backgrounds', short: 'Backgrounds' },
  { kind: 'name', label: 'Name styles', short: 'Names' },
  { kind: 'club', label: 'Stackd Club', short: 'Club' },
];

const BLURB: Record<CosmeticKind, string> = {
  frame: 'Borders ring your avatar everywhere: tables, chat, the leaderboard and your profile card.',
  backdrop: 'Backgrounds fill the circle behind your portrait wherever your avatar shows.',
  name: 'Name styles change how your name looks to everyone: at tables, in chat, on the leaderboard and in every minigame.',
  club: 'Pure status. Your card’s badge sits next to your name everywhere, and your profile shows the full card with your member number.',
};

const DEFAULT_LABEL: Record<CosmeticKind, [string, string]> = {
  frame: ['Classic ring', 'A simple ring in your profile colour'],
  backdrop: ['Colour glow', 'A soft glow in your profile colour'],
  name: ['Plain name', 'Your name in your profile colour'],
  club: ['No card', 'Hide your Stackd Club badge'],
};

const slotOf = (kind: CosmeticKind) => ({ frame: 'frame', backdrop: 'backdrop', name: 'name_fx', club: 'club' })[kind] as 'frame' | 'backdrop' | 'name_fx' | 'club';

type Look = Pick<Profile, 'frame' | 'backdrop' | 'name_fx' | 'club'>;

export function ShopPage() {
  const profile = useAuth((s) => s.profile);
  const patchProfile = useAuth((s) => s.patchProfile);
  const [tab, setTab] = useState<CosmeticKind>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return (TABS.find((x) => x.kind === t)?.kind ?? 'frame') as CosmeticKind;
  });
  const [owned, setOwned] = useState<Map<string, string>>(new Map());
  const [club, setClub] = useState<{ counts: Record<string, number>; mine: Record<string, number> }>({ counts: {}, mine: {} });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadOwned = useCallback(async () => {
    const { data } = await supabase.from('player_cosmetics').select('cosmetic_id, bought_at');
    if (data) setOwned(new Map(data.map((r) => [r.cosmetic_id as string, r.bought_at as string])));
  }, []);

  const loadClub = useCallback(async () => {
    const { data, error } = await supabase.rpc('club_stats');
    if (!error && data) {
      const d = data as { counts?: Record<string, number>; mine?: Record<string, number> };
      setClub({ counts: d.counts ?? {}, mine: d.mine ?? {} });
    }
  }, []);

  useEffect(() => {
    void loadOwned();
    void loadClub();
  }, [loadOwned, loadClub]);

  // A pending "tap again to confirm" expires after a few seconds.
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(null), 3500);
    return () => clearTimeout(t);
  }, [confirming]);

  const items = COSMETICS_BY_KIND[tab];
  // Two shelves: the classic range, and the High Roller range from 1M up.
  const groups = useMemo(
    () =>
      [
        { key: 'classic', label: 'Classic', note: '', list: items.filter((i) => i.tier <= 5) },
        { key: 'high', label: 'High Roller', note: '1,000,000 chips and up', list: items.filter((i) => i.tier >= 6) },
      ].filter((g) => g.list.length > 0),
    [items],
  );
  const ownedCount = useMemo(() => [...owned.keys()].filter((id) => cosmeticById(id)).length, [owned]);
  const totalCount = Object.values(COSMETICS_BY_KIND).reduce((n, list) => n + list.length, 0);

  if (!profile) return <div className="page page--center"><div className="spinner" /></div>;

  const look: Look = { frame: profile.frame ?? null, backdrop: profile.backdrop ?? null, name_fx: profile.name_fx ?? null, club: profile.club ?? null };
  const current = look[slotOf(tab)] ?? null;

  const applyLook = (r: Partial<Record<'frame' | 'backdrop' | 'name_fx' | 'club', string | null | undefined>>) =>
    patchProfile({
      ...(r.frame !== undefined ? { frame: r.frame } : {}),
      ...(r.backdrop !== undefined ? { backdrop: r.backdrop } : {}),
      ...(r.name_fx !== undefined ? { name_fx: r.name_fx } : {}),
      ...(r.club !== undefined ? { club: r.club } : {}),
    });

  const buy = async (item: Cosmetic) => {
    if (confirming !== item.id) {
      setConfirming(item.id);
      sound.play('click');
      return;
    }
    setConfirming(null);
    setBusy(item.id);
    try {
      type BuyResult = { ok: boolean; reason?: string; chips?: number; frame?: string | null; backdrop?: string | null; name_fx?: string | null; club?: string | null };
      const call = async () => {
        const { data, error } = await supabase.rpc('buy_cosmetic', { p_id: item.id });
        if (error) throw error;
        return data as BuyResult;
      };
      let r = await call();
      // A brand-new item the database hasn't heard of yet: have the server add it, then try again.
      if (!r.ok && r.reason === 'not_found') {
        await syncCatalog().catch(() => null);
        r = await call();
      }
      if (r.ok) {
        patchProfile({ chips: Number(r.chips) });
        applyLook(r);
        setOwned((o) => new Map(o).set(item.id, new Date().toISOString()));
        sound.play('chips', { count: item.tier >= 6 ? 12 : 6 });
        toast.success(item.kind === 'club' ? `Welcome to the Stackd Club. Your ${item.name} is ready.` : `${item.name} is yours and equipped!`);
        if (item.kind === 'club') void loadClub();
      } else if (r.reason === 'insufficient_chips') {
        toast.error(`You need ${chips(item.price - profile.chips)} more chips in your wallet`);
      } else if (r.reason === 'owned') {
        setOwned((o) => new Map(o).set(item.id, o.get(item.id) ?? new Date().toISOString()));
        toast.info('You already own that');
      } else {
        toast.error('That item is not available yet. Ask the site owner to update the database.');
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
      applyLook(data as Look);
      sound.play('click');
    } catch (e) {
      toast.error((e as Error).message || 'Could not equip that');
    } finally {
      setBusy(null);
    }
  };

  const [defLabel, defHint] = DEFAULT_LABEL[tab];

  const preview = (item: Cosmetic) => {
    if (item.kind === 'name')
      return (
        <div className="shop-name">
          <Avatar avatar={profile.avatar} color={profile.color} frame={look.frame} backdrop={look.backdrop} size={34} />
          <span className="shop-name__big">
            <PlayerName name={profile.display_name} fx={item.id} club={look.club} />
          </span>
        </div>
      );
    if (item.kind === 'club')
      return <ClubCard id={item.id} holder={profile.display_name} number={club.mine[item.id] ?? null} since={owned.get(item.id) ?? null} />;
    return (
      <Avatar
        avatar={profile.avatar}
        color={profile.color}
        frame={item.kind === 'frame' ? item.id : look.frame}
        backdrop={item.kind === 'backdrop' ? item.id : look.backdrop}
        size={84}
      />
    );
  };

  return (
    <div className="page shop">
      <TopNav />
      <main className="shop__main">
        <header className="shop-head">
          <div className="shop-head__title">
            <StorefrontIcon size={22} weight="fill" />
            <div>
              <h1>Cosmetic Shop</h1>
              <p className="muted small">Bought with play chips only. Show off at every table.</p>
            </div>
          </div>
          <div className="shop-head__wallet">
            <CoinsIcon size={16} weight="fill" />
            <strong>{chips(profile.chips)}</strong>
            <small>
              {ownedCount}/{totalCount} owned
            </small>
          </div>
        </header>

        <div className="shop-bar">
          <div className="segmented segmented--full shop__tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.kind}
                role="tab"
                aria-selected={tab === t.kind}
                className={clsx(tab === t.kind && 'is-on', t.kind === 'club' && 'shop__tab--club')}
                onClick={() => {
                  setTab(t.kind);
                  setConfirming(null);
                }}
              >
                {t.kind === 'club' && <CrownSimpleIcon size={14} weight="fill" />}
                <span className="shop__tab-full">{t.label}</span>
                <span className="shop__tab-short">{t.short}</span>
              </button>
            ))}
          </div>
          <button className={clsx('shop-default', !current && 'is-on')} disabled={!current || !!busy} onClick={() => equip(tab, null)} title={defHint}>
            {tab === 'name' || tab === 'club' ? (
              <span className="shop-default__name">
                <PlayerName name={profile.display_name} color={profile.color} club={tab === 'name' ? look.club : null} />
              </span>
            ) : (
              <Avatar avatar={profile.avatar} color={profile.color} frame={tab === 'frame' ? null : look.frame} backdrop={tab === 'backdrop' ? null : look.backdrop} size={30} />
            )}
            <span>
              <small>Free</small>
              {!current ? (
                <strong>
                  <CheckIcon size={12} weight="bold" /> {defLabel}
                </strong>
              ) : (
                <strong>Use {defLabel.toLowerCase()}</strong>
              )}
            </span>
          </button>
        </div>

        <p className="muted small shop__blurb">{BLURB[tab]}</p>

        {groups.map((g) => (
          <section key={g.key} className={clsx('shop-tier', `shop-tier--${g.key}`)}>
            {tab !== 'club' && (
              <h2 className="shop-tier__head">
                <span>{g.label}</span>
                {g.note && <em>{g.note}</em>}
              </h2>
            )}
            <ul className={clsx('shop-grid', tab === 'club' && 'shop-grid--club', tab === 'name' && 'shop-grid--names')}>
              {g.list.map((item) => {
                  const has = owned.has(item.id);
                  const on = current === item.id;
                  const short = profile.chips < item.price;
                  return (
                    <li key={item.id} className={clsx('shop-item', `tier-${item.tier}`, `shop-item--${item.kind}`, on && 'is-equipped', has && 'is-owned')}>
                      <div className="shop-item__look">
                        {preview(item)}
                        {item.animated && item.kind !== 'club' && (
                          <span className="shop-item__anim">
                            <SparkleIcon size={11} weight="fill" /> Animated
                          </span>
                        )}
                      </div>
                      <div className="shop-item__info">
                        <span className="shop-item__rarity">{item.kind === 'club' ? 'Stackd Club' : RARITY[item.tier]}</span>
                        <strong>{item.name}</strong>
                        <p>{item.blurb}</p>
                        {item.kind === 'club' && (
                          <span className="shop-item__members">
                            <UsersIcon size={12} weight="bold" />
                            {(club.counts[item.id] ?? 0) === 0 ? 'No members yet. Be the first.' : `${chips(club.counts[item.id])} member${club.counts[item.id] === 1 ? '' : 's'}`}
                          </span>
                        )}
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
          </section>
        ))}
        <p className="muted small shop__note">
          Changes show at tables the next time you sit down. Items have no cash value and can't be traded or refunded.
        </p>
        <LegalFooter />
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { CoinsIcon, CrownSimpleIcon, DiamondIcon, MedalIcon, SpadeIcon, SparkleIcon } from '@phosphor-icons/react';
import { Modal } from '../Modal';
import { Avatar } from '../Avatar';
import { MiniCards } from '../GameSwitch';
import { PlayerName } from './PlayerName';
import { ClubCard } from './ClubCard';
import { supabase } from '../../lib/supabase';
import { chips, chipsShort } from '../../lib/format';
import { useProfileViewer } from '../../store/profileViewer';
import { useAuth } from '../../store/auth';
import { ACHIEVEMENTS } from '../../../shared/achievements';
import { cosmeticById, RARITY } from '../../../shared/cosmetics';

const HANDS = ['High card', 'Pair', 'Two pair', 'Trips', 'Straight', 'Flush', 'Full house', 'Quads', 'Straight flush', 'Royal flush'];

export interface PublicProfile {
  id: string;
  display_name: string;
  avatar: string;
  color: string;
  frame: string | null;
  backdrop: string | null;
  name_fx: string | null;
  club: string | null;
  club_card: { id: string; since: string; number: number } | null;
  is_guest: boolean;
  created_at: string;
  net_worth: number | null;
  rank: number | null;
  collection_value: number;
  items_owned: number;
  achievements: number;
  hands_played: number;
  hands_won: number;
  biggest_pot: number;
  best_hand: number;
  bj_hands: number;
  bj_wins: number;
  bj_blackjacks: number;
  bj_net: number;
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

/** The pop-up profile card for any player: their look, net worth and headline stats. */
export function ProfileViewer() {
  const userId = useProfileViewer((s) => s.userId);
  const close = useProfileViewer((s) => s.close);
  const me = useAuth((s) => s.session?.user.id);
  const [data, setData] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    if (!userId) return;
    let live = true;
    setState('loading');
    setData(null);
    void supabase.rpc('public_profile', { p_id: userId }).then(({ data: d, error }) => {
      if (!live) return;
      if (error || !d) {
        setState('missing');
        return;
      }
      const p = d as PublicProfile;
      setData({
        ...p,
        net_worth: p.net_worth == null ? null : Number(p.net_worth),
        collection_value: Number(p.collection_value ?? 0),
        biggest_pot: Number(p.biggest_pot ?? 0),
        bj_net: Number(p.bj_net ?? 0),
        club_card: p.club_card ? { ...p.club_card, number: Number(p.club_card.number) } : null,
      });
      setState('ready');
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const p = data;
  const club = p?.club_card && cosmeticById(p.club_card.id);
  const frame = cosmeticById(p?.frame);
  const backdrop = cosmeticById(p?.backdrop);
  const style = cosmeticById(p?.name_fx);
  const isMe = !!p && p.id === me;

  return (
    <Modal open={!!userId} onClose={close} className="pv-modal" title={isMe ? 'Your profile' : 'Player profile'}>
      {state === 'loading' && (
        <div className="pv-loading">
          <div className="spinner" />
        </div>
      )}
      {state === 'missing' && <p className="muted">This player's profile isn't available.</p>}
      {p && state === 'ready' && (
        <div className="pv">
          <header className="pv-head" style={{ '--c': p.color } as React.CSSProperties}>
            <Avatar avatar={p.avatar} color={p.color} frame={p.frame} backdrop={p.backdrop} size={96} className="avatar--glow" />
            <div className="pv-head__text">
              <h3 className="pv-name">
                <PlayerName name={p.display_name} fx={p.name_fx} club={p.club} color={p.color} />
              </h3>
              <p className="muted small">
                {p.is_guest ? 'Guest' : 'Member'} since {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              </p>
              <div className="pv-pills">
                {p.rank != null && (
                  <span className={clsx('pv-pill', p.rank <= 3 && 'is-top')}>
                    <CrownSimpleIcon size={13} weight="fill" /> #{p.rank} on the leaderboard
                  </span>
                )}
                <span className="pv-pill">
                  <MedalIcon size={13} weight="fill" /> {p.achievements}/{ACHIEVEMENTS.length} achievements
                </span>
              </div>
            </div>
          </header>

          <div className="pv-wealth">
            <div className="pv-wealth__item pv-wealth__item--main">
              <small>Net worth</small>
              <strong>
                <CoinsIcon size={18} weight="fill" /> {p.net_worth == null ? 'Private' : chips(p.net_worth)}
              </strong>
            </div>
            <div className="pv-wealth__item">
              <small>Collection value</small>
              <strong>
                <DiamondIcon size={16} weight="fill" /> {chipsShort(p.collection_value)}
              </strong>
              <span>
                {p.items_owned} item{p.items_owned === 1 ? '' : 's'} owned
              </span>
            </div>
          </div>

          {club && p.club_card && (
            <div className="pv-club">
              <ClubCard id={club.id} holder={p.display_name} number={p.club_card.number} since={p.club_card.since} />
            </div>
          )}

          {(frame || backdrop || style) && (
            <ul className="pv-gear">
              {[
                ['Border', frame],
                ['Background', backdrop],
                ['Name style', style],
              ].map(([label, item]) =>
                item && typeof item === 'object' ? (
                  <li key={label as string} className={`tier-${item.tier}`}>
                    <small>{label as string}</small>
                    <strong>{item.name}</strong>
                    <span>
                      <SparkleIcon size={10} weight="fill" /> {RARITY[item.tier]}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          )}

          <div className="pv-stats">
            <section>
              <h4>
                <MiniCards game="holdem" /> Poker
              </h4>
              <dl>
                <dt>Hands</dt>
                <dd>{chips(p.hands_played)}</dd>
                <dt>Win rate</dt>
                <dd>{pct(p.hands_won, p.hands_played)}</dd>
                <dt>Biggest pot</dt>
                <dd>{chipsShort(p.biggest_pot)}</dd>
                <dt>Best hand</dt>
                <dd>{p.best_hand >= 0 ? HANDS[p.best_hand] ?? '—' : '—'}</dd>
              </dl>
            </section>
            <section>
              <h4>
                <MiniCards game="blackjack" /> Blackjack
              </h4>
              <dl>
                <dt>Hands</dt>
                <dd>{chips(p.bj_hands)}</dd>
                <dt>Win rate</dt>
                <dd>{pct(p.bj_wins, p.bj_hands)}</dd>
                <dt>Blackjacks</dt>
                <dd>
                  <SpadeIcon size={11} weight="fill" /> {chips(p.bj_blackjacks)}
                </dd>
                <dt>Net</dt>
                <dd className={clsx(p.bj_net > 0 && 'is-up', p.bj_net < 0 && 'is-down')}>
                  {p.bj_net > 0 ? '+' : p.bj_net < 0 ? '−' : ''}
                  {chipsShort(Math.abs(p.bj_net))}
                </dd>
              </dl>
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
}

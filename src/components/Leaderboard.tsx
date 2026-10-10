import { useState } from 'react';
import clsx from 'clsx';
import { Avatar } from './Avatar';
import { Emoji } from './Emoji';
import { chips, chipsShort } from '../lib/format';
import { PlayerName } from './flair/PlayerName';
import { profileLink } from '../store/profileViewer';

export interface Leader {
  id: string;
  display_name: string;
  avatar: string;
  color: string;
  total_chips: number;
  hands_played: number;
  hands_won: number;
  biggest_pot: number;
  frame?: string | null;
  backdrop?: string | null;
  name_fx?: string | null;
  club?: string | null;
}

const TOP = 10;

/** Leaderboard with a showcase card for #1 and medals for #2 and #3. */
export function Leaderboard({ leaders, me }: { leaders: Leader[]; me?: string }) {
  const [all, setAll] = useState(false);
  if (leaders.length === 0) return <p className="muted empty">Play a hand to get on the board.</p>;

  const [champ, ...rest] = leaders;
  const visible = all ? rest : rest.slice(0, TOP - 1);
  const myRank = leaders.findIndex((l) => l.id === me);
  const pinMe = !all && myRank >= TOP;
  const isMe = champ.id === me;

  return (
    <div className="leaderboard">
      <div className={clsx('champion is-profile-link', isMe && 'is-me')} {...profileLink(champ.id)}>
        <span className="champion__shine" aria-hidden />
        <span className="champion__sparks" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        <div className="champion__avatar">
          <Emoji char="👑" className="champion__crown" label="Crown" />
          <Avatar avatar={champ.avatar} color={champ.color} frame={champ.frame} backdrop={champ.backdrop} size={58} />
        </div>
        <div className="champion__info">
          <span className="champion__label">{isMe ? 'Champion · you' : 'Champion'}</span>
          <strong className="champion__name">
            <PlayerName name={champ.display_name} fx={champ.name_fx} club={champ.club} />
          </strong>
          <span className="champion__stats">
            {chips(champ.hands_won)} wins · best pot {chipsShort(champ.biggest_pot)}
          </span>
        </div>
        <span className="champion__chips">
          {chipsShort(champ.total_chips)}
          <small>chips</small>
        </span>
      </div>

      {rest.length > 0 && (
        <ol className="leaders">
          {visible.map((l, i) => (
            <LeaderRow key={l.id} leader={l} rank={i + 2} me={me} />
          ))}
          {pinMe && (
            <>
              <li className="leaders__gap" aria-hidden>
                ···
              </li>
              <LeaderRow leader={leaders[myRank]} rank={myRank + 1} me={me} />
            </>
          )}
        </ol>
      )}
      {rest.length > TOP - 1 && (
        <button className="link-btn leaders__more" onClick={() => setAll((v) => !v)}>
          {all ? `Show top ${TOP}` : `Show all ${leaders.length}`}
        </button>
      )}
    </div>
  );
}

function LeaderRow({ leader: l, rank, me }: { leader: Leader; rank: number; me?: string }) {
  return (
    <li className={clsx('leaders__row is-profile-link', rank <= 3 && `is-top${rank}`, l.id === me && 'is-me')} {...profileLink(l.id)}>
      <span className={clsx('leaders__rank', rank <= 3 && `medal medal--${rank}`)}>{rank}</span>
      <Avatar avatar={l.avatar} color={l.color} frame={l.frame} backdrop={l.backdrop} size={30} />
      <span className="leaders__name">
        <PlayerName name={l.display_name} fx={l.name_fx} club={l.club} />
        {l.id === me && <em>you</em>}
      </span>
      <span className="leaders__chips">{chipsShort(l.total_chips)}</span>
    </li>
  );
}

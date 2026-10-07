import clsx from 'clsx';
import { useLocation } from 'wouter';
import { useGameMode, type GameMode } from '../store/game';
import { sound } from '../lib/sound';

/** A tiny pair of playing cards for each game's pill. */
function MiniCards({ game }: { game: GameMode }) {
  const [a, b] = game === 'holdem' ? [['A', '♠', false], ['K', '♠', false]] : [['A', '♥', true], ['J', '♣', false]];
  return (
    <span className="game-pill__cards" aria-hidden>
      {[a, b].map(([rank, suit, red], i) => (
        <span key={i} className={clsx('mini-card', red && 'is-red')}>
          <b>{rank as string}</b>
          <i>{suit as string}</i>
        </span>
      ))}
    </span>
  );
}

const GAMES: { id: GameMode; label: string }[] = [
  { id: 'holdem', label: "Hold'em" },
  { id: 'blackjack', label: 'Blackjack' },
];

/** Header pills that swap the lobby between Hold'em and Blackjack. */
export function GameSwitch() {
  const mode = useGameMode((s) => s.mode);
  const setMode = useGameMode((s) => s.setMode);
  const [location, navigate] = useLocation();
  return (
    <div className="game-switch" role="tablist" aria-label="Choose a game">
      {GAMES.map((g) => (
        <button
          key={g.id}
          type="button"
          role="tab"
          aria-selected={mode === g.id}
          className={clsx('game-pill', `game-pill--${g.id}`, mode === g.id && 'is-on')}
          onClick={() => {
            if (mode !== g.id) sound.play('click');
            setMode(g.id);
            if (location !== '/') navigate('/');
          }}
        >
          <MiniCards game={g.id} />
          <span className="game-pill__label">{g.label}</span>
        </button>
      ))}
    </div>
  );
}

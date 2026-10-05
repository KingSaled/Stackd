import { Link } from 'wouter';
import { PlayingCard } from '../components/PlayingCard';

export function NotFoundPage() {
  return (
    <div className="page page--center">
      <div className="card gate">
        <div className="notfound__cards">
          <PlayingCard card="7c" size="hero" />
          <PlayingCard card="2d" size="hero" />
        </div>
        <h2>Seven-deuce offsuit</h2>
        <p className="muted">This page is the worst hand in poker — it doesn't exist.</p>
        <Link className="btn btn--gold" href="/">
          Back to the lobby
        </Link>
      </div>
    </div>
  );
}

import { useState } from 'react';
import clsx from 'clsx';
import { InfoIcon } from '@phosphor-icons/react';
import { TopNav } from '../TopNav';
import { LegalFooter } from '../LegalFooter';
import { MinigameArt } from './MinigameArt';
import { MINIGAME_BY_ID, type MinigameId } from '../../../shared/minigames';

/** Page frame shared by the minigames: header with the game's badge, rules toggle, then the game. */
export function MinigameShell({
  id,
  rules,
  children,
  className,
}: {
  id: MinigameId;
  rules: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const info = MINIGAME_BY_ID.get(id)!;
  const [showRules, setShowRules] = useState(false);
  return (
    <div className={clsx('page mg-page', `mg-page--${id}`, className)}>
      <TopNav />
      <main className="mg-main">
        <header className="mg-head">
          <MinigameArt id={id} size={52} />
          <div className="mg-head__text">
            <h1>{info.name}</h1>
            <p>{info.tagline}</p>
          </div>
          <button className={clsx('btn btn--ghost btn--sm mg-head__rules', showRules && 'is-on')} onClick={() => setShowRules((v) => !v)}>
            <InfoIcon size={16} /> How it works
          </button>
        </header>
        {showRules && <div className="panel mg-rules">{rules}</div>}
        {children}
        <LegalFooter />
      </main>
    </div>
  );
}

/** Quick-pick chip amounts for a bet box. */
const PRESETS = [100, 1_000, 10_000, 50_000];

/** Bet amount box with quick buttons (+100, +1K, ½, 2×, Max). */
export function BetInput({
  value,
  onChange,
  max,
  min = 10,
  disabled,
  label = 'Bet',
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  min?: number;
  disabled?: boolean;
  label?: string;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(Math.floor(v), Math.max(0, max)));
  const short = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));
  return (
    <div className={clsx('bet-input', disabled && 'is-disabled')}>
      <label className="bet-input__field">
        <span>{label}</span>
        <input
          className="input"
          inputMode="numeric"
          value={value ? value.toLocaleString('en-US') : ''}
          placeholder={`${min.toLocaleString('en-US')}+`}
          disabled={disabled}
          onChange={(e) => onChange(clamp(Number(e.target.value.replace(/[^0-9]/g, '')) || 0))}
        />
      </label>
      <div className="bet-input__quick">
        {PRESETS.map((p) => (
          <button key={p} type="button" className="bet-chip" disabled={disabled} onClick={() => onChange(clamp(value + p))}>
            +{short(p)}
          </button>
        ))}
        <button type="button" className="bet-chip" disabled={disabled || !value} onClick={() => onChange(clamp(value / 2))}>
          ½
        </button>
        <button type="button" className="bet-chip" disabled={disabled || !value} onClick={() => onChange(clamp(value * 2))}>
          2×
        </button>
        <button type="button" className="bet-chip" disabled={disabled} onClick={() => onChange(clamp(max))}>
          Max
        </button>
        <button type="button" className="bet-chip bet-chip--clear" disabled={disabled || !value} onClick={() => onChange(0)} aria-label="Clear bet">
          ✕
        </button>
      </div>
    </div>
  );
}

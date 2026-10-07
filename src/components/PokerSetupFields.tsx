import clsx from 'clsx';
import { RobotIcon, TimerIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { BLIND_PRESETS } from '../../shared/economy';
import { blindsLabel, chipsShort } from '../lib/format';
import { BUYIN_PRESETS, POKER_TIMERS, SEAT_CHOICES, compactChips, pokerTableConfig, type PokerSetup } from '../lib/tableOptions';

/** Blinds, buy-in, turn timer and seats: the poker table setup shared by Create table and Quick play. */
export function PokerSetupFields<T extends PokerSetup>({ value, onChange }: { value: T; onChange: (next: T) => void }) {
  const set = (patch: Partial<PokerSetup>) => onChange({ ...value, ...patch });
  const cfg = pokerTableConfig(value);
  return (
    <>
      <div className="field">
        <span className="field__label">Blinds</span>
        <div className="stake-grid">
          {BLIND_PRESETS.map((p, i) => (
            <button
              type="button"
              key={p.bb}
              className={clsx('stake', i === value.blind && 'is-on')}
              onClick={() => set({ blind: i })}
              aria-label={`Blinds ${blindsLabel(p.sb, p.bb)}`}
            >
              {compactChips(p.sb)}/{compactChips(p.bb)}
            </button>
          ))}
        </div>
      </div>

      <div className="create-pair">
        <div className="field">
          <span className="field__label">
            Buy-in <em className="field__aside">{chipsShort(cfg.minBuyIn!)}–{chipsShort(cfg.maxBuyIn!)}</em>
          </span>
          <div className="segmented segmented--full">
            {BUYIN_PRESETS.map((p, i) => (
              <button type="button" key={p.label} className={clsx(i === value.buyin && 'is-on')} onClick={() => set({ buyin: i })} title={`${p.min}–${p.max} big blinds`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field__label">
            <TimerIcon size={13} /> Turn timer
          </span>
          <div className="segmented segmented--full">
            {POKER_TIMERS.map((t) => (
              <button type="button" key={t} className={clsx(t === value.timer && 'is-on')} onClick={() => set({ timer: t })}>
                {t}s
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field__label">
          <UsersThreeIcon size={13} /> Seats
        </span>
        <div className="segmented segmented--full">
          {SEAT_CHOICES.map((n) => (
            <button type="button" key={n} className={clsx(n === value.seats && 'is-on')} onClick={() => set({ seats: n })}>
              {n}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** The "fill empty seats with bots" switch row. */
export function BotsOption({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="opt">
      <span className="opt__icon">
        <RobotIcon size={18} />
      </span>
      <span className="opt__text">
        <strong>Fill empty seats with bots</strong>
        <small>Mixed, hidden skill levels. Players take a bot's seat when the hand ends.</small>
      </span>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch__track" />
      </span>
    </label>
  );
}

/** One-line description of a setup, for dialog footers and the Quick play button. */
export function pokerSetupSummary(p: PokerSetup) {
  const b = BLIND_PRESETS[p.blind] ?? BLIND_PRESETS[1];
  return `${blindsLabel(b.sb, b.bb)} · ${p.seats} seats · ${p.timer}s${p.bots ? ' · bots' : ''}`;
}

import { useEffect, useState } from 'react';
import { CoinsIcon } from '@phosphor-icons/react';
import { Modal } from '../Modal';
import { chips } from '../../lib/format';
import type { TableConfig } from '../../../shared/poker/types';
import { BrokeHelp } from '../BrokeHelp';

interface Props {
  open: boolean;
  mode: 'sit' | 'topup';
  config: TableConfig;
  wallet: number;
  /** Chips already at the table (for top-ups). */
  current?: number;
  busy: boolean;
  /** Extra context shown above the confirm button (e.g. replacing a bot). */
  note?: string;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}

export function BuyInDialog({ open, mode, config, wallet, current = 0, busy, note, onClose, onConfirm }: Props) {
  const min = mode === 'sit' ? config.minBuyIn : 1;
  const maxAllowed = mode === 'sit' ? config.maxBuyIn : Math.max(0, config.maxBuyIn - current);
  const max = Math.min(maxAllowed, wallet);
  const suggested = mode === 'sit' ? Math.min(max, Math.max(min, Math.round((config.minBuyIn + config.maxBuyIn) / 2))) : max;
  const [amount, setAmount] = useState(suggested);
  useEffect(() => {
    if (open) setAmount(Math.max(Math.min(suggested, max), Math.min(min, max)));
  }, [open, suggested, max, min]);

  const canAfford = max >= min && max > 0;
  const bb = config.bigBlind;

  return (
    <Modal open={open} onClose={onClose} title={mode === 'sit' ? 'Buy in' : 'Add chips'}>
      {!canAfford ? (
        <div className="buyin">
          <p className="muted">
            {mode === 'sit'
              ? `This table needs at least ${chips(config.minBuyIn)} chips. You have ${chips(wallet)}.`
              : maxAllowed <= 0
                ? `You're already at the ${chips(config.maxBuyIn)} table maximum.`
                : `Your wallet is empty.`}
          </p>
          <BrokeHelp compact />
        </div>
      ) : (
        <div className="buyin">
          <div className="buyin__amount">
            <CoinsIcon size={22} />
            <span>{chips(amount)}</span>
            <small>{(amount / bb).toFixed(0)} BB</small>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={Math.max(1, Math.floor(bb / 2))}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            aria-label="Amount"
            style={{ '--p': `${((amount - min) / Math.max(1, max - min)) * 100}%` } as React.CSSProperties}
          />
          <div className="buyin__range">
            <button className="chip-btn" onClick={() => setAmount(min)}>
              Min {chips(min)}
            </button>
            <button className="chip-btn" onClick={() => setAmount(max)}>
              Max {chips(max)}
            </button>
          </div>
          <p className="muted small">
            Wallet: {chips(wallet)} · Blinds {chips(config.smallBlind)}/{chips(bb)}
            {mode === 'sit' && ` · Buy-in ${chips(config.minBuyIn)}–${chips(config.maxBuyIn)}`}
          </p>
          {note && <p className="form-notice">{note}</p>}
          <button className="btn btn--gold btn--block" disabled={busy || amount < min || amount > max} onClick={() => onConfirm(amount)}>
            {mode === 'sit' ? `Sit down with ${chips(amount)}` : `Add ${chips(amount)}`}
          </button>
        </div>
      )}
    </Modal>
  );
}

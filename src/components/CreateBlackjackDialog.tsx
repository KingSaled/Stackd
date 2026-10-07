import { useState } from 'react';
import { useLocation } from 'wouter';
import clsx from 'clsx';
import { GlobeIcon, LockIcon, TimerIcon } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { createBlackjackRoom } from '../lib/api';
import { rememberRoomPassword } from '../lib/storage';
import { toast } from '../store/toast';
import { useAuth } from '../store/auth';
import { sound } from '../lib/sound';
import { chips } from '../lib/format';
import { BJ_LIMITS, BJ_SEATS, BJ_TIMERS } from '../../shared/blackjack/engine';

export function CreateBlackjackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useAuth((s) => s.profile);
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [timer, setTimer] = useState(15);
  const [listed, setListed] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createBlackjackRoom({ name: name.trim(), turnSeconds: timer, password: password || undefined, listed: listed && !password });
      if (password) rememberRoomPassword(res.roomId, password);
      sound.play('chips', { count: 6 });
      onClose();
      navigate(`/t/${res.roomId}`);
    } catch (err) {
      toast.error((err as Error).message);
      sound.play('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Open a blackjack table" wide>
      <form className="form create-form" onSubmit={submit}>
        <p className="bj-create__intro">
          Up to {BJ_SEATS} players against the house. Bets of {chips(BJ_LIMITS.minBet)} to {chips(BJ_LIMITS.maxBet)} come straight from
          your wallet, blackjack pays 3 to 2 and the dealer stands on all 17s.
        </p>
        <label className="field">
          <span className="field__label">Table name</span>
          <input
            className="input"
            placeholder={`${profile?.display_name ?? 'My'}'s blackjack`}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field__label">
            <TimerIcon size={13} /> Turn timer
          </span>
          <div className="segmented segmented--full">
            {BJ_TIMERS.map((t) => (
              <button type="button" key={t} className={clsx(t === timer && 'is-on')} onClick={() => setTimer(t)}>
                {t}s
              </button>
            ))}
          </div>
        </div>

        <div className="opt-list">
          <label className={clsx('opt', password && 'is-disabled')}>
            <span className="opt__icon">
              <GlobeIcon size={18} />
            </span>
            <span className="opt__text">
              <strong>List in the lobby</strong>
              <small>{password ? 'Private tables with a password stay unlisted.' : 'Anyone can find and join it from Open tables.'}</small>
            </span>
            <span className="switch">
              <input type="checkbox" checked={listed && !password} disabled={!!password} onChange={(e) => setListed(e.target.checked)} />
              <span className="switch__track" />
            </span>
          </label>
          <label className="opt opt--input">
            <span className="opt__icon">
              <LockIcon size={18} />
            </span>
            <span className="opt__text">
              <strong>Password</strong>
              <small>Optional. Only people with it can sit.</small>
            </span>
            <input
              className="input opt__input"
              type="text"
              autoComplete="off"
              placeholder="None"
              value={password}
              maxLength={64}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Table password"
            />
          </label>
        </div>

        <div className="create-foot">
          <span className="create-foot__summary">
            {BJ_SEATS} seats · {timer}s turns · bets {chips(BJ_LIMITS.minBet)}–{chips(BJ_LIMITS.maxBet)}
          </span>
          <button className="btn btn--gold btn--block btn--lg" disabled={busy}>
            {busy ? 'Opening table…' : 'Open table'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

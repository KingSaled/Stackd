import { useState } from 'react';
import { useLocation } from 'wouter';
import clsx from 'clsx';
import { TimerIcon } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { PasswordOption } from './CreateTableDialog';
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
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createBlackjackRoom({ name: name.trim(), turnSeconds: timer, password: password || undefined });
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
          <PasswordOption value={password} onChange={setPassword} />
        </div>

        <div className="create-foot">
          <span className="create-foot__summary">
            {BJ_SEATS} seats · {timer}s turns · bets {chips(BJ_LIMITS.minBet)}–{chips(BJ_LIMITS.maxBet)} · {password ? 'private' : 'public'}
          </span>
          <button className="btn btn--gold btn--block btn--lg" disabled={busy}>
            {busy ? 'Opening table…' : 'Open table'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { useLocation } from 'wouter';
import { LockIcon } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { BotsOption, PokerSetupFields, pokerSetupSummary } from './PokerSetupFields';
import { chips } from '../lib/format';
import { createRoom } from '../lib/api';
import { pokerTableConfig, type PokerSetup } from '../lib/tableOptions';
import { rememberRoomPassword } from '../lib/storage';
import { toast } from '../store/toast';
import { useAuth } from '../store/auth';
import { sound } from '../lib/sound';

export function CreateTableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useAuth((s) => s.profile);
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [setup, setSetup] = useState<PokerSetup>({ blind: 2, seats: 6, buyin: 1, timer: 30, bots: false });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const config = pokerTableConfig(setup);
  const affordable = (profile?.chips ?? 0) >= config.minBuyIn!;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createRoom({ name: name.trim(), config, password: password || undefined });
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
    <Modal open={open} onClose={onClose} title="Create a table" wide>
      <form className="form create-form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">Table name</span>
          <input
            className="input"
            placeholder={`${profile?.display_name ?? 'My'}'s table`}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <PokerSetupFields value={setup} onChange={setSetup} />

        <div className="opt-list">
          <BotsOption checked={setup.bots} onChange={(bots) => setSetup({ ...setup, bots })} />
          <PasswordOption value={password} onChange={setPassword} />
        </div>

        {!affordable && (
          <p className="form-warn">
            You need {chips(config.minBuyIn!)} chips to sit at these stakes. You can still create it for friends.
          </p>
        )}

        <div className="create-foot">
          <span className="create-foot__summary">
            {pokerSetupSummary(setup)} · {password ? 'private' : 'public'}
          </span>
          <button className="btn btn--gold btn--block btn--lg" disabled={busy}>
            {busy ? 'Opening table…' : 'Open table'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Optional password: a table with one is private (kept out of Open tables); every other table is public. */
export function PasswordOption({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="opt opt--input">
      <span className="opt__icon">
        <LockIcon size={18} />
      </span>
      <span className="opt__text">
        <strong>Password</strong>
        <small>{value ? 'Private: hidden from Open tables. Share your invite link.' : 'Optional. Tables without one are public in the lobby.'}</small>
      </span>
      <input
        className="input opt__input"
        type="text"
        autoComplete="off"
        placeholder="None"
        value={value}
        maxLength={64}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Table password"
      />
    </label>
  );
}

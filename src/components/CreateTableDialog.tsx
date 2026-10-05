import { useState } from 'react';
import { useLocation } from 'wouter';
import clsx from 'clsx';
import { Lock, Globe2, Bot } from 'lucide-react';
import { Modal } from './Modal';
import { BLIND_PRESETS } from '../../shared/economy';
import { blindsLabel, chips } from '../lib/format';
import { createRoom } from '../lib/api';
import { rememberRoomPassword } from '../lib/storage';
import { toast } from '../store/toast';
import { useAuth } from '../store/auth';
import { sound } from '../lib/sound';

const TIMERS = [15, 20, 30, 45, 60];
const BUYIN_PRESETS: { label: string; min: number; max: number }[] = [
  { label: 'Short', min: 20, max: 50 },
  { label: 'Standard', min: 40, max: 100 },
  { label: 'Deep', min: 100, max: 250 },
];

export function CreateTableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useAuth((s) => s.profile);
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [blind, setBlind] = useState(2);
  const [seats, setSeats] = useState(6);
  const [buyin, setBuyin] = useState(1);
  const [timer, setTimer] = useState(30);
  const [password, setPassword] = useState('');
  const [listed, setListed] = useState(false);
  const [bots, setBots] = useState(false);
  const [busy, setBusy] = useState(false);

  const b = BLIND_PRESETS[blind];
  const bi = BUYIN_PRESETS[buyin];
  const minBuyIn = b.bb * bi.min;
  const maxBuyIn = b.bb * bi.max;
  const affordable = (profile?.chips ?? 0) >= minBuyIn;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createRoom({
        name: name.trim(),
        config: { smallBlind: b.sb, bigBlind: b.bb, maxSeats: seats, minBuyIn, maxBuyIn, turnSeconds: timer, bots },
        password: password || undefined,
        listed: listed && !password,
      });
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

        <div className="field">
          <span className="field__label">Blinds</span>
          <div className="segmented segmented--wrap">
            {BLIND_PRESETS.map((p, i) => (
              <button type="button" key={p.bb} className={clsx(i === blind && 'is-on')} onClick={() => setBlind(i)}>
                {blindsLabel(p.sb, p.bb)}
              </button>
            ))}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <span className="field__label">Seats · {seats}</span>
            <div className="segmented">
              {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button type="button" key={n} className={clsx(n === seats && 'is-on')} onClick={() => setSeats(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <span className="field__label">Buy-in</span>
            <div className="segmented">
              {BUYIN_PRESETS.map((p, i) => (
                <button type="button" key={p.label} className={clsx(i === buyin && 'is-on')} onClick={() => setBuyin(i)}>
                  {p.label}
                </button>
              ))}
            </div>
            <span className="field__hint">
              {chips(minBuyIn)} – {chips(maxBuyIn)} chips ({bi.min}–{bi.max} big blinds)
            </span>
          </div>
          <div className="field">
            <span className="field__label">Turn timer</span>
            <div className="segmented">
              {TIMERS.map((s) => (
                <button type="button" key={s} className={clsx(s === timer && 'is-on')} onClick={() => setTimer(s)}>
                  {s}s
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field__label">
              <Lock size={13} /> Password <em className="muted">(optional)</em>
            </span>
            <input
              className="input"
              type="text"
              autoComplete="off"
              placeholder="Leave empty for an open table"
              value={password}
              maxLength={64}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className={clsx('switch', password && 'is-disabled')}>
            <input type="checkbox" checked={listed && !password} disabled={!!password} onChange={(e) => setListed(e.target.checked)} />
            <span className="switch__track" />
            <span>
              <Globe2 size={13} /> List in the lobby
            </span>
          </label>
        </div>

        <label className="switch bots-switch">
          <input type="checkbox" checked={bots} onChange={(e) => setBots(e.target.checked)} />
          <span className="switch__track" />
          <span className="bots-switch__text">
            <strong>
              <Bot size={14} /> Fill empty seats with bots
            </strong>
            <em className="muted">
              Bots of mixed, hidden skill levels. Friends who join take a bot's seat when the current hand ends.
            </em>
          </span>
        </label>

        {!affordable && (
          <p className="form-warn">
            You need {chips(minBuyIn)} chips to sit at these stakes — you can still create it for friends.
          </p>
        )}

        <button className="btn btn--gold btn--block btn--lg" disabled={busy}>
          {busy ? 'Opening table…' : 'Open table'}
        </button>
      </form>
    </Modal>
  );
}

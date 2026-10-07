import { useState } from 'react';
import { useLocation } from 'wouter';
import clsx from 'clsx';
import { LockIcon, GlobeIcon, RobotIcon, TimerIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { BLIND_PRESETS } from '../../shared/economy';
import { blindsLabel, chips, chipsShort } from '../lib/format';
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

  const compact = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));

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
          <div className="stake-grid">
            {BLIND_PRESETS.map((p, i) => (
              <button type="button" key={p.bb} className={clsx('stake', i === blind && 'is-on')} onClick={() => setBlind(i)} aria-label={`Blinds ${blindsLabel(p.sb, p.bb)}`}>
                {compact(p.sb)}/{compact(p.bb)}
              </button>
            ))}
          </div>
        </div>

        <div className="create-pair">
          <div className="field">
            <span className="field__label">
              Buy-in <em className="field__aside">{chipsShort(minBuyIn)}–{chipsShort(maxBuyIn)}</em>
            </span>
            <div className="segmented segmented--full">
              {BUYIN_PRESETS.map((p, i) => (
                <button type="button" key={p.label} className={clsx(i === buyin && 'is-on')} onClick={() => setBuyin(i)} title={`${p.min}–${p.max} big blinds`}>
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
              {TIMERS.map((t) => (
                <button type="button" key={t} className={clsx(t === timer && 'is-on')} onClick={() => setTimer(t)}>
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
            {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button type="button" key={n} className={clsx(n === seats && 'is-on')} onClick={() => setSeats(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="opt-list">
          <label className="opt">
            <span className="opt__icon">
              <RobotIcon size={18} />
            </span>
            <span className="opt__text">
              <strong>Fill empty seats with bots</strong>
              <small>Mixed, hidden skill levels. Friends take a bot's seat when the hand ends.</small>
            </span>
            <span className="switch">
              <input type="checkbox" checked={bots} onChange={(e) => setBots(e.target.checked)} />
              <span className="switch__track" />
            </span>
          </label>
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

        {!affordable && (
          <p className="form-warn">
            You need {chips(minBuyIn)} chips to sit at these stakes. You can still create it for friends.
          </p>
        )}

        <div className="create-foot">
          <span className="create-foot__summary">
            {blindsLabel(b.sb, b.bb)} · {seats} seats · {timer}s turns{bots ? ' · bots' : ''}
          </span>
          <button className="btn btn--gold btn--block btn--lg" disabled={busy}>
            {busy ? 'Opening table…' : 'Open table'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { LightningIcon, TimerIcon, UsersFourIcon } from '@phosphor-icons/react';
import { Modal } from './Modal';
import { BotsOption, PokerSetupFields, pokerSetupSummary } from './PokerSetupFields';
import { BJ_TIMERS } from '../../shared/blackjack/engine';
import { chips } from '../lib/format';
import { quickBuyInNeeded } from '../lib/quickMatch';
import { useAuth } from '../store/auth';
import { DEFAULT_BJ_QUICK, DEFAULT_POKER_QUICK, useQuickPlay, type BlackjackQuickPlay, type PokerQuickPlay } from '../store/quickplay';
import type { GameMode } from '../store/game';

/**
 * Quick play settings for one game. Saved once, after which the Quick play
 * button takes the player straight to a seat with them.
 */
export function QuickPlayDialog({
  open,
  game,
  onClose,
  onPlay,
}: {
  open: boolean;
  game: GameMode;
  onClose: () => void;
  /** Save & play: start Quick play with the settings just saved. */
  onPlay: (prefs: PokerQuickPlay | BlackjackQuickPlay) => void;
}) {
  const wallet = useAuth((s) => s.profile?.chips ?? 0);
  const saved = useQuickPlay((s) => (game === 'blackjack' ? s.blackjack : s.holdem));
  const save = useQuickPlay((s) => s.save);
  const [poker, setPoker] = useState<PokerQuickPlay>(DEFAULT_POKER_QUICK);
  const [bj, setBj] = useState<BlackjackQuickPlay>(DEFAULT_BJ_QUICK);

  // Start from the saved settings each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (game === 'blackjack') setBj((saved as BlackjackQuickPlay | null) ?? DEFAULT_BJ_QUICK);
    else setPoker((saved as PokerQuickPlay | null) ?? DEFAULT_POKER_QUICK);
  }, [open, game]); // eslint-disable-line react-hooks/exhaustive-deps

  const isBj = game === 'blackjack';
  const prefs = isBj ? bj : poker;
  const needed = isBj ? 0 : quickBuyInNeeded(poker);

  const commit = (play: boolean) => {
    if (isBj) save('blackjack', bj);
    else save('holdem', poker);
    onClose();
    if (play) onPlay(prefs);
  };

  return (
    <Modal open={open} onClose={onClose} title={isBj ? 'Quick play: blackjack' : "Quick play: Hold'em"} wide>
      <form
        className="form create-form"
        onSubmit={(e) => {
          e.preventDefault();
          commit(true);
        }}
      >
        <p className="quick-intro">
          <LightningIcon size={16} weight="fill" />
          <span>
            Set up your favourite game once. After that, one tap on <strong>Quick play</strong> sits you down at{' '}
            {prefs.joinOpen ? 'an open table that matches, or opens a new one,' : 'a new table'} with these settings.
          </span>
        </p>

        {isBj ? (
          <div className="field">
            <span className="field__label">
              <TimerIcon size={13} /> Turn timer
            </span>
            <div className="segmented segmented--full">
              {BJ_TIMERS.map((t) => (
                <button type="button" key={t} className={clsx(t === bj.timer && 'is-on')} onClick={() => setBj({ ...bj, timer: t })}>
                  {t}s
                </button>
              ))}
            </div>
          </div>
        ) : (
          <PokerSetupFields value={poker} onChange={setPoker} />
        )}

        <div className="opt-list">
          {!isBj && <BotsOption checked={poker.bots} onChange={(bots) => setPoker({ ...poker, bots })} />}
          <label className="opt">
            <span className="opt__icon">
              <UsersFourIcon size={18} />
            </span>
            <span className="opt__text">
              <strong>Join open tables first</strong>
              <small>
                {isBj
                  ? 'Take a free seat at an open blackjack table before opening a new one.'
                  : 'Take a free seat at an open table with the same blinds, seats and bots before opening a new one.'}
              </small>
            </span>
            <span className="switch">
              <input
                type="checkbox"
                checked={prefs.joinOpen}
                onChange={(e) => (isBj ? setBj({ ...bj, joinOpen: e.target.checked }) : setPoker({ ...poker, joinOpen: e.target.checked }))}
              />
              <span className="switch__track" />
            </span>
          </label>
        </div>

        {!isBj && wallet < needed && <p className="form-warn">You need {chips(needed)} chips in your wallet to sit at these stakes.</p>}
        {!isBj && <p className="muted small quick-note">You sit down with the full buy-in, or as much as your wallet allows.</p>}

        <div className="create-foot create-foot--quick">
          <span className="create-foot__summary">{isBj ? `Blackjack · ${bj.timer}s turns` : pokerSetupSummary(poker)}</span>
          <div className="quick-foot__buttons">
            <button type="button" className="btn btn--ghost btn--lg" onClick={() => commit(false)}>
              Save
            </button>
            <button className="btn btn--mint btn--lg" disabled={!isBj && wallet < needed}>
              <LightningIcon size={18} weight="fill" /> Save &amp; play
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

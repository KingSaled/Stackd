import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { CheckCircleIcon, FlagBannerIcon, GiftIcon } from '@phosphor-icons/react';
import { NamedIcon } from '../AchievementIcon';
import { Modal } from '../Modal';
import { chips, countdown } from '../../lib/format';
import { useServerNow } from '../../hooks/useNow';
import { inPeriod, nextRollover, selectClaimable, useChallenges } from '../../store/challenges';
import { sound } from '../../lib/sound';
import {
  CHALLENGE_BY_ID,
  dailyCapLabel,
  isClaimable,
  isComplete,
  type ChallengePeriod,
  type ChallengeStatus,
} from '../../../shared/challenges';

type Tab = ChallengePeriod;

const PERIOD_LABEL: Record<Tab, string> = { daily: 'Daily', weekly: 'Weekly' };

/** How many of a period's three challenges are done (the bonus doesn't count). */
function doneCount(items: ChallengeStatus[] | null, period: Tab) {
  const list = inPeriod(items, period).filter((c) => c.slot !== 'bonus');
  return { done: list.filter((c) => isComplete(c)).length, total: list.length };
}

/** One challenge: what to do, how far along, and the reward or Claim button. */
export function ChallengeRow({ c }: { c: ChallengeStatus }) {
  const def = CHALLENGE_BY_ID.get(c.id);
  const claiming = useChallenges((s) => s.claiming === c.id);
  const claim = useChallenges((s) => s.claim);
  if (!def) return null;
  const done = isComplete(c);
  const ready = isClaimable(c);
  const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
  const bonus = c.slot === 'bonus';
  return (
    <li className={clsx('chal', ready && 'is-ready', c.claimed && 'is-claimed', bonus && 'chal--bonus')} data-challenge={c.id}>
      <span className="chal__icon" aria-hidden>
        <NamedIcon name={def.icon} size={20} weight={done ? 'fill' : 'duotone'} />
      </span>
      <div className="chal__body">
        <div className="chal__top">
          <span className="chal__name">{def.name}</span>
          <div className="chal__reward">
            {c.claimed ? (
              <span className="chal__claimed">
                <CheckCircleIcon size={16} weight="fill" /> Claimed
              </span>
            ) : ready ? (
              <button
                className="btn btn--gold btn--sm chal__claim"
                disabled={claiming}
                onClick={() => {
                  sound.play('click');
                  void claim(c.id);
                }}
              >
                Claim
                <strong>+{chips(c.reward)}</strong>
              </button>
            ) : (
              <span className="chal__pay">
                <GiftIcon size={13} weight="fill" />+{chips(c.reward)}
              </span>
            )}
          </div>
        </div>
        <p className="chal__desc">{def.description}</p>
        {c.dailyCap && !done && !c.claimed ? (
          <p className={clsx('chal__cap', (c.today ?? 0) >= c.dailyCap && 'is-full')}>
            {(c.today ?? 0) >= c.dailyCap ? 'Daily limit reached: more counts tomorrow' : `${dailyCapLabel(c.dailyCap)} · ${chips(c.today ?? 0)} today`}
          </p>
        ) : null}
        <div className="chal__meter">
          <span
            className="chal__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={c.target}
            aria-valuenow={Math.min(c.progress, c.target)}
            aria-label={`${def.name}: ${Math.min(c.progress, c.target)} of ${c.target}`}
          >
            <motion.i initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 160, damping: 22 }} />
          </span>
          <span className="chal__count">
            {Math.min(c.progress, c.target)}/{c.target}
          </span>
        </div>
      </div>
    </li>
  );
}

/** Daily / Weekly switch with how far along each set is. */
function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items = useChallenges((s) => s.items);
  return (
    <div className="chal-tabs" role="tablist" aria-label="Challenge period">
      {(['daily', 'weekly'] as Tab[]).map((p) => {
        const { done, total } = doneCount(items, p);
        const ready = inPeriod(items, p).some(isClaimable);
        return (
          <button
            key={p}
            role="tab"
            aria-selected={tab === p}
            className={clsx('chal-tab', tab === p && 'is-on', ready && 'has-ready')}
            onClick={() => {
              if (tab !== p) sound.play('click');
              onChange(p);
            }}
          >
            {PERIOD_LABEL[p]}
            <span className="chal-tab__n">
              {done}/{total}
            </span>
            {ready && <i className="chal-tab__dot" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** The tab to open first: today's, unless it's all collected and the week still has something to do. */
function firstTab(items: ChallengeStatus[] | null): Tab {
  const day = inPeriod(items, 'daily');
  const week = inPeriod(items, 'weekly');
  if (day.some(isClaimable)) return 'daily';
  if (week.some(isClaimable)) return 'weekly';
  return day.length > 0 && day.every((c) => c.claimed) && week.some((c) => !c.claimed) ? 'weekly' : 'daily';
}

/** The challenges themselves: tabs, the reset timer and the list (used in the lobby card and the pop-up). */
export function ChallengeList({ className }: { className?: string }) {
  const items = useChallenges((s) => s.items);
  const [tab, setTab] = useState<Tab | null>(null);
  const shown = tab ?? firstTab(items);
  const picked = useRef(false);
  // Open on the most useful tab once, when the challenges first arrive.
  useEffect(() => {
    if (items && !picked.current) {
      picked.current = true;
      setTab(firstTab(items));
    }
  }, [items]);
  const now = useServerNow(1000, !!items);
  const list = inPeriod(items, shown);
  const ends = list.length ? Math.min(...list.map((c) => Date.parse(c.endsAt))) : nextRollover(items);
  const allClaimed = list.length > 0 && list.every((c) => c.claimed);

  return (
    <div className={clsx('chal-list', className)}>
      <div className="chal-list__bar">
        <Tabs tab={shown} onChange={setTab} />
        {ends != null && Number.isFinite(ends) && (
          <span className="chal-list__reset" title={shown === 'daily' ? 'New daily challenges at 08:00 UTC' : 'New weekly challenges every Monday at 08:00 UTC'}>
            New in {countdown(ends - now)}
          </span>
        )}
      </div>
      {!items ? (
        <div className="chal-skeleton" aria-hidden>
          <i />
          <i />
          <i />
        </div>
      ) : (
        <ul className="chal-rows" key={shown}>
          {list.map((c) => (
            <ChallengeRow key={c.id + c.periodKey} c={c} />
          ))}
        </ul>
      )}
      {allClaimed && <p className="chal-list__done">All collected. Come back for the next set!</p>}
    </div>
  );
}

/** The lobby card. Hidden until the database knows about challenges. */
export function ChallengesPanel({ className }: { className?: string }) {
  const unavailable = useChallenges((s) => s.unavailable);
  const ready = useChallenges(selectClaimable);
  if (unavailable) return null;
  return (
    <section className={clsx('panel home-panel chal-panel', className)} aria-label="Challenges">
      <header className="home-panel__head">
        <h2 className="home-panel__title">
          <FlagBannerIcon size={18} weight="fill" /> Challenges
          {ready > 0 && <span className="home-panel__count chal-panel__ready">{ready} ready</span>}
        </h2>
      </header>
      <ChallengeList />
    </section>
  );
}

/** Header button: today's progress, turning gold when rewards are waiting. Opens the list anywhere. */
export function ChallengesButton({ className }: { className?: string }) {
  const unavailable = useChallenges((s) => s.unavailable);
  const items = useChallenges((s) => s.items);
  const ready = useChallenges(selectClaimable);
  const [open, setOpen] = useState(false);
  if (unavailable || !items) return null;
  const { done, total } = doneCount(items, 'daily');
  const label = ready > 0 ? `${ready} challenge reward${ready === 1 ? '' : 's'} ready to claim` : `Challenges: ${done} of ${total} done today`;
  return (
    <>
      <button
        className={clsx('chal-pill', ready > 0 && 'is-ready', className)}
        onClick={() => {
          sound.play('click');
          setOpen(true);
        }}
        aria-label={label}
        title={label}
      >
        <FlagBannerIcon size={16} weight="fill" />
        <span className="chal-pill__label">{ready > 0 ? 'Claim' : 'Challenges'}</span>
        <strong className="chal-pill__n">{ready > 0 ? ready : `${done}/${total}`}</strong>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Challenges" className="chal-modal">
        <ChallengeList />
      </Modal>
    </>
  );
}

/** A compact read-only view for the table menu: just names and progress. */
export function ChallengeMini() {
  const items = useChallenges((s) => s.items);
  const unavailable = useChallenges((s) => s.unavailable);
  if (unavailable || !items || items.length === 0) return null;
  return (
    <div className="chal-mini">
      {(['daily', 'weekly'] as Tab[]).map((p) => (
        <div key={p} className="chal-mini__group">
          <h4>{p === 'daily' ? 'Today' : 'This week'}</h4>
          {inPeriod(items, p)
            .filter((c) => c.slot !== 'bonus')
            .map((c) => {
              const def = CHALLENGE_BY_ID.get(c.id);
              if (!def) return null;
              const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
              return (
                <div key={c.id} className={clsx('chal-mini__row', c.claimed && 'is-claimed', isClaimable(c) && 'is-ready')}>
                  <span className="chal-mini__name" title={def.description}>
                    {def.description.replace(/\.$/, '')}
                  </span>
                  <span className="chal-mini__n">{c.claimed ? 'Claimed' : isComplete(c) ? 'Ready!' : `${c.progress}/${c.target}`}</span>
                  <span className="chal-mini__bar">
                    <i style={{ width: `${pct}%` }} />
                  </span>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

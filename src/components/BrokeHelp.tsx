import { GiftIcon, LifebuoyIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { useEconomy } from '../hooks/useEconomy';
import { chips, countdown } from '../lib/format';
import { ECONOMY } from '../../shared/economy';

/** Daily bonus + emergency reload actions, shown wherever a player may be short of chips. */
export function BrokeHelp({ compact }: { compact?: boolean }) {
  const e = useEconomy();
  return (
    <div className={clsx('broke-help', compact && 'broke-help--compact')}>
      <button className="btn btn--gold" disabled={!e.dailyReady || e.busy} onClick={e.claimDaily}>
        <GiftIcon size={16} />
        {e.dailyReady ? `Daily bonus +${chips(e.dailyAmount)}` : `Daily bonus in ${countdown(e.nextDailyAt - e.now)}`}
      </button>
      {e.broke && (
        <button className="btn btn--mint" disabled={!e.reloadReady || e.busy} onClick={e.reload}>
          <LifebuoyIcon size={16} />
          {e.reloadReady
            ? `Emergency reload to ${chips(ECONOMY.reloadTarget)}`
            : `Reload in ${countdown(e.nextReloadAt - e.now)}`}
        </button>
      )}
    </div>
  );
}

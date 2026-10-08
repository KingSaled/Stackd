import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftIcon, LockIcon, ChatCircleIcon, XIcon } from '@phosphor-icons/react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import confetti from 'canvas-confetti';
import clsx from 'clsx';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { useGameMode } from '../store/game';
import { toast } from '../store/toast';
import { useTable } from '../hooks/useTable';
import { useStage } from '../hooks/useStage';
import { usePresentation } from '../hooks/usePresentation';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Stage } from '../components/table/Stage';
import { ActionBar, type PreAction } from '../components/table/ActionBar';
import { DockPlaceholder } from '../components/table/Dock';
import { ChatPanel } from '../components/table/ChatPanel';
import { BuyInDialog } from '../components/table/BuyInDialog';
import { InviteButton } from '../components/table/InviteButton';
import { TableSettings } from '../components/table/TableSettings';
import { SoundControl } from '../components/SoundControl';
import { Logo } from '../components/Logo';
import { getLegalActions, isBettingPhase, reservationOf, seatIndexOf } from '../../shared/poker/engine';
import type { PlayerAction } from '../../shared/poker/types';
import type { TableAction } from '../lib/api';
import { ApiError } from '../lib/api';
import { seatPan, sound, vibrate } from '../lib/sound';
import { blindsLabel, chips } from '../lib/format';
import { recallRoomPassword, rememberRoomPassword } from '../lib/storage';
import { clearQuickSeatIntent, hasQuickSeatIntent } from '../lib/quickplay';
import { celebrationColors } from '../lib/season';

// Blackjack tables load their own (separately downloaded) room.
const BlackjackRoom = lazy(() => import('./BlackjackRoom'));

interface Preview {
  id: string;
  name: string;
  has_password: boolean;
  player_count: number;
  is_member: boolean;
  config: { smallBlind: number; bigBlind: number; maxSeats: number; game?: string };
}

function keyFromHash(): string | null {
  const m = window.location.hash.match(/key=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function TablePage({ id }: { id: string }) {
  const roomId = id.toUpperCase();
  const [gate, setGate] = useState<'checking' | 'password' | 'ready' | 'notfound' | 'error'>('checking');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [joining, setJoining] = useState(false);

  const join = useCallback(
    async (pw: string | null) => {
      const { data, error } = await supabase.rpc('join_room', { p_id: roomId, p_password: pw });
      if (error) throw error;
      return data as { ok: boolean; error?: string };
    },
    [roomId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGate('checking');
      const { data, error } = await supabase.rpc('room_preview', { p_id: roomId });
      if (cancelled) return;
      if (error) {
        setGate('error');
        return;
      }
      if (!data) {
        setGate('notfound');
        return;
      }
      const p = data as Preview;
      setPreview(p);
      if (p.has_password && !p.is_member) {
        const pw = keyFromHash() ?? recallRoomPassword(roomId);
        if (pw) {
          const r = await join(pw).catch(() => null);
          if (cancelled) return;
          if (r?.ok) {
            rememberRoomPassword(roomId, pw);
            setGate('ready');
            return;
          }
        }
        setGate('password');
        return;
      }
      await join(null).catch(() => null);
      if (!cancelled) setGate('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, join]);

  if (gate === 'ready') {
    if (preview?.config?.game === 'blackjack')
      return (
        <Suspense
          fallback={
            <div className="page page--center">
              <div className="spinner" aria-label="Loading table" />
            </div>
          }
        >
          <BlackjackRoom roomId={roomId} />
        </Suspense>
      );
    return <TableRoom roomId={roomId} />;
  }

  return (
    <div className="page page--center">
      <div className="card gate">
        <Logo size="md" />
        {gate === 'checking' && <div className="spinner" aria-label="Loading" />}
        {gate === 'notfound' && (
          <>
            <h2>Table not found</h2>
            <p className="muted">The table "{roomId}" doesn't exist or was closed.</p>
            <Link className="btn btn--gold" href="/">
              Back to lobby
            </Link>
          </>
        )}
        {gate === 'error' && (
          <>
            <h2>Couldn't reach the table</h2>
            <p className="muted">Check your connection and try again.</p>
            <button className="btn btn--gold" onClick={() => window.location.reload()}>
              Retry
            </button>
          </>
        )}
        {gate === 'password' && preview && (
          <form
            className="gate__form"
            onSubmit={async (e) => {
              e.preventDefault();
              setJoining(true);
              setPwError('');
              try {
                const r = await join(password);
                if (r.ok) {
                  rememberRoomPassword(roomId, password);
                  setGate('ready');
                } else {
                  setPwError(
                    r.error === 'too_many_attempts'
                      ? 'Too many attempts — wait a few minutes.'
                      : r.error === 'wrong_password'
                        ? 'Wrong password.'
                        : 'Could not join.',
                  );
                  sound.play('error');
                }
              } catch (err) {
                setPwError((err as Error).message);
              } finally {
                setJoining(false);
              }
            }}
          >
            <div className="gate__lock">
              <LockIcon size={22} />
            </div>
            <h2>{preview.name}</h2>
            <p className="muted">
              Private table ·{' '}
              {preview.config.game === 'blackjack' ? 'blackjack' : `blinds ${blindsLabel(preview.config.smallBlind, preview.config.bigBlind)}`} ·{' '}
              {preview.player_count}/{preview.config.maxSeats} seated
            </p>
            <input
              className="input"
              type="password"
              autoFocus
              placeholder="Table password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Table password"
            />
            {pwError && <p className="form-error">{pwError}</p>}
            <button className="btn btn--gold btn--block" disabled={!password || joining}>
              {joining ? 'Joining…' : 'Join table'}
            </button>
            <Link className="btn btn--ghost btn--block" href="/">
              Back to lobby
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

function TableRoom({ roomId }: { roomId: string }) {
  const me = useAuth((s) => s.session!.user.id);
  const profile = useAuth((s) => s.profile);
  const refreshSeated = useAuth((s) => s.refreshSeated);
  const [, navigate] = useLocation();
  const t = useTable(roomId, me);
  const state = t.state;
  const setMode = useGameMode((s) => s.setMode);
  useEffect(() => setMode('holdem'), [setMode]);
  const stageWrap = useRef<HTMLDivElement>(null);
  const metrics = useStage(stageWrap);
  const pres = usePresentation(state, me);
  const wide = useMediaQuery('(min-width: 1100px)');
  const [busy, setBusy] = useState(false);
  const [buyIn, setBuyIn] = useState<{ mode: 'sit' | 'topup'; seat?: number } | null>(null);
  const [preAction, setPreAction] = useState<PreAction>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const lastChatId = useRef(0);
  const lastReactSent = useRef(0);

  const mySeat = state ? seatIndexOf(state, me) : -1;
  const seat = mySeat >= 0 && state ? state.seats[mySeat] : null;
  // Seat claimed from a bot: the player joins when the current hand ends.
  const claimIdx = state ? reservationOf(state, me) : -1;
  const claimedFrom = claimIdx >= 0 && state ? state.seats[claimIdx] : null;
  const legal = useMemo(
    () =>
      state && mySeat >= 0
        ? getLegalActions(state, mySeat)
        : getLegalActions({ phase: 'waiting', toAct: -1, currentBet: 0, minRaise: 0, seats: [], config: { smallBlind: 0, bigBlind: 0, maxSeats: 0, minBuyIn: 0, maxBuyIn: 0, turnSeconds: 0 } }, -1),
    [state, mySeat],
  );

  // Sounds staged with the animations.
  useEffect(() => {
    for (const c of pres.cues) sound.play(c.sound, { delay: c.delay, count: c.count, pan: seatPan(c.seat) });
    if (pres.cues.some((c) => c.sound === 'turn')) vibrate([40, 60, 40]);
  }, [pres.cueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Confetti when I win a pot.
  const celebrated = useRef(0);
  useEffect(() => {
    if (!state?.result || !pres.resultVisible || state.phase !== 'showdown') return;
    if (celebrated.current === state.result.handNo) return;
    const mine = state.result.payouts.find((p) => p.userId === me);
    celebrated.current = state.result.handNo;
    if (!mine) return;
    const el = document.querySelector('.seat--me');
    const r = el?.getBoundingClientRect();
    const origin = r
      ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight }
      : { x: 0.5, y: 0.8 };
    const big = mine.amount >= state.config.bigBlind * 50;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      void confetti({
        particleCount: big ? 160 : 70,
        spread: big ? 100 : 70,
        startVelocity: big ? 45 : 32,
        origin,
        colors: celebrationColors(['#f5c451', '#ffdf8a', '#3ef0a8', '#ffffff', '#ff6bcb']),
        disableForReducedMotion: true,
      });
    }
    vibrate([30, 40, 80]);
  }, [state, pres.resultVisible, me]);

  // Keep wallet/broke checks current when my seat changes.
  useEffect(() => {
    void refreshSeated();
  }, [mySeat, seat?.leaving, refreshSeated]);

  // Unread chat badge + message sound for messages that arrive while the table is open.
  useEffect(() => {
    const fresh = t.chat.filter((m) => m.live && m.id > lastChatId.current && m.user_id !== me);
    const newest = t.chat[t.chat.length - 1];
    if (newest) lastChatId.current = Math.max(lastChatId.current, newest.id);
    if (!fresh.length) return;
    sound.play('message');
    if (!wide && !chatOpen) setUnread((u) => u + fresh.length);
  }, [t.chat, me, wide, chatOpen]);
  useEffect(() => {
    if (chatOpen) setUnread(0);
  }, [chatOpen]);
  const lastReaction = useRef(0);
  useEffect(() => {
    const r = t.reactions[t.reactions.length - 1];
    if (r && r.id !== lastReaction.current) {
      lastReaction.current = r.id;
      sound.play('reaction');
    }
  }, [t.reactions]);

  const run = useCallback(
    async (action: TableAction) => {
      setBusy(true);
      try {
        await t.send(action);
        return true;
      } catch (e) {
        const err = e as ApiError;
        if (err.code !== 'stale') {
          toast.error(err.message || 'Action failed');
          sound.play('error');
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  // Sent here by Quick play: sit straight down with the full buy-in (or what the wallet allows).
  const quickSeat = useRef(hasQuickSeatIntent());
  useEffect(() => clearQuickSeatIntent(), []);
  useEffect(() => {
    if (!quickSeat.current || !state || !profile) return;
    quickSeat.current = false;
    if (mySeat >= 0 || claimIdx >= 0) return;
    const buyIn = Math.min(state.config.maxBuyIn, profile.chips);
    if (buyIn < state.config.minBuyIn) {
      toast.error(`You need ${chips(state.config.minBuyIn)} chips to sit at this table`);
      return;
    }
    // Empty seats first, then seats a bot can give up.
    const empty = state.seats.flatMap((x, i) => (x ? [] : [i]));
    const bots = state.seats.flatMap((x, i) => (x?.isBot && !x.reservedFor ? [i] : []));
    void (async () => {
      for (const i of [...empty, ...bots].slice(0, 4)) {
        try {
          const target = state.seats[i];
          await t.send({ type: 'sit', seat: i, buyIn });
          sound.play('chips', { count: 6 });
          if (target?.isBot && isBettingPhase(state.phase) && target.inHand) toast.info(`Seat claimed — you'll be dealt in when this hand ends`);
          return;
        } catch (e) {
          if ((e as ApiError).code !== 'seat_taken' && (e as ApiError).code !== 'stale') {
            toast.error((e as Error).message);
            return;
          }
        }
      }
      toast.info('This table just filled up. Pick an open seat or try Quick play again.');
    })();
  }, [state, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAct = useCallback(
    (a: PlayerAction) => {
      if (!state) return;
      setPreAction(null);
      void run({ type: 'act', action: a, handNo: state.handNo, phase: state.phase });
    },
    [state, run],
  );

  // Execute queued pre-actions when my turn arrives.
  useEffect(() => {
    if (!legal.canAct || !preAction || busy) return;
    let action: PlayerAction | null = null;
    if (preAction === 'checkfold') action = legal.canCheck ? { type: 'check' } : { type: 'fold' };
    else if (preAction === 'check') action = legal.canCheck ? { type: 'check' } : null;
    else if (preAction === 'callany') action = legal.canCheck ? { type: 'check' } : { type: 'call' };
    setPreAction(null);
    if (action) onAct(action);
  }, [legal.canAct, state?.turnStartedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPreAction(null), [state?.handNo]);

  const onSeatClick = (i: number) => {
    sound.play('click');
    setBuyIn({ mode: 'sit', seat: i });
  };

  const leave = async () => {
    if (claimedFrom) {
      if (await run({ type: 'stand' })) toast.info('Seat released — your buy-in is back in your wallet');
    } else if (seat) {
      const inHand = state && isBettingPhase(state.phase) && seat.inHand && !seat.folded;
      if (inHand && !window.confirm('Leave the table? Your hand will be folded.')) return;
      const ok = await run({ type: 'stand' });
      if (!ok) return;
      toast.info(seat.allIn ? 'You will be cashed out when this hand ends' : 'Chips returned to your wallet');
    }
    navigate('/');
  };

  if (t.notFound) {
    return (
      <div className="page page--center">
        <div className="card gate">
          <h2>Table closed</h2>
          <p className="muted">Everyone left, so this table was closed. Any chips at the table are back in your wallet.</p>
          <Link className="btn btn--gold" href="/">
            Back to lobby
          </Link>
        </div>
      </div>
    );
  }

  const config = state?.config;
  const name = t.meta?.name ?? 'Table';
  const seatedCount = state?.seats.filter((x) => x && !x.isBot).length ?? 0;
  const botCount = state?.seats.filter((x) => x?.isBot).length ?? 0;

  const chat = (
    <ChatPanel
      chat={t.chat}
      log={state?.log ?? []}
      me={me}
      canChat
      onSend={async (text) => {
        try {
          await t.sendChat(text);
        } catch (e) {
          toast.error((e as Error).message);
          throw e;
        }
      }}
      onReact={(emoji) => {
        const now = Date.now();
        if (now - lastReactSent.current < 1200) return;
        lastReactSent.current = now;
        t.sendChat(emoji, 'reaction').catch((e) => toast.error((e as Error).message));
      }}
    />
  );

  return (
    <div className={clsx('table-page', wide && 'table-page--wide')}>
      <header className="table-top">
        <button className="icon-btn" onClick={leave} aria-label="Leave table">
          <ArrowLeftIcon size={18} />
        </button>
        <div className="table-top__title">
          <span className="table-top__name">
            <span className="table-top__nametext">{name}</span>
            {t.meta?.hasPassword && <LockIcon size={12} />}
          </span>
          <span className="table-top__meta">
            <span className={clsx('dot', t.connection === 'live' ? 'dot--live' : 'dot--warn')} />
            <span className="table-top__metatext">
              {config
                ? `${blindsLabel(config.smallBlind, config.bigBlind)} · ${seatedCount}/${config.maxSeats} players${botCount ? ` · ${botCount} bot${botCount === 1 ? '' : 's'}` : ''}`
                : 'Connecting…'}
              {state && state.handNo > 0 && <span className="table-top__hand"> · Hand #{state.handNo}</span>}
            </span>
          </span>
        </div>
        <div className="table-top__actions">
          <InviteButton roomId={roomId} roomName={name} compact={!wide} />
          {!wide && (
            <button className="icon-btn badge-host" onClick={() => setChatOpen(true)} aria-label="Open chat">
              <ChatCircleIcon size={18} />
              {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
          )}
          <SoundControl />
          <TableSettings />
          {wide && <Logo size="sm" className="table-top__logo" />}
        </div>
      </header>

      <div className="table-body">
        <div className="stage-wrap" ref={stageWrap}>
          {state ? (
            <Stage
              state={state}
              me={me}
              myCards={t.myCards}
              online={t.online}
              reactions={t.reactions}
              pres={pres}
              metrics={metrics}
              canSit={mySeat < 0 && claimIdx < 0}
              onSeatClick={onSeatClick}
            />
          ) : (
            <div className="spinner" aria-label="Loading table" />
          )}
          {t.connection === 'reconnecting' && <div className="reconnecting">Reconnecting…</div>}
        </div>
        {wide && <aside className="side-chat">{chat}</aside>}
      </div>

      {state ? (
        <ActionBar
          state={state}
          mySeat={mySeat}
          legal={legal}
          busy={busy}
          preAction={preAction}
          setPreAction={setPreAction}
          onAct={onAct}
          onSitIn={() => void run({ type: 'sitin' })}
          onSitOut={() => void run({ type: 'sitout' })}
          onAddChips={() => setBuyIn({ mode: 'topup' })}
          onStand={async () => {
            const inHand = isBettingPhase(state.phase) && seat?.inHand && !seat.folded;
            if (inHand && !window.confirm('Stand up now? Your hand will be folded.')) return;
            if (await run({ type: 'stand' })) toast.info('You stood up — chips are back in your wallet');
          }}
          walletChips={profile?.chips ?? 0}
          myCards={t.myCards && t.myCards.handNo === state.handNo ? t.myCards.cards : null}
          claim={claimedFrom ? { botName: claimedFrom.name, buyIn: claimedFrom.reservedFor?.buyIn ?? 0 } : null}
          onCancelClaim={async () => {
            if (await run({ type: 'stand' })) toast.info('Seat released — your buy-in is back in your wallet');
          }}
        />
      ) : (
        <DockPlaceholder />
      )}

      <AnimatePresence>
        {!wide && chatOpen && (
          <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setChatOpen(false)}>
            <motion.div
              className="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sheet__head">
                <span className="sheet__grip" />
                <button className="icon-btn" onClick={() => setChatOpen(false)} aria-label="Close chat">
                  <XIcon size={18} />
                </button>
              </div>
              {chat}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {config && (
        <BuyInDialog
          open={!!buyIn}
          mode={buyIn?.mode ?? 'sit'}
          config={config}
          wallet={profile?.chips ?? 0}
          current={seat ? seat.stack + seat.pendingTopUp : 0}
          note={(() => {
            const target = buyIn?.mode === 'sit' && buyIn.seat != null ? state?.seats[buyIn.seat] : null;
            if (!target?.isBot) return undefined;
            return state && isBettingPhase(state.phase) && target.inHand
              ? `You'll replace ${target.name} (a bot) as soon as this hand ends.`
              : `You'll replace ${target.name} (a bot) right away.`;
          })()}
          busy={busy}
          onClose={() => setBuyIn(null)}
          onConfirm={async (amount) => {
            const ok =
              buyIn?.mode === 'sit'
                ? await run({ type: 'sit', seat: buyIn.seat ?? 0, buyIn: amount })
                : await run({ type: 'addchips', amount });
            if (ok) {
              const target = buyIn?.mode === 'sit' && buyIn.seat != null ? state?.seats[buyIn.seat] : null;
              if (target?.isBot && state && isBettingPhase(state.phase) && target.inHand)
                toast.info(`Seat claimed — you'll be dealt in when this hand ends`);
              setBuyIn(null);
              sound.play('chips', { count: 6 });
              if (buyIn?.mode === 'topup') toast.success(`Added ${chips(amount)} chips`);
            }
          }}
        />
      )}
    </div>
  );
}

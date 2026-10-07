import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftIcon, ChatCircleIcon, LockIcon, XIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import confetti from 'canvas-confetti';
import clsx from 'clsx';
import '../styles/blackjack.css';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { useGameMode } from '../store/game';
import { useBlackjackTable } from '../hooks/useBlackjackTable';
import { useStage } from '../hooks/useStage';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { BlackjackStage } from '../components/blackjack/BlackjackStage';
import { BlackjackBar } from '../components/blackjack/BlackjackBar';
import { DockPlaceholder } from '../components/table/Dock';
import { bjTimeline } from '../components/blackjack/timeline';
import { ChatPanel } from '../components/table/ChatPanel';
import { InviteButton } from '../components/table/InviteButton';
import { TableSettings } from '../components/table/TableSettings';
import { SoundControl } from '../components/SoundControl';
import { Logo } from '../components/Logo';
import { ApiError, type BlackjackAction } from '../lib/api';
import { serverNow } from '../lib/clock';
import { sound, vibrate } from '../lib/sound';
import { bjSeatOf } from '../../shared/blackjack/engine';
import type { BjAction } from '../../shared/blackjack/types';

export default function BlackjackRoom({ roomId }: { roomId: string }) {
  const me = useAuth((s) => s.session!.user.id);
  const profile = useAuth((s) => s.profile);
  const refreshSeated = useAuth((s) => s.refreshSeated);
  const setMode = useGameMode((s) => s.setMode);
  const [, navigate] = useLocation();
  const t = useBlackjackTable(roomId, me);
  const state = t.state;
  const stageWrap = useRef<HTMLDivElement>(null);
  const metrics = useStage(stageWrap);
  const wide = useMediaQuery('(min-width: 1100px)');
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pending, setPending] = useState(0);
  const lastChatId = useRef(0);
  const lastReactSent = useRef(0);

  useEffect(() => setMode('blackjack'), [setMode]);

  const mySeat = state ? bjSeatOf(state, me) : -1;
  const seat = mySeat >= 0 && state ? state.seats[mySeat] : null;

  // Every round's bet starts empty: the player picks their chips (or rebets their last amount in one tap).
  useEffect(() => setPending(0), [state?.roundNo, mySeat]);

  // Results become visible once the dealer has finished drawing.
  const tl = state ? bjTimeline(state) : null;
  const [, force] = useState(0);
  const resultsAt = tl?.resultsAt ?? null;
  const resultsVisible = resultsAt != null && serverNow() >= resultsAt;
  useEffect(() => {
    if (resultsAt == null || serverNow() >= resultsAt) return;
    const id = window.setTimeout(() => force((x) => x + 1), resultsAt - serverNow() + 20);
    return () => clearTimeout(id);
  }, [resultsAt]);

  // My turn: a nudge once the cards have landed.
  const turnKey = state && state.phase === 'playing' && state.toAct === mySeat ? `${state.roundNo}:${state.handIdx}:${state.seats[mySeat]?.hands[state.handIdx]?.cards.length}` : '';
  const lastTurn = useRef('');
  useEffect(() => {
    if (!turnKey || !state || turnKey.split(':')[2] !== '2' || lastTurn.current === turnKey) return;
    lastTurn.current = turnKey;
    const delay = Math.max(0, (state.turnStartedAt ?? 0) - serverNow());
    const id = window.setTimeout(() => {
      sound.play('turn');
      vibrate([40, 60, 40]);
    }, delay);
    return () => clearTimeout(id);
  }, [turnKey, state]);

  // Confetti for a blackjack or a big win.
  const celebrated = useRef(0);
  useEffect(() => {
    if (!state || !resultsVisible || celebrated.current === state.roundNo || !seat?.hands.length) return;
    celebrated.current = state.roundNo;
    const net = seat.hands.reduce((a, h) => a + h.payout - h.bet, 0);
    const bj = seat.hands.some((h) => h.outcome === 'blackjack');
    if (!bj && net < (seat.hands[0]?.bet ?? 0) * 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = document.querySelector('.bj-seat.seat--me')?.getBoundingClientRect();
    void confetti({
      particleCount: bj ? 140 : 80,
      spread: 80,
      startVelocity: 36,
      origin: r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.8 },
      colors: ['#f5c451', '#ffdf8a', '#3ef0a8', '#ffffff', '#4f8dff'],
      disableForReducedMotion: true,
    });
    vibrate([30, 40, 80]);
  }, [state, seat, resultsVisible]);

  useEffect(() => {
    void refreshSeated();
  }, [mySeat, seat?.bet, state?.phase, refreshSeated]);

  // Chat badge + message sound.
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
    async (action: BlackjackAction) => {
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

  const onAct = useCallback(
    (a: BjAction) => {
      if (!state) return;
      if (a === 'double' || a === 'split') sound.play('chips', { count: 3 });
      void run({ type: 'act', action: a, round: state.roundNo });
    },
    [state, run],
  );

  const leave = async () => {
    if (seat) {
      const inPlay = state?.phase === 'playing' && seat.hands.some((h) => !h.outcome);
      if (inPlay && !window.confirm('Leave the table? Your hand will stand and settle without you.')) return;
      if (!(await run({ type: 'stand' }))) return;
    }
    navigate('/');
  };

  if (t.notFound) {
    return (
      <div className="page page--center">
        <div className="card gate">
          <h2>Table closed</h2>
          <p className="muted">Everyone left, so this table was closed. Any chips on the table are back in your wallet.</p>
          <Link className="btn btn--gold" href="/">
            Back to lobby
          </Link>
        </div>
      </div>
    );
  }

  const name = t.meta?.name ?? 'Blackjack';
  const seated = state?.seats.filter(Boolean).length ?? 0;

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
    <div className={clsx('table-page bj-page', wide && 'table-page--wide')}>
      <header className="table-top">
        <button className="icon-btn" onClick={leave} aria-label="Leave table">
          <ArrowLeftIcon size={18} />
        </button>
        <div className="table-top__title">
          <span className="table-top__name">
            {name}
            {t.meta?.hasPassword && <LockIcon size={12} />}
          </span>
          <span className="table-top__meta">
            <span className={clsx('dot', t.connection === 'live' ? 'dot--live' : 'dot--warn')} />
            {state ? `Blackjack · ${seated}/${state.config.maxSeats} players` : 'Connecting…'}
            {state && state.roundNo > 0 && <span className="table-top__hand"> · Round #{state.roundNo}</span>}
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
          {state && metrics.w > 0 ? (
            <BlackjackStage
              state={state}
              me={me}
              w={metrics.w}
              h={metrics.h}
              portrait={metrics.portrait}
              online={t.online}
              reactions={t.reactions}
              canSit={mySeat < 0}
              pendingBet={pending}
              onSit={(i) => {
                sound.play('click');
                void run({ type: 'sit', seat: i }).then((ok) => ok && sound.play('join'));
              }}
            />
          ) : (
            <div className="spinner" aria-label="Loading table" />
          )}
          {t.connection === 'reconnecting' && <div className="reconnecting">Reconnecting…</div>}
        </div>
        {wide && <aside className="side-chat">{chat}</aside>}
      </div>

      {state ? (
        <BlackjackBar
          state={state}
          mySeat={mySeat}
          wallet={profile?.chips ?? 0}
          busy={busy}
          resultsVisible={resultsVisible}
          pending={pending}
          setPending={setPending}
          onBet={async (amount) => {
            sound.play('chips', { count: 4 });
            await run({ type: 'bet', amount });
          }}
          onClear={() => void run({ type: 'clear' })}
          onAct={onAct}
          onStand={async () => {
            const inPlay = state.phase === 'playing' && seat?.hands.some((h) => !h.outcome);
            if (inPlay && !window.confirm('Stand up now? Your hand will stand and settle without you.')) return;
            if (await run({ type: 'stand' })) toast.info('You left your seat');
          }}
        />
      ) : (
        <DockPlaceholder className="bj-bar" />
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
    </div>
  );
}

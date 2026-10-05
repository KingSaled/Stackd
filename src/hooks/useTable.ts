/**
 * Live connection to one table:
 *  - public table state streamed via Supabase Realtime (postgres_changes), with
 *    version ordering so late/duplicate events never roll the table back,
 *  - the player's private hole cards (RLS-protected row),
 *  - chat + reactions and presence (who is connected),
 *  - timer "ticks": when a turn timer or the next-hand countdown expires, one
 *    connected client (staggered by rank) asks the server to advance the table.
 *    The server only acts if the deadline really passed, so this is safe.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { serverNow } from '../lib/clock';
import { tableAction, type TableAction, type TableActionResponse } from '../lib/api';
import { nextDeadline, seatIndexOf } from '../../shared/poker/engine';
import type { PublicState } from '../../shared/poker/types';

export interface TableMeta {
  id: string;
  name: string;
  hostId: string | null;
  hasPassword: boolean;
}

export interface ChatMessage {
  id: number;
  table_id: string;
  user_id: string;
  name: string;
  avatar: string;
  color: string;
  kind: 'chat' | 'reaction';
  body: string;
  created_at: string;
  /** Arrived over Realtime while the table was open (not part of the loaded history). */
  live?: boolean;
}

export interface MyCards {
  handNo: number;
  seat: number;
  cards: string[];
}

export interface ReactionEvent {
  id: number;
  userId: string;
  emoji: string;
  at: number;
}

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';

const CHAT_LIMIT = 80;

export function useTable(roomId: string, userId: string) {
  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [version, setVersion] = useState(0);
  const [myCards, setMyCards] = useState<MyCards | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [online, setOnline] = useState<Set<string> | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [notFound, setNotFound] = useState(false);

  const versionRef = useRef(0);
  const stateRef = useRef<PublicState | null>(null);
  const lastUpdateRef = useRef(0);
  const chatIds = useRef(new Set<number>());
  const channelRef = useRef<RealtimeChannel | null>(null);

  const applyState = useCallback((next: PublicState, v: number) => {
    lastUpdateRef.current = Date.now();
    if (v <= versionRef.current) return false;
    versionRef.current = v;
    stateRef.current = next;
    setVersion(v);
    setState(next);
    return true;
  }, []);

  const fetchState = useCallback(async () => {
    const { data, error } = await supabase
      .from('tables')
      .select('id, name, host_id, has_password, version, state')
      .eq('id', roomId)
      .maybeSingle();
    if (error) return;
    if (!data) {
      setNotFound(true);
      return;
    }
    setMeta({ id: data.id, name: data.name, hostId: data.host_id, hasPassword: data.has_password });
    applyState(data.state as PublicState, data.version as number);
  }, [roomId, applyState]);

  const fetchCards = useCallback(async () => {
    const { data } = await supabase
      .from('player_cards')
      .select('hand_no, seat, cards')
      .eq('table_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data && Array.isArray(data.cards)) {
      setMyCards((prev) =>
        prev && prev.handNo > data.hand_no ? prev : { handNo: data.hand_no, seat: data.seat, cards: data.cards },
      );
    }
  }, [roomId, userId]);

  const addMessages = useCallback((rows: ChatMessage[]) => {
    const fresh = rows.filter((r) => !chatIds.current.has(r.id));
    if (!fresh.length) return;
    fresh.forEach((r) => chatIds.current.add(r.id));
    const chats = fresh.filter((r) => r.kind === 'chat');
    if (chats.length) setChat((prev) => [...prev, ...chats].sort((a, b) => a.id - b.id).slice(-CHAT_LIMIT));
    const now = Date.now();
    const reacts = fresh.filter((r) => r.kind === 'reaction' && now - Date.parse(r.created_at) < 8000);
    if (reacts.length)
      setReactions((prev) =>
        [...prev, ...reacts.map((r) => ({ id: r.id, userId: r.user_id, emoji: r.body, at: now }))].slice(-24),
      );
  }, []);

  const fetchChat = useCallback(async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('table_id', roomId)
      .order('id', { ascending: false })
      .limit(CHAT_LIMIT);
    if (data) addMessages((data as ChatMessage[]).reverse());
  }, [roomId, addMessages]);

  // Initial load + realtime subscription.
  useEffect(() => {
    versionRef.current = 0;
    stateRef.current = null;
    chatIds.current = new Set();
    setState(null);
    setMyCards(null);
    setChat([]);
    setReactions([]);
    setNotFound(false);
    setOnline(null);
    void fetchState();
    void fetchCards();
    void fetchChat();

    const channel = supabase.channel(`room:${roomId}`, { config: { presence: { key: userId } } });
    channelRef.current = channel;
    channel
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { state?: PublicState; version?: number; name?: string } | undefined;
          if (!row || !row.state || typeof row.version !== 'number') {
            void fetchState();
            return;
          }
          applyState(row.state, row.version);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_cards', filter: `table_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { user_id?: string; hand_no?: number; seat?: number; cards?: string[] } | undefined;
          if (!row || row.user_id !== userId || !Array.isArray(row.cards)) return;
          setMyCards((prev) =>
            prev && prev.handNo > (row.hand_no ?? 0)
              ? prev
              : { handNo: row.hand_no ?? 0, seat: row.seat ?? -1, cards: row.cards! },
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `table_id=eq.${roomId}` },
        (payload) => addMessages([{ ...(payload.new as ChatMessage), live: true }]),
      )
      .on('presence', { event: 'sync' }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('live');
          void channel.track({ at: Date.now() });
          // Catch up on anything that happened while (re)connecting.
          void fetchState();
          void fetchCards();
          void fetchChat();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('reconnecting');
        }
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [roomId, userId, fetchState, fetchCards, fetchChat, applyState, addMessages]);

  // Safety net: refresh on focus / network recovery, and if the stream goes quiet.
  useEffect(() => {
    const refresh = () => {
      void fetchState();
      void fetchCards();
    };
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastUpdateRef.current > 20_000) refresh();
    }, 5000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(id);
    };
  }, [fetchState, fetchCards]);

  // If a new hand was dealt to me but my cards have not arrived yet, fetch them.
  useEffect(() => {
    if (!state) return;
    const seat = seatIndexOf(state, userId);
    if (seat < 0 || !state.seats[seat]?.inHand) return;
    if (myCards && myCards.handNo >= state.handNo) return;
    const id = window.setTimeout(() => void fetchCards(), 700);
    return () => clearTimeout(id);
  }, [state, myCards, userId, fetchCards]);

  // Timer ticks: staggered so normally exactly one client calls the server.
  useEffect(() => {
    if (!state) return;
    const deadline = nextDeadline(state);
    if (deadline == null) return;
    const n = state.seats.length;
    const start = state.toAct >= 0 ? state.toAct : Math.max(0, state.dealer);
    const order: string[] = [];
    for (let k = 0; k < n; k++) {
      const seat = state.seats[(start + k) % n];
      if (seat && (!online || online.has(seat.userId))) order.push(seat.userId);
    }
    let rank = order.indexOf(userId);
    if (rank < 0) rank = order.length + 1 + Math.floor(Math.random() * 3);
    const stagger = 250 + rank * 1400 + Math.random() * 250;
    const v = version;
    let attempts = 0;
    let timer = 0;
    const fire = async () => {
      if (versionRef.current !== v) return;
      try {
        const res = await tableAction(roomId, { type: 'tick' });
        if (!res.changed && versionRef.current === v && attempts < 5) {
          attempts++;
          timer = window.setTimeout(fire, 900 * attempts + Math.random() * 400);
        }
      } catch {
        if (attempts < 5 && versionRef.current === v) {
          attempts++;
          timer = window.setTimeout(fire, 1500 * attempts);
        }
      }
    };
    timer = window.setTimeout(fire, Math.max(0, deadline - serverNow()) + stagger);
    return () => clearTimeout(timer);
  }, [version, state, online, roomId, userId]);

  const send = useCallback(
    async (action: TableAction): Promise<TableActionResponse> => {
      const res = await tableAction(roomId, action);
      if (res.state) applyState(res.state, res.version);
      if (res.myCards) setMyCards(res.myCards);
      return res;
    },
    [roomId, applyState],
  );

  const sendChat = useCallback(
    async (body: string, kind: 'chat' | 'reaction' = 'chat') => {
      const { error } = await supabase.from('chat_messages').insert({ table_id: roomId, kind, body });
      if (error) throw new Error(error.message);
    },
    [roomId],
  );

  return {
    meta,
    state,
    version,
    myCards,
    chat,
    reactions,
    online,
    connection,
    notFound,
    send,
    sendChat,
    refresh: fetchState,
  };
}

export type TableConnection = ReturnType<typeof useTable>;

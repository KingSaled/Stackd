/**
 * Live connection to a blackjack table. Same model as the poker hook: public
 * state streamed over Supabase Realtime with version ordering, chat and
 * presence, and staggered "ticks" so one connected client advances the table
 * when a timer runs out (the server only acts if the deadline really passed).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { serverNow } from '../lib/clock';
import { blackjackAction, type BlackjackAction, type BlackjackActionResponse } from '../lib/api';
import { bjNextDeadline } from '../../shared/blackjack/engine';
import type { BjPublicState } from '../../shared/blackjack/types';
import type { ChatMessage, ConnectionStatus, ReactionEvent, TableMeta } from './useTable';

const CHAT_LIMIT = 80;

export function useBlackjackTable(roomId: string, userId: string) {
  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [state, setState] = useState<BjPublicState | null>(null);
  const [version, setVersion] = useState(0);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [online, setOnline] = useState<Set<string> | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [notFound, setNotFound] = useState(false);

  const versionRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const chatIds = useRef(new Set<number>());

  const applyState = useCallback((next: BjPublicState, v: number) => {
    lastUpdateRef.current = Date.now();
    if (v <= versionRef.current) return false;
    versionRef.current = v;
    setVersion(v);
    setState(next);
    return true;
  }, []);

  const fetchState = useCallback(async () => {
    const { data, error } = await supabase.from('tables').select('id, name, host_id, has_password, version, state').eq('id', roomId).maybeSingle();
    if (error) return;
    if (!data) {
      setNotFound(true);
      return;
    }
    setMeta({ id: data.id, name: data.name, hostId: data.host_id, hasPassword: data.has_password });
    applyState(data.state as BjPublicState, data.version as number);
  }, [roomId, applyState]);

  const addMessages = useCallback((rows: ChatMessage[]) => {
    const fresh = rows.filter((r) => !chatIds.current.has(r.id));
    if (!fresh.length) return;
    fresh.forEach((r) => chatIds.current.add(r.id));
    const chats = fresh.filter((r) => r.kind === 'chat');
    if (chats.length) setChat((prev) => [...prev, ...chats].sort((a, b) => a.id - b.id).slice(-CHAT_LIMIT));
    const now = Date.now();
    const reacts = fresh.filter((r) => r.kind === 'reaction' && now - Date.parse(r.created_at) < 8000);
    if (reacts.length)
      setReactions((prev) => [...prev, ...reacts.map((r) => ({ id: r.id, userId: r.user_id, emoji: r.body, at: now }))].slice(-24));
  }, []);

  const fetchChat = useCallback(async () => {
    const { data } = await supabase.from('chat_messages').select('*').eq('table_id', roomId).order('id', { ascending: false }).limit(CHAT_LIMIT);
    if (data) addMessages((data as ChatMessage[]).reverse());
  }, [roomId, addMessages]);

  useEffect(() => {
    versionRef.current = 0;
    chatIds.current = new Set();
    setState(null);
    setChat([]);
    setReactions([]);
    setNotFound(false);
    setOnline(null);
    void fetchState();
    void fetchChat();

    let channel: RealtimeChannel | null = supabase.channel(`room:${roomId}`, { config: { presence: { key: userId } } });
    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${roomId}` }, (payload) => {
        const row = payload.new as { state?: BjPublicState; version?: number } | undefined;
        if (!row || !row.state || typeof row.version !== 'number') {
          void fetchState();
          return;
        }
        applyState(row.state, row.version);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tables' }, (payload) => {
        if ((payload.old as { id?: string } | undefined)?.id === roomId) setNotFound(true);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `table_id=eq.${roomId}` }, (payload) =>
        addMessages([{ ...(payload.new as ChatMessage), live: true }]),
      )
      .on('presence', { event: 'sync' }, () => {
        if (channel) setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('live');
          void channel?.track({ at: Date.now() });
          void fetchState();
          void fetchChat();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('reconnecting');
        }
      });

    return () => {
      const c = channel;
      channel = null;
      if (c) void supabase.removeChannel(c);
    };
  }, [roomId, userId, fetchState, fetchChat, applyState, addMessages]);

  // Safety net: refresh on focus / network recovery, and if the stream goes quiet.
  useEffect(() => {
    const refresh = () => void fetchState();
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
  }, [fetchState]);

  // Timer ticks, staggered by seat so normally exactly one client calls the server.
  useEffect(() => {
    if (!state) return;
    const deadline = bjNextDeadline(state);
    if (deadline == null) return;
    const order: string[] = [];
    const n = state.seats.length;
    const start = Math.max(0, state.toAct);
    for (let k = 0; k < n; k++) {
      const seat = state.seats[(start + k) % n];
      if (seat && (!online || online.has(seat.userId))) order.push(seat.userId);
    }
    let rank = order.indexOf(userId);
    if (rank < 0) rank = order.length + 1 + Math.floor(Math.random() * 3);
    const stagger = 200 + rank * 1200 + Math.random() * 200;
    const v = version;
    let attempts = 0;
    let timer = 0;
    const fire = async () => {
      if (versionRef.current !== v) return;
      try {
        const res = await blackjackAction(roomId, { type: 'tick' });
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
    async (action: BlackjackAction): Promise<BlackjackActionResponse> => {
      const res = await blackjackAction(roomId, action);
      if (res.state) applyState(res.state, res.version);
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

  return { meta, state, version, chat, reactions, online, connection, notFound, send, sendChat, refresh: fetchState };
}

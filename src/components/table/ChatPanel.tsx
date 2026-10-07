import clsx from 'clsx';
import { HandWavingIcon, ArrowDownIcon, PaperPlaneRightIcon, ScrollIcon, ChatCircleIcon } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LogEntry } from '../../../shared/poker/types';
import type { ChatMessage } from '../../hooks/useTable';
import { REACTIONS } from '../../../shared/economy';
import { Emoji } from '../Emoji';
import { Portrait } from '../Avatar';

interface Props {
  chat: ChatMessage[];
  log: LogEntry[];
  me: string;
  onSend: (text: string) => Promise<void>;
  onReact: (emoji: string) => void;
  canChat: boolean;
}

export function ChatPanel({ chat, log, me, onSend, onReact, canChat }: Props) {
  const [tab, setTab] = useState<'chat' | 'log'>('chat');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Stay pinned to the newest line unless the reader has scrolled up to look back.
  const pinned = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const lastId = tab === 'chat' ? chat[chat.length - 1]?.id ?? 0 : log[log.length - 1]?.id ?? 0;

  const toBottom = (smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    pinned.current = true;
    setUnseen(false);
  };

  // New content: follow it if pinned, otherwise show a "new messages" button.
  useLayoutEffect(() => {
    if (pinned.current) toBottom();
    else setUnseen(true);
  }, [lastId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching tabs always jumps to the latest entries.
  useLayoutEffect(() => toBottom(), [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Late layout changes (emoji images loading, panel resizing, sheet opening) keep the pin.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => pinned.current && (el.scrollTop = el.scrollHeight));
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [lastId, tab]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (pinned.current) setUnseen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(body.slice(0, 280));
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat">
      <div className="chat__tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'chat'} className={clsx(tab === 'chat' && 'is-on')} onClick={() => setTab('chat')}>
          <ChatCircleIcon size={15} /> Chat
        </button>
        <button role="tab" aria-selected={tab === 'log'} className={clsx(tab === 'log' && 'is-on')} onClick={() => setTab('log')}>
          <ScrollIcon size={15} /> Hand log
        </button>
      </div>
      <div className="chat__list" ref={listRef} onScroll={onScroll}>
        {tab === 'chat' ? (
          chat.length === 0 ? (
            <div className="chat__empty">
              <HandWavingIcon size={18} weight="duotone" /> Say hi to the table
            </div>
          ) : (
            chat.map((m) => (
              <div key={m.id} className={clsx('msg', m.user_id === me && 'msg--me')}>
                <span className="msg__avatar" style={{ '--c': m.color } as React.CSSProperties}>
                  <Portrait avatar={m.avatar} />
                </span>
                <div className="msg__body">
                  <span className="msg__name" style={{ color: m.color }}>
                    {m.name}
                  </span>
                  <span className="msg__text">{m.body}</span>
                </div>
              </div>
            ))
          )
        ) : (
          log.map((l) => (
            <div key={l.id} className={clsx('logline', `logline--${l.kind}`)}>
              {l.text}
            </div>
          ))
        )}
      </div>
      {unseen && (
        <button className="chat__jump" onClick={() => toBottom(true)}>
          <ArrowDownIcon size={14} /> New {tab === 'chat' ? 'messages' : 'activity'}
        </button>
      )}
      <div className="chat__reactions">
        {REACTIONS.map((r) => (
          <button key={r} className="react-btn" onClick={() => onReact(r)} disabled={!canChat} aria-label={`React ${r}`}>
            <Emoji char={r} />
          </button>
        ))}
      </div>
      <form className="chat__form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={canChat ? 'Message the table…' : 'Join the room to chat'}
          maxLength={280}
          disabled={!canChat}
          aria-label="Chat message"
        />
        <button className="icon-btn icon-btn--accent" disabled={!canChat || !text.trim() || sending} aria-label="Send">
          <PaperPlaneRightIcon size={16} />
        </button>
      </form>
    </div>
  );
}

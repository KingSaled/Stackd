import clsx from 'clsx';
import { Send, ScrollText, MessageCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../../../shared/poker/types';
import type { ChatMessage } from '../../hooks/useTable';
import { REACTIONS } from '../../../shared/economy';

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

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, log.length, tab]);

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
          <MessageCircle size={15} /> Chat
        </button>
        <button role="tab" aria-selected={tab === 'log'} className={clsx(tab === 'log' && 'is-on')} onClick={() => setTab('log')}>
          <ScrollText size={15} /> Hand log
        </button>
      </div>
      <div className="chat__list" ref={listRef}>
        {tab === 'chat' ? (
          chat.length === 0 ? (
            <div className="chat__empty">Say hi to the table 👋</div>
          ) : (
            chat.map((m) => (
              <div key={m.id} className={clsx('msg', m.user_id === me && 'msg--me')}>
                <span className="msg__avatar" style={{ '--c': m.color } as React.CSSProperties}>
                  {m.avatar}
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
      <div className="chat__reactions">
        {REACTIONS.map((r) => (
          <button key={r} className="react-btn" onClick={() => onReact(r)} disabled={!canChat} aria-label={`React ${r}`}>
            {r}
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
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

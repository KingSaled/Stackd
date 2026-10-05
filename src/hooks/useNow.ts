import { useEffect, useState } from 'react';
import { serverNow } from '../lib/clock';

/** Re-render every `interval` ms with the current server time. */
export function useServerNow(interval = 250, enabled = true): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!enabled) return;
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), interval);
    return () => clearInterval(id);
  }, [interval, enabled]);
  return now;
}

export function useLocalNow(interval = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

/** localStorage wrappers that never throw (private mode, blocked storage, SSR). */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function rememberRoomPassword(roomId: string, password: string) {
  writeJSON(`stackd:pw:${roomId.toUpperCase()}`, password);
}

export function recallRoomPassword(roomId: string): string | null {
  return readJSON<string | null>(`stackd:pw:${roomId.toUpperCase()}`, null);
}

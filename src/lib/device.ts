/**
 * A random id for this browser, kept in local storage. Sent with bonus claims
 * so the server can limit how many accounts collect bonuses on one device.
 * It identifies nothing about the person and the server only stores a hash.
 */
const KEY = 'stackd:device';
let memory: string | null = null;

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function deviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return (memory ??= randomId());
  }
}

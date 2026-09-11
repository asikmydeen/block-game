// Web AuthStorage (task 4.2): localStorage under the existing keys, with a
// per-operation fallback to current-page memory. If a Storage operation throws
// (private mode, quota, disabled), the value still lives for this page load so
// the session keeps working; a subsequent read prefers the last in-memory value.

import {
  WEB_TOKEN_KEY,
  WEB_DEVICE_KEY,
  type AuthStorage,
} from './authStorage';

export function createWebAuthStorage(storage?: Storage): AuthStorage {
  const backing =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  // Current-page memory mirror; authoritative when Storage is unavailable.
  const memory = new Map<string, string | null>();

  function read(key: string): string | null {
    if (memory.has(key)) return memory.get(key) ?? null;
    if (!backing) return null;
    try {
      return backing.getItem(key);
    } catch {
      return null;
    }
  }

  function write(key: string, value: string): void {
    memory.set(key, value);
    if (!backing) return;
    try {
      backing.setItem(key, value);
    } catch {
      /* private mode / quota — the memory mirror holds it for this page */
    }
  }

  function clear(key: string): void {
    memory.set(key, null);
    if (!backing) return;
    try {
      backing.removeItem(key);
    } catch {
      /* ignore — memory mirror already reflects the clear */
    }
  }

  return {
    getToken: async () => read(WEB_TOKEN_KEY),
    setToken: async (t) => write(WEB_TOKEN_KEY, t),
    clearToken: async () => clear(WEB_TOKEN_KEY),
    getDeviceId: async () => read(WEB_DEVICE_KEY),
    setDeviceId: async (d) => write(WEB_DEVICE_KEY, d),
  };
}

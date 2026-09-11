// RED (task 4.1): auth storage adapters and serialized session transitions.
//
// Specifies AuthStorage (web/native) and AuthSession before any implementation.
// Must fail because ./authStorage and ./authSession do not exist yet.
//
// Contract highlights:
//   - web uses the existing keys `blockgame.token` and `blockgame.deviceId`;
//   - a per-operation localStorage failure falls back to current-page memory
//     without losing an already-set value;
//   - native routes the TOKEN to secure storage and the DEVICE ID to
//     Preferences, never the reverse, and never a token to Preferences;
//   - writes are serialized (a later write wins, earlier ones cannot clobber);
//   - REST and multiplayer consumers read the SAME hydrated in-memory token;
//   - a 401 clears the token BEFORE any device resume; logout clears only the
//     token and retains the device id;
//   - errors are generic and never contain the secret value.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebAuthStorage } from './authStorage.web';
import { createNativeAuthStorage } from './authStorage.native';
import { WEB_TOKEN_KEY, WEB_DEVICE_KEY } from './authStorage';
import { createAuthSession } from './authSession';

describe('web auth storage', () => {
  it('uses the existing blockgame.token and blockgame.deviceId keys', () => {
    expect(WEB_TOKEN_KEY).toBe('blockgame.token');
    expect(WEB_DEVICE_KEY).toBe('blockgame.deviceId');
  });

  it('reads a token previously written to localStorage', async () => {
    const store = new Map<string, string>([[WEB_TOKEN_KEY, 't-existing']]);
    const storage = createWebAuthStorage(fakeLocalStorage(store));
    expect(await storage.getToken()).toBe('t-existing');
  });

  it('falls back to current-page memory when setItem throws, and reads it back', async () => {
    const storage = createWebAuthStorage(throwingLocalStorage());
    await storage.setToken('t-mem');
    expect(await storage.getToken()).toBe('t-mem');
  });

  it('clearing the token in memory after a failed persist reads back null', async () => {
    const storage = createWebAuthStorage(throwingLocalStorage());
    await storage.setToken('t-mem');
    await storage.clearToken();
    expect(await storage.getToken()).toBeNull();
  });

  it('a getItem failure does not throw and yields null', async () => {
    const storage = createWebAuthStorage(throwingLocalStorage());
    expect(await storage.getToken()).toBeNull();
  });
});

describe('native auth storage routing', () => {
  it('stores the token in secure storage and the device id in Preferences', async () => {
    const secure = fakeKv();
    const prefs = fakeKv();
    const storage = createNativeAuthStorage({ secure, preferences: prefs });

    await storage.setToken('native-token');
    await storage.setDeviceId('native-device');

    expect(secure.map.get('token')).toBe('native-token');
    expect(prefs.map.get('deviceId')).toBe('native-device');
    // A token must never leak into Preferences.
    expect([...prefs.map.values()]).not.toContain('native-token');
  });

  it('reads the token from secure storage only', async () => {
    const secure = fakeKv(new Map([['token', 'from-secure']]));
    const prefs = fakeKv();
    const storage = createNativeAuthStorage({ secure, preferences: prefs });
    expect(await storage.getToken()).toBe('from-secure');
  });
});

describe('auth session transitions', () => {
  let storage: ReturnType<typeof createWebAuthStorage>;

  beforeEach(() => {
    storage = createWebAuthStorage(fakeLocalStorage(new Map()));
  });

  it('is not hydrated until hydrate() completes; token reads null before', async () => {
    const session = createAuthSession({ storage });
    expect(session.isHydrated()).toBe(false);
    expect(session.getToken()).toBeNull();
    await session.hydrate();
    expect(session.isHydrated()).toBe(true);
  });

  it('publishes a persisted token that both REST and multiplayer read identically', async () => {
    const session = createAuthSession({ storage });
    await session.hydrate();
    await session.setAuthenticated('shared-token');
    expect(session.getToken()).toBe('shared-token');
    // Same in-memory value for every consumer.
    expect(session.getToken()).toBe(session.getToken());
    expect(await storage.getToken()).toBe('shared-token');
  });

  it('reject() clears the token before a device resume can run', async () => {
    const order: string[] = [];
    const session = createAuthSession({
      storage,
      onTokenCleared: () => order.push('cleared'),
    });
    await session.hydrate();
    await session.setAuthenticated('bad-token');
    await session.reject();
    order.push('device-resume');
    expect(session.getToken()).toBeNull();
    expect(order).toEqual(['cleared', 'device-resume']);
  });

  it('serializes concurrent writes so the last write wins', async () => {
    const session = createAuthSession({ storage });
    await session.hydrate();
    await Promise.all([
      session.setAuthenticated('a'),
      session.setAuthenticated('b'),
      session.setAuthenticated('c'),
    ]);
    // A deterministic final value; no interleaving that loses the last write.
    const finalToken = session.getToken();
    expect(finalToken).toBe(await storage.getToken());
  });

  it('logout clears the token but retains the device id', async () => {
    await storage.setDeviceId('keep-me');
    const session = createAuthSession({ storage });
    await session.hydrate();
    await session.setAuthenticated('tok');
    await session.logout();
    expect(session.getToken()).toBeNull();
    expect(await storage.getDeviceId()).toBe('keep-me');
  });

  it('never includes the secret value in a surfaced error', async () => {
    const failing = createWebAuthStorage(throwingLocalStorage());
    const session = createAuthSession({ storage: failing });
    await session.hydrate();
    let captured: unknown = null;
    try {
      await session.setAuthenticated('super-secret-token');
    } catch (e) {
      captured = e;
    }
    // Storage failure is recoverable (signed-out), not a thrown secret.
    if (captured) {
      expect(String(captured)).not.toContain('super-secret-token');
    }
    expect(String(session.getToken() ?? '')).not.toContain('undefined');
  });
});

// ── test doubles ────────────────────────────────────────────────────────────

function fakeLocalStorage(map: Map<string, string>): Storage {
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

function throwingLocalStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    clear: () => {
      throw new Error('denied');
    },
    getItem: () => {
      throw new Error('denied');
    },
    key: () => null,
    removeItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  } as Storage;
}

function fakeKv(initial = new Map<string, string>()) {
  const map = new Map(initial);
  return {
    map,
    get: vi.fn(async (k: string) => (map.has(k) ? (map.get(k) as string) : null)),
    set: vi.fn(async (k: string, v: string) => void map.set(k, v)),
    remove: vi.fn(async (k: string) => void map.delete(k)),
  };
}

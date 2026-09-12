// Property test (task 4.4) — Feature: capacitor-mobile-app, Property 4: Web auth
// storage preserves compatibility or current-page state.
//
// For any token/device-id values and any combination of independently-throwing
// Storage operations, the web adapter must either persist under the existing
// keys (read-after-write) or, when Storage throws, keep the value in
// current-page memory so a subsequent read still returns it; a clear always
// reads back null.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createWebAuthStorage } from '../game/authStorage.web';
import { WEB_TOKEN_KEY, WEB_DEVICE_KEY } from '../game/authStorage';

// A Storage whose get/set/remove each independently either work or throw.
function flakyStorage(fail: { get: boolean; set: boolean; remove: boolean }): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => {
      if (fail.get) throw new Error('get denied');
      return map.has(k) ? (map.get(k) as string) : null;
    },
    setItem: (k: string, v: string) => {
      if (fail.set) throw new Error('set denied');
      map.set(k, v);
    },
    removeItem: (k: string) => {
      if (fail.remove) throw new Error('remove denied');
      map.delete(k);
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  } as Storage;
}

describe('Feature: capacitor-mobile-app, Property 4: Web auth storage preserves compatibility or current-page state', () => {
  it('read-after-write and clear semantics hold regardless of Storage failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 24 }),
        fc.string({ minLength: 1, maxLength: 24 }),
        fc.record({ get: fc.boolean(), set: fc.boolean(), remove: fc.boolean() }),
        async (tokenVal, deviceVal, fail) => {
          const storage = createWebAuthStorage(flakyStorage(fail));

          await storage.setToken(tokenVal);
          // The memory mirror guarantees read-after-write even when Storage throws.
          expect(await storage.getToken()).toBe(tokenVal);

          await storage.setDeviceId(deviceVal);
          expect(await storage.getDeviceId()).toBe(deviceVal);

          await storage.clearToken();
          expect(await storage.getToken()).toBeNull();
          // Clearing the token never affects the device id.
          expect(await storage.getDeviceId()).toBe(deviceVal);
        },
      ),
      { numRuns: 150 },
    );

    // Sanity: the keys are the pre-existing ones the web build already uses.
    expect(WEB_TOKEN_KEY).toBe('blockgame.token');
    expect(WEB_DEVICE_KEY).toBe('blockgame.deviceId');
  });
});

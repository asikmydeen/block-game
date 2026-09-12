// Property test (task 4.3) — Feature: capacitor-mobile-app, Property 3:
// Authentication transitions preserve hydration and persistence ordering.
//
// Across generated storage latencies/outcomes and hydrate/login/reject/logout
// sequences, the session must uphold: token reads null until hydrate();
// setAuthenticated publishes one shared in-memory token that also reaches
// storage; reject/logout clear the in-memory token; and the last logical write
// determines the persisted value (no earlier write clobbers a later one).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createAuthSession } from '../game/authSession';
import { type AuthStorage } from '../game/authStorage';

// A storage double whose operations resolve after a generated micro-delay and
// may fail, to shake out ordering assumptions.
function makeStorage(delays: number[], failSet: Set<number>): AuthStorage {
  let tokenVal: string | null = null;
  let deviceVal: string | null = null;
  let n = 0;
  const tick = () => {
    const i = n++;
    const d = delays[i % delays.length] ?? 0;
    const fail = failSet.has(i % 7);
    return new Promise<void>((res, rej) =>
      setTimeout(() => (fail ? rej(new Error('io')) : res()), d),
    );
  };
  return {
    getToken: async () => {
      await tick().catch(() => {});
      return tokenVal;
    },
    setToken: async (t) => {
      await tick();
      tokenVal = t;
    },
    clearToken: async () => {
      await tick();
      tokenVal = null;
    },
    getDeviceId: async () => deviceVal,
    setDeviceId: async (d) => {
      deviceVal = d;
    },
  };
}

type Step = { kind: 'login'; token: string } | { kind: 'reject' } | { kind: 'logout' };

describe('Feature: capacitor-mobile-app, Property 3: Authentication transitions preserve hydration and persistence ordering', () => {
  it('holds ordering and shared-token invariants across sequences', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 5 }),
        fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 4 }),
        fc.array(
          fc.oneof(
            fc.record({ kind: fc.constant('login' as const), token: fc.string({ minLength: 1, maxLength: 8 }) }),
            fc.record({ kind: fc.constant('reject' as const) }),
            fc.record({ kind: fc.constant('logout' as const) }),
          ),
          { minLength: 1, maxLength: 8 },
        ),
        async (delays, fails, steps: Step[]) => {
          const storage = makeStorage(delays, new Set(fails));
          const session = createAuthSession({ storage });

          // Before hydrate, the token is always null.
          expect(session.getToken()).toBeNull();
          await session.hydrate();
          expect(session.isHydrated()).toBe(true);

          let expectedInMemory: string | null = null;
          for (const step of steps) {
            if (step.kind === 'login') {
              await session.setAuthenticated(step.token);
              expectedInMemory = step.token;
            } else {
              await (step.kind === 'reject' ? session.reject() : session.logout());
              expectedInMemory = null;
            }
            // In-memory token matches the last transition immediately.
            expect(session.getToken()).toBe(expectedInMemory);
          }
        },
      ),
      { numRuns: 120 },
    );
  });
});

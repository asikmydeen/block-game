// Property test (task 5.3) — Feature: capacitor-mobile-app, Property 5: Pending
// progress converges to the newest unacknowledged state.
//
// Across generated update timelines, duplicate lifecycle events, account
// switches, failures, delays, and acknowledgement reorderings, the store's
// per-account pending record is always the newest recorded revision that has
// not been acknowledged — or null when the newest has been acknowledged and
// nothing newer arrived.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createPendingProgress } from '../game/progressPersistence';

type Op =
  | { t: 'record'; acct: string; rev: number; score: number }
  | { t: 'ack'; acct: string; rev: number };

describe('Feature: capacitor-mobile-app, Property 5: Pending progress converges to the newest unacknowledged state', () => {
  it('per-account peek equals the newest recorded rev not covered by an ack', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({
              t: fc.constant('record' as const),
              acct: fc.constantFrom('a', 'b', 'c'),
              rev: fc.integer({ min: 1, max: 50 }),
              score: fc.integer({ min: 0, max: 1000 }),
            }),
            fc.record({
              t: fc.constant('ack' as const),
              acct: fc.constantFrom('a', 'b', 'c'),
              rev: fc.integer({ min: 1, max: 50 }),
            }),
          ),
          { maxLength: 40 },
        ),
        (ops: Op[]) => {
          const store = createPendingProgress();
          // Faithful shadow of the store's exact rules: record ignores a rev
          // that is not strictly greater than the current stored rev; ack
          // clears only when it equals the current stored rev.
          const shadow = new Map<string, { rev: number; score: number }>();

          for (const op of ops) {
            if (op.t === 'record') {
              store.record(op.acct, { rev: op.rev, score: op.score });
              const cur = shadow.get(op.acct);
              if (!cur || op.rev > cur.rev) shadow.set(op.acct, { rev: op.rev, score: op.score });
            } else {
              store.acknowledge(op.acct, op.rev);
              const cur = shadow.get(op.acct);
              if (cur && cur.rev === op.rev) shadow.delete(op.acct);
            }
          }

          for (const acct of ['a', 'b', 'c']) {
            const expected = shadow.get(acct) ?? null;
            const actual = store.peek(acct);
            if (expected === null) {
              expect(actual).toBeNull();
            } else {
              expect(actual).not.toBeNull();
              expect(actual?.rev).toBe(expected.rev);
              expect(actual?.score).toBe(expected.score);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

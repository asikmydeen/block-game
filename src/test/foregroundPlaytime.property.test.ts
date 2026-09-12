// Property test (task 5.4) — Feature: capacitor-mobile-app, Property 6: Playtime
// equals accumulated foreground duration.
//
// For any monotonic visibility timeline (with duplicate transitions), the
// clock's reported seconds equal the sum of foreground intervals only —
// background intervals and duplicate events contribute nothing.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createForegroundClock } from '../game/lifecycle';

type Ev = { kind: 'fg' | 'bg'; dtMs: number };

describe('Feature: capacitor-mobile-app, Property 6: Playtime equals accumulated foreground duration', () => {
  it('reported seconds equal summed foreground intervals only', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom('fg' as const, 'bg' as const),
            dtMs: fc.integer({ min: 0, max: 20000 }),
          }),
          { maxLength: 30 },
        ),
        (events: Ev[]) => {
          let now = 0;
          const clock = createForegroundClock({ now: () => now });

          // Reference: sum time elapsed while the modeled state is foreground.
          let expectedMs = 0;
          let modelForeground = false;

          for (const ev of events) {
            // Advance time; if currently foreground, that elapsed time counts.
            now += ev.dtMs;
            if (modelForeground) expectedMs += ev.dtMs;

            if (ev.kind === 'fg') {
              clock.enterForeground();
              modelForeground = true;
            } else {
              clock.enterBackground();
              modelForeground = false;
            }
          }

          expect(clock.foregroundSeconds()).toBe(Math.floor(expectedMs / 1000));
        },
      ),
      { numRuns: 200 },
    );
  });
});

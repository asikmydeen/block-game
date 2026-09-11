// Property test (task 10.7) — Feature: capacitor-mobile-app, Property 16:
// HUD sampling is bounded and equality-aware.
//
// Over generated position traces sampled against monotonic clocks, the sampler
// never emits more than 5 rounded UNEQUAL publications in any 1-second window,
// and every published value differs at display precision from the one before.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createHudSampler, type HudCoords } from '../game/hudSampler';

describe('Feature: capacitor-mobile-app, Property 16: HUD sampling is bounded and equality-aware', () => {
  it('emits at most 5 unequal rounded publications in any 1s window', () => {
    const frameArb = fc.record({
      dt: fc.integer({ min: 1, max: 120 }), // ms between frames (>= ~8fps)
      x: fc.float({ min: -1000, max: 1000, noNaN: true }),
      y: fc.float({ min: -100, max: 100, noNaN: true }),
      z: fc.float({ min: -1000, max: 1000, noNaN: true }),
    });
    fc.assert(
      fc.property(fc.array(frameArb, { minLength: 1, maxLength: 400 }), (frames) => {
        const published: Array<{ t: number; c: HudCoords }> = [];
        const s = createHudSampler({
          publish: (c) => published.push({ t: nowMs, c }),
          precision: 1,
        });
        let nowMs = 0;
        for (const f of frames) {
          nowMs += f.dt;
          s.sample(nowMs, { x: f.x, y: f.y, z: f.z });
        }

        // Consecutive publications must differ at display precision.
        for (let i = 1; i < published.length; i++) {
          const a = published[i - 1].c;
          const b = published[i].c;
          expect(a.x === b.x && a.y === b.y && a.z === b.z).toBe(false);
        }

        // No 1000ms window contains more than 5 publications.
        for (let i = 0; i < published.length; i++) {
          const windowStart = published[i].t;
          let count = 0;
          for (let j = i; j < published.length && published[j].t < windowStart + 1000; j++) {
            count++;
          }
          expect(count).toBeLessThanOrEqual(5);
        }
      }),
      { numRuns: 200 },
    );
  });
});

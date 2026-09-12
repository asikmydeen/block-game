// Property test (task 8.3) — Feature: capacitor-mobile-app, Property 11: Chunk
// windows are centered, bounded, and notification-stable.
//
// Across generated spawn+movement paths (including negative coords and long
// runs of continuous same-chunk movement), after every step the active set is
// EXACTLY the 7x7 window centered on the current chunk, the retained set is
// bounded at <=81, and NO membership notification fires while the player stays
// within the same chunk.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createWorldChunkManager, MAX_RETAINED } from '../game/worldChunkManager';
import { generateChunk } from '../game/terrain';

const SEED = 7;

function expectedActive(cx: number, cz: number): Set<string> {
  const s = new Set<string>();
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      s.add(`${cx + dx},${cz + dz}`);
    }
  }
  return s;
}

describe('Feature: capacitor-mobile-app, Property 11: Chunk windows are centered, bounded, and notification-stable', () => {
  it('active is always 7x7 centered, retained <=81, and same-chunk moves never notify', () => {
    fc.assert(
      fc.property(
        // A path of target chunk coords, with some steps repeated to force
        // continuous same-chunk movement. Ranges/lengths are kept modest so
        // 100+ runs stay fast despite each recenter regenerating up to 81
        // full 16x32 chunks.
        fc.array(
          fc.record({
            cx: fc.integer({ min: -8, max: 8 }),
            cz: fc.integer({ min: -8, max: 8 }),
            repeat: fc.integer({ min: 1, max: 4 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (steps) => {
          const m = createWorldChunkManager({ seed: SEED, generate: generateChunk });
          let notifications = 0;
          m.subscribe(() => notifications++);

          let cur: [number, number] | null = null;
          for (const step of steps) {
            for (let r = 0; r < step.repeat; r++) {
              const before = notifications;
              const changed = m.recenter(step.cx, step.cz);
              const same = cur !== null && cur[0] === step.cx && cur[1] === step.cz;

              if (same) {
                // continuous same-chunk movement must publish nothing
                expect(changed).toBe(false);
                expect(notifications).toBe(before);
              } else {
                expect(changed).toBe(true);
                expect(notifications).toBe(before + 1);
              }
              cur = [step.cx, step.cz];

              // Invariants after every step
              expect(new Set(m.getActiveKeys())).toEqual(expectedActive(step.cx, step.cz));
              expect(m.getActiveKeys().size).toBe(49);
              expect(m.getRetainedKeys().size).toBeLessThanOrEqual(MAX_RETAINED);
              // retained is a superset of active (seam ring prepared)
              for (const k of m.getActiveKeys()) {
                expect(m.getRetainedKeys().has(k)).toBe(true);
              }
            }
          }
          m.dispose();
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});

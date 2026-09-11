// Property test (task 8.6) — Feature: capacitor-mobile-app, Property 12:
// Edited chunk regeneration is a stable round trip.
//
// For any seed, chunk coord (incl. negative), authored baseline, and set of
// player edits (explicit air and solid), evicting a chunk and reloading it
// yields exactly the same composed contents it had before eviction — the base
// regenerates identically from the stable seed and the session-owned overlays
// (authored + player) are reapplied.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createWorldChunkManager } from '../game/worldChunkManager';
import { generateChunk, BlockType } from '../game/terrain';

const SOLIDS: BlockType[] = ['stone', 'wood', 'glass', 'neon', 'metal', 'concrete'];

describe('Feature: capacitor-mobile-app, Property 12: Edited chunk regeneration is a stable round trip', () => {
  it('evict + reload restores identical composed chunk contents', () => {
    fc.assert(
      fc.property(
        fc.record({
          seed: fc.integer({ min: 1, max: 9999 }),
          cx: fc.integer({ min: -20, max: 20 }),
          cz: fc.integer({ min: -20, max: 20 }),
          authored: fc.array(
            fc.record({
              lx: fc.integer({ min: 0, max: 15 }),
              ly: fc.integer({ min: 1, max: 20 }),
              lz: fc.integer({ min: 0, max: 15 }),
              type: fc.constantFrom<BlockType>(...SOLIDS),
            }),
            { maxLength: 6 },
          ),
          edits: fc.array(
            fc.record({
              lx: fc.integer({ min: 0, max: 15 }),
              ly: fc.integer({ min: 1, max: 20 }),
              lz: fc.integer({ min: 0, max: 15 }),
              // include explicit air to remove terrain
              type: fc.constantFrom<BlockType>(...SOLIDS, 'air'),
            }),
            { maxLength: 8 },
          ),
        }),
        ({ seed, cx, cz, authored, edits }) => {
          const m = createWorldChunkManager({ seed, generate: generateChunk });
          m.recenter(cx, cz);

          const base = cx * 16;
          const baseZ = cz * 16;
          m.authorBlocks(authored.map(a => ({ wx: base + a.lx, wy: a.ly, wz: baseZ + a.lz, type: a.type })));
          for (const e of edits) {
            m.setBlock(base + e.lx, e.ly, baseZ + e.lz, e.type);
          }

          const before = new Map(m.getChunk(cx, cz)!);

          // Lifecycle churn: teleport far enough to evict (past the 9x9
          // retained radius), then return. Distance 9 clears the window.
          m.recenter(cx + 9, cz + 9);
          expect(m.getRetainedKeys().has(`${cx},${cz}`)).toBe(false);
          m.recenter(cx, cz);

          const after = new Map(m.getChunk(cx, cz)!);
          expect(after).toEqual(before);
          m.dispose();
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});

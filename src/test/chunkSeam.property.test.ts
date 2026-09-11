// Property test (task 8.7) — Feature: capacitor-mobile-app, Property 13: Seam
// edits preserve neighbor mesh semantics.
//
// An edit on a chunk edge or corner (1) invalidates every neighbor whose
// face-culling / AO can observe the edited edge or corner, and (2) after the
// edited region is evicted and reloaded, the regenerated culling/AO decisions
// for each affected neighbor are identical to those of a reference world that
// applied the same edit and never evicted.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createWorldChunkManager, WorldChunkManager } from '../game/worldChunkManager';
import { buildChunkGeometry } from '../game/buildChunkGeometry';
import { BlockType } from '../game/terrain';

const SOLIDS: BlockType[] = ['stone', 'wood', 'metal', 'concrete', 'neon'];

// A cheap, fully deterministic terrain used to keep 100+ runs fast: a flat
// solid slab (y=0..3) with a stable per-column ore accent. It still exercises
// cross-seam face culling and AO because adjacent chunks share solid edges, so
// seam equivalence is a meaningful assertion. Determinism (seed + coords ->
// identical chunk) is what the round-trip regeneration relies on.
const SLAB_H = 4;
function cheapGenerate(cx: number, cz: number, seed: number): Map<string, BlockType> {
  const blocks = new Map<string, BlockType>();
  for (let lx = 0; lx < 16; lx++) {
    for (let lz = 0; lz < 16; lz++) {
      const wx = cx * 16 + lx;
      const wz = cz * 16 + lz;
      for (let y = 0; y < SLAB_H; y++) {
        let t: BlockType = 'stone';
        if (y === SLAB_H - 1) t = 'grass';
        else if (((wx * 31 + wz * 17 + seed + y) & 7) === 0) t = 'coal';
        blocks.set(`${lx},${y},${lz}`, t);
      }
    }
  }
  return blocks;
}

// Geometry decisions that must be seam-stable: vertex positions, baked colors
// (which encode shade*AO), and index winding.
function geoSignature(m: WorldChunkManager, cx: number, cz: number) {
  const chunk = m.getChunk(cx, cz)!;
  const g = buildChunkGeometry(cx, cz, chunk, m.getBlock);
  return {
    pos: g.opaque.positions,
    col: g.opaque.colors,
    idx: g.opaque.indices,
  };
}

describe('Feature: capacitor-mobile-app, Property 13: Seam edits preserve neighbor mesh semantics', () => {
  it('edge/corner edits invalidate the right neighbors and regenerate identical culling/AO', () => {
    fc.assert(
      fc.property(
        fc.record({
          seed: fc.integer({ min: 1, max: 9999 }),
          // pick an edge or corner local coordinate on chunk (0,0)
          onXEdge: fc.boolean(),
          onZEdge: fc.boolean(),
          highX: fc.boolean(),
          highZ: fc.boolean(),
          ly: fc.integer({ min: 0, max: SLAB_H }),
          type: fc.constantFrom<BlockType>(...SOLIDS, 'air'),
        }),
        ({ seed, onXEdge, onZEdge, highX, highZ, ly, type }) => {
          const lx = onXEdge ? (highX ? 15 : 0) : 8;
          const lz = onZEdge ? (highZ ? 15 : 0) : 8;

          // Reference: never evicted.
          const ref = createWorldChunkManager({ seed, generate: cheapGenerate });
          ref.recenter(0, 0);
          const refAffected = new Set(ref.setBlock(lx, ly, lz, type));

          // Subject: same edit, then evict the neighborhood and reload.
          const sub = createWorldChunkManager({ seed, generate: cheapGenerate });
          sub.recenter(0, 0);
          const subAffected = new Set(sub.setBlock(lx, ly, lz, type));

          // (1) Invalidation sets match, and always include self.
          expect(subAffected).toEqual(refAffected);
          expect(refAffected.has('0,0')).toBe(true);

          // Determine which neighbors an edge/corner edit should reach.
          const expectedNeighbors = new Set<string>(['0,0']);
          const xs = lx === 0 ? [-1, 0] : lx === 15 ? [0, 1] : [0];
          const zs = lz === 0 ? [-1, 0] : lz === 15 ? [0, 1] : [0];
          for (const dx of xs) for (const dz of zs) expectedNeighbors.add(`${dx},${dz}`);
          expect(refAffected).toEqual(expectedNeighbors);

          // (2) Evict + reload subject, then compare regenerated geometry for
          // each affected neighbor against the never-evicted reference.
          sub.recenter(9, 9);
          sub.recenter(0, 0);

          for (const key of refAffected) {
            const [nx, nz] = key.split(',').map(Number);
            const rSig = geoSignature(ref, nx, nz);
            const sSig = geoSignature(sub, nx, nz);
            expect(sSig.pos).toEqual(rSig.pos);
            expect(sSig.col).toEqual(rSig.col);
            expect(sSig.idx).toEqual(rSig.idx);
          }

          ref.dispose();
          sub.dispose();
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);
});

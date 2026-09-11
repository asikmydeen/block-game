// RED (task 8.4): overlay merge + seam invalidation semantics. Must fail
// because ./buildChunkGeometry does not exist yet (seam-equivalence assertion
// uses it) and the overlay merge/redundant-edit/revision behavior is exercised.
//
// - Composition order: base -> authored -> player (player wins).
// - Explicit air: a player edit of 'air' overrides solid terrain.
// - Redundant edits: setting a block back to what base/authored already yields
//   leaves no residual overlay entry.
// - Eviction/regeneration round trip: an edited chunk evicted then reloaded
//   still shows its (session-owned) overlay edits.
// - Background/resume: overlays are retained across a dispose-less recenter
//   churn that evicts and reloads the chunk.
// - Stable seed: base regenerates identically.
// - Mesh-revision invalidation: an edge edit bumps the touched cardinal
//   neighbor; a corner edit bumps the diagonal neighbor too.
// - Seam equivalence: culling/AO decisions for a chunk match a non-evicted
//   reference world built from the same seed + edits.

import { describe, it, expect } from 'vitest';
import { createWorldChunkManager } from '../game/worldChunkManager';
import { buildChunkGeometry } from '../game/buildChunkGeometry';
import { generateChunk } from '../game/terrain';

const SEED = 99;

function make() {
  return createWorldChunkManager({ seed: SEED, generate: generateChunk });
}

describe('WorldChunkManager — overlay merge order', () => {
  it('composes base -> authored -> player with player winning', () => {
    const m = make();
    m.recenter(0, 0);
    // stone sits at y below surface somewhere; edit a known surface voxel.
    // surface grass is at y=12 for lx=0,lz=0 (world 0,12,0)
    expect(m.getBlock(0, 12, 0)).toBe('grass');
    m.authorBlocks([{ wx: 0, wy: 12, wz: 0, type: 'stone' }]);
    expect(m.getBlock(0, 12, 0)).toBe('stone');
    m.setBlock(0, 12, 0, 'wood');
    expect(m.getBlock(0, 12, 0)).toBe('wood');
  });

  it('preserves explicit air edits over solid terrain', () => {
    const m = make();
    m.recenter(0, 0);
    expect(m.getBlock(0, 12, 0)).toBe('grass');
    m.setBlock(0, 12, 0, 'air');
    expect(m.getBlock(0, 12, 0)).toBe('air');
  });

  it('removes a redundant player edit that restores the underlying value', () => {
    const m = make();
    m.recenter(0, 0);
    const original = m.getBlock(0, 12, 0)!; // grass
    m.setBlock(0, 12, 0, 'wood');
    expect(m.getBlock(0, 12, 0)).toBe('wood');
    // restore to the base value -> overlay entry should be dropped
    m.setBlock(0, 12, 0, original);
    expect(m.getBlock(0, 12, 0)).toBe(original);
    // an air voxel above ground restored to air is redundant too
    m.setBlock(0, 20, 0, 'air');
    expect(m.getBlock(0, 20, 0)).toBe(undefined);
  });
});

describe('WorldChunkManager — eviction / regeneration round trip', () => {
  it('retains overlay edits across eviction and reload', () => {
    const m = make();
    m.recenter(0, 0);
    m.setBlock(0, 12, 0, 'neon');
    expect(m.getBlock(0, 12, 0)).toBe('neon');
    m.recenter(40, 40); // evict (0,0)
    expect(m.getRetainedKeys().has('0,0')).toBe(false);
    m.recenter(0, 0); // reload (0,0)
    expect(m.getBlock(0, 12, 0)).toBe('neon');
  });

  it('regenerates identical base across eviction (stable seed)', () => {
    const m = make();
    m.recenter(0, 0);
    const before = new Map(m.getChunk(1, 1)!);
    m.recenter(40, 40);
    m.recenter(0, 0);
    expect(m.getChunk(1, 1)).toEqual(before);
  });

  it('retains overlays through background/resume churn', () => {
    const m = make();
    m.recenter(0, 0);
    m.setBlock(5, 13, 5, 'glass');
    // simulate background: player teleports far and back several times
    m.recenter(60, 60);
    m.recenter(-60, -60);
    m.recenter(0, 0);
    expect(m.getBlock(5, 13, 5)).toBe('glass');
  });
});

describe('WorldChunkManager — mesh-revision invalidation', () => {
  it('bumps the cardinal neighbor when an edit sits on a chunk edge', () => {
    const m = make();
    m.recenter(0, 0);
    const before = m.getRevision(-1, 0);
    // world x=0 is lx=0 of chunk 0 -> touches chunk -1 on the -x edge
    m.setBlock(0, 13, 5, 'stone');
    expect(m.getRevision(-1, 0)).toBe(before + 1);
  });

  it('bumps the diagonal neighbor when an edit sits on a chunk corner', () => {
    const m = make();
    m.recenter(0, 0);
    const beforeDiag = m.getRevision(-1, -1);
    const beforeX = m.getRevision(-1, 0);
    const beforeZ = m.getRevision(0, -1);
    // world (0,*,0) is corner lx=0,lz=0 -> touches -x, -z, and -x,-z diagonal
    m.setBlock(0, 13, 0, 'stone');
    expect(m.getRevision(-1, 0)).toBe(beforeX + 1);
    expect(m.getRevision(0, -1)).toBe(beforeZ + 1);
    expect(m.getRevision(-1, -1)).toBe(beforeDiag + 1);
  });
});

describe('WorldChunkManager — seam equivalence vs non-evicted reference', () => {
  it('produces identical geometry face/AO decisions after eviction+reload as a never-evicted reference', () => {
    // Reference world: never evicts (huge implicit window via manual generation)
    const ref = make();
    ref.recenter(0, 0);
    ref.setBlock(0, 13, 0, 'stone'); // seam-adjacent edit at a corner
    const refGeo = buildChunkGeometry(0, 0, ref.getChunk(0, 0)!, ref.getBlock);

    // Subject world: same edit, but the chunk is evicted and reloaded.
    const sub = make();
    sub.recenter(0, 0);
    sub.setBlock(0, 13, 0, 'stone');
    sub.recenter(40, 40);
    sub.recenter(0, 0);
    const subGeo = buildChunkGeometry(0, 0, sub.getChunk(0, 0)!, sub.getBlock);

    expect(subGeo.opaque.positions).toEqual(refGeo.opaque.positions);
    expect(subGeo.opaque.colors).toEqual(refGeo.opaque.colors);
    expect(subGeo.opaque.indices).toEqual(refGeo.opaque.indices);
  });
});

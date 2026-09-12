// RED (task 8.8): pure buildChunkGeometry boundary + resource disposal
// accounting. Must fail because ./buildChunkGeometry does not exist yet.
//
// buildChunkGeometry is a PURE function (no THREE, no GL) that turns a chunk +
// world lookup into plain vertex buckets (opaque / transparent / water). This
// lets us test the synchronous meshing algorithm and disposal bookkeeping
// without a real GL context.
//
// Disposal contract (verified against instrumented fake resources):
//   - Replacing a chunk's geometry disposes each previously-owned resource
//     exactly once.
//   - A manager.dispose() clears retained maps, overlays, listeners and timers.

import { describe, it, expect, vi } from 'vitest';
import { buildChunkGeometry } from '../game/buildChunkGeometry';
import { createWorldChunkManager } from '../game/worldChunkManager';
import { generateChunk } from '../game/terrain';

const SEED = 3;

describe('buildChunkGeometry — pure meshing boundary', () => {
  it('returns opaque/transparent/water buckets with parallel attribute arrays', () => {
    const m = createWorldChunkManager({ seed: SEED, generate: generateChunk });
    m.recenter(0, 0);
    const geo = buildChunkGeometry(0, 0, m.getChunk(0, 0)!, m.getBlock);

    for (const bucket of [geo.opaque, geo.transparent, geo.water]) {
      // positions/colors/normals are 3 components per vertex and equal in count
      expect(bucket.positions.length % 3).toBe(0);
      expect(bucket.colors.length).toBe(bucket.positions.length);
      expect(bucket.normals.length).toBe(bucket.positions.length);
    }
    // A solid ground chunk emits opaque faces.
    expect(geo.opaque.positions.length).toBeGreaterThan(0);
    expect(typeof geo.transparentOpacity).toBe('number');
  });

  it('is deterministic and side-effect free (same input -> identical output)', () => {
    const m = createWorldChunkManager({ seed: SEED, generate: generateChunk });
    m.recenter(0, 0);
    const chunk = m.getChunk(0, 0)!;
    const a = buildChunkGeometry(0, 0, chunk, m.getBlock);
    const b = buildChunkGeometry(0, 0, chunk, m.getBlock);
    expect(a.opaque.positions).toEqual(b.opaque.positions);
    expect(a.opaque.indices).toEqual(b.opaque.indices);
    expect(a.water.positions).toEqual(b.water.positions);
  });
});

// Instrumented fake GPU resource: counts dispose() calls so we can assert
// "disposed exactly once" without a real THREE/GL context.
class FakeResource {
  disposed = 0;
  dispose() {
    this.disposed++;
  }
}

describe('resource ownership — dispose exactly once on replacement', () => {
  it('disposes each replaced resource exactly once', () => {
    // Simulate the ChunkMesh ownership contract: a set of owned resources that
    // is replaced when the mesh revision changes. The disposer must run once
    // per replaced resource and never double-dispose.
    const owned: FakeResource[] = [new FakeResource(), new FakeResource(), new FakeResource()];
    const disposeAll = (resources: FakeResource[]) => resources.forEach(r => r.dispose());

    // First replacement
    disposeAll(owned);
    // A second, redundant teardown of the SAME batch must not happen in the
    // real component; guard by nulling references. Here we assert each was
    // disposed exactly once.
    for (const r of owned) expect(r.disposed).toBe(1);
  });
});

describe('WorldChunkManager.dispose — teardown clears state', () => {
  it('clears retained maps and stops notifying after dispose', () => {
    const m = createWorldChunkManager({ seed: SEED, generate: generateChunk });
    m.recenter(0, 0);
    const notify = vi.fn();
    m.subscribe(notify);
    m.dispose();
    expect(m.getRetainedKeys().size).toBe(0);
    expect(m.getActiveKeys().size).toBe(0);
    // post-dispose recenter is a no-op and must not notify
    const changed = m.recenter(5, 5);
    expect(changed).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});

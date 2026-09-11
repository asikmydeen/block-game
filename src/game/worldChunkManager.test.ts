// RED (task 8.1): bounded chunk-window state machine. Must fail because
// ./worldChunkManager does not exist yet.
//
// The manager keeps a bounded set of chunks around the player: EXACTLY a 7x7
// active window centered on the player's chunk, AT MOST a 9x9 (<=81) retained
// set (active + a one-chunk seam ring), with immediate eviction of anything
// outside the retained window. It publishes ONE membership snapshot per
// recenter transaction, never mid-transaction, and never at all when the
// player stays in the same chunk. A generation failure rolls back: prior
// membership is left intact and no notification fires.

import { describe, it, expect, vi } from 'vitest';
import { createWorldChunkManager } from './worldChunkManager';
import { generateChunk, BlockType } from './terrain';

const SEED = 1234;

function activeKeys(cx: number, cz: number): Set<string> {
  const s = new Set<string>();
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      s.add(`${cx + dx},${cz + dz}`);
    }
  }
  return s;
}

function make(overrides?: Partial<Parameters<typeof createWorldChunkManager>[0]>) {
  return createWorldChunkManager({ seed: SEED, generate: generateChunk, ...overrides });
}

describe('WorldChunkManager — bounded window state machine', () => {
  it('spawn at origin publishes exactly a 7x7 active window centered on (0,0)', () => {
    const m = make();
    const notify = vi.fn();
    m.subscribe(notify);
    m.recenter(0, 0);
    const active = m.getActiveKeys();
    expect(active.size).toBe(49);
    expect(new Set(active)).toEqual(activeKeys(0, 0));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('centers the 7x7 window on NEGATIVE player chunks too', () => {
    const m = make();
    m.recenter(-5, -8);
    const active = new Set(m.getActiveKeys());
    expect(active.size).toBe(49);
    expect(active).toEqual(activeKeys(-5, -8));
    expect(active.has('-8,-11')).toBe(true);
    expect(active.has('-2,-5')).toBe(true);
  });

  it('retains AT MOST 9x9 (<=81) chunks after a recenter', () => {
    const m = make();
    m.recenter(0, 0);
    m.recenter(1, 0);
    m.recenter(2, 2);
    expect(m.getRetainedKeys().size).toBeLessThanOrEqual(81);
    // active must still be exactly 7x7 centered on the latest chunk
    expect(new Set(m.getActiveKeys())).toEqual(activeKeys(2, 2));
  });

  it('same-chunk movement early-returns and publishes NO notification', () => {
    const m = make();
    m.recenter(3, 3);
    const notify = vi.fn();
    m.subscribe(notify);
    const changed = m.recenter(3, 3);
    expect(changed).toBe(false);
    expect(notify).not.toHaveBeenCalled();
    expect(new Set(m.getActiveKeys())).toEqual(activeKeys(3, 3));
  });

  it('recenter is transactional: the published snapshot is the post-move window, never a partial', () => {
    const m = make();
    m.recenter(0, 0);
    let snapshots: Array<Set<string>> = [];
    m.subscribe(() => snapshots.push(new Set(m.getActiveKeys())));
    m.recenter(10, 10);
    // exactly one publish, and it is already the fully-recentered window
    expect(snapshots.length).toBe(1);
    expect(snapshots[0]).toEqual(activeKeys(10, 10));
  });

  it('prepares seam-ring neighbors (retained superset of active) before publishing', () => {
    const m = make();
    let retainedAtPublish: Set<string> | null = null;
    m.subscribe(() => {
      retainedAtPublish = new Set(m.getRetainedKeys());
    });
    m.recenter(0, 0);
    expect(retainedAtPublish).not.toBeNull();
    // every active key present at publish time, plus the seam ring generated
    for (const k of activeKeys(0, 0)) {
      expect(retainedAtPublish!.has(k)).toBe(true);
    }
    // seam neighbor one past the active edge is prepared
    expect(retainedAtPublish!.has('4,0')).toBe(true);
  });

  it('evicts out-of-window chunks immediately (non-debounced) on recenter', () => {
    const m = make();
    m.recenter(0, 0);
    expect(m.getRetainedKeys().has('0,0')).toBe(true);
    // move far enough that (0,0) is well outside the 9x9 retained window
    m.recenter(20, 20);
    expect(m.getRetainedKeys().has('0,0')).toBe(false);
  });

  it('uses a stable seed so a chunk regenerates identically after eviction', () => {
    const m = make();
    m.recenter(0, 0);
    const before = m.getChunk(0, 0)!;
    const beforeSnapshot = new Map(before);
    m.recenter(30, 30); // evicts (0,0)
    expect(m.getRetainedKeys().has('0,0')).toBe(false);
    m.recenter(0, 0); // regenerates (0,0)
    const after = m.getChunk(0, 0)!;
    expect(after).toEqual(beforeSnapshot);
  });

  it('rolls back on generation failure: prior membership intact, no notification', () => {
    let calls = 0;
    const flaky = (cx: number, cz: number, seed: number): Map<string, BlockType> => {
      calls++;
      // succeed for the initial center, then throw on a later recenter
      if (calls > 49 && cx === 100) throw new Error('boom');
      return generateChunk(cx, cz, seed);
    };
    const m = make({ generate: flaky });
    m.recenter(0, 0);
    const priorActive = new Set(m.getActiveKeys());
    const priorRetained = new Set(m.getRetainedKeys());
    const notify = vi.fn();
    m.subscribe(notify);
    expect(() => m.recenter(100, 100)).toThrow();
    // membership unchanged, nothing published
    expect(new Set(m.getActiveKeys())).toEqual(priorActive);
    expect(new Set(m.getRetainedKeys())).toEqual(priorRetained);
    expect(notify).not.toHaveBeenCalled();
  });
});

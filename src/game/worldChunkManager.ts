// GREEN (task 8.2 + 8.5): bounded world chunk store.
//
// The manager owns a bounded set of chunks around the player. On recenter it
// generates the 7x7 active window plus a one-chunk seam ring (so the mesher can
// cull faces / bake AO across seams), then publishes ONE membership snapshot.
// Anything outside the 9x9 retained window is evicted immediately.
//
// Chunks come in two layers that are kept strictly separate:
//   - base (generated terrain): evictable and regenerable from the stable seed
//   - overlays (authored + player edits): session-owned, NEVER evicted, so an
//     edit survives the chunk being unloaded and reloaded.
// A composed chunk = base with authored applied over it, then player edits over
// that. Explicit air edits are preserved (an edit of 'air' overrides terrain).

import { BlockType } from './terrain';

const CHUNK_SIZE = 16;
export const ACTIVE_RADIUS = 3; // 7x7 active window
export const SEAM_RADIUS = ACTIVE_RADIUS + 1; // 9x9 retained window (active + seam)
export const MAX_RETAINED = (2 * SEAM_RADIUS + 1) ** 2; // 81

export type GenerateFn = (cx: number, cz: number, seed: number) => Map<string, BlockType>;

export type MembershipListener = () => void;

/** A per-chunk overlay of authored or player edits, keyed by `lx,ly,lz`. */
type Overlay = Map<string, BlockType>;

export interface WorldChunkManagerOptions {
  seed: number;
  generate: GenerateFn;
}

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** Maps a world coord to `[cx, cz, lx, ly, lz]`, wrapping negative locals. */
export function worldToLocal(
  wx: number,
  wy: number,
  wz: number,
): [number, number, number, number, number] {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  let lx = wx - cx * CHUNK_SIZE;
  let lz = wz - cz * CHUNK_SIZE;
  if (lx < 0) lx += CHUNK_SIZE;
  if (lz < 0) lz += CHUNK_SIZE;
  return [cx, cz, lx, wy, lz];
}

export function worldToChunk(wx: number, wz: number): [number, number] {
  return [Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE)];
}

export interface WorldChunkManager {
  /** Recenter the window on a chunk. Returns true iff membership changed. */
  recenter: (cx: number, cz: number) => boolean;
  /** Recenter using world coords (chunk derived internally). */
  recenterWorld: (wx: number, wz: number) => boolean;
  getActiveKeys: () => Set<string>;
  getRetainedKeys: () => Set<string>;
  /** Composed (base + overlays) view of a retained chunk, or undefined. */
  getChunk: (cx: number, cz: number) => Map<string, BlockType> | undefined;
  getBlock: (wx: number, wy: number, wz: number) => BlockType | undefined;
  /** Apply an edit at world coords. Returns affected neighbor chunk keys
   *  (self + any seam neighbor whose culling/AO can observe the edit). */
  setBlock: (wx: number, wy: number, wz: number, type: BlockType) => string[];
  setBlocks: (updates: Array<{ wx: number; wy: number; wz: number; type: BlockType }>) => string[];
  /** Author baseline edits (survive eviction, applied under player edits). */
  authorBlocks: (updates: Array<{ wx: number; wy: number; wz: number; type: BlockType }>) => string[];
  /** Monotonic revision for a chunk's mesh; bumps when its geometry may change. */
  getRevision: (cx: number, cz: number) => number;
  subscribe: (listener: MembershipListener) => () => void;
  dispose: () => void;
}

export function createWorldChunkManager(opts: WorldChunkManagerOptions): WorldChunkManager {
  const { seed, generate } = opts;

  // Base terrain (evictable) and session-owned overlays (never evicted).
  const base = new Map<string, Map<string, BlockType>>();
  const authored = new Map<string, Overlay>();
  const player = new Map<string, Overlay>();
  // Composed chunk cache, rebuilt on edit/generation, cleared on eviction.
  const composed = new Map<string, Map<string, BlockType>>();
  const revision = new Map<string, number>();

  let active = new Set<string>();
  let retained = new Set<string>();
  let center: [number, number] | null = null;
  let disposed = false;

  const listeners = new Set<MembershipListener>();

  const bumpRevision = (key: string) => {
    revision.set(key, (revision.get(key) ?? 0) + 1);
  };

  const compose = (cx: number, cz: number): Map<string, BlockType> => {
    const key = chunkKey(cx, cz);
    const b = base.get(key);
    const out = new Map<string, BlockType>(b ?? []);
    const a = authored.get(key);
    if (a) for (const [k, v] of a) out.set(k, v);
    const p = player.get(key);
    if (p) for (const [k, v] of p) out.set(k, v);
    composed.set(key, out);
    return out;
  };

  const ensureBase = (cx: number, cz: number) => {
    const key = chunkKey(cx, cz);
    if (!base.has(key)) {
      // generate() may throw; caller (recenter) handles rollback.
      base.set(key, generate(cx, cz, seed));
      bumpRevision(key);
      composed.delete(key);
    }
  };

  const notify = () => {
    for (const l of listeners) l();
  };

  const recenter = (cx: number, cz: number): boolean => {
    if (disposed) return false;
    if (center && center[0] === cx && center[1] === cz) return false;

    // Transactional prepare: build the new retained set and generate any
    // missing base chunks into a scratch map first. If generation throws, we
    // discard the scratch and leave prior membership untouched.
    const newActive = new Set<string>();
    const newRetained = new Set<string>();
    for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
      for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++) {
        newActive.add(chunkKey(cx + dx, cz + dz));
      }
    }
    for (let dx = -SEAM_RADIUS; dx <= SEAM_RADIUS; dx++) {
      for (let dz = -SEAM_RADIUS; dz <= SEAM_RADIUS; dz++) {
        newRetained.add(chunkKey(cx + dx, cz + dz));
      }
    }

    const scratch = new Map<string, Map<string, BlockType>>();
    for (const key of newRetained) {
      if (!base.has(key)) {
        const [bx, bz] = key.split(',').map(Number);
        scratch.set(key, generate(bx, bz, seed)); // may throw -> propagates, no mutation yet
      }
    }

    // Commit: fold scratch into base, evict everything outside retained.
    for (const [key, chunk] of scratch) {
      base.set(key, chunk);
      bumpRevision(key);
      composed.delete(key);
    }
    for (const key of base.keys()) {
      if (!newRetained.has(key)) {
        base.delete(key);
        composed.delete(key);
        // overlays are session-owned: NOT deleted here.
      }
    }
    for (const key of composed.keys()) {
      if (!newRetained.has(key)) composed.delete(key);
    }

    active = newActive;
    retained = newRetained;
    center = [cx, cz];
    notify();
    return true;
  };

  const recenterWorld = (wx: number, wz: number): boolean => {
    const [cx, cz] = worldToChunk(Math.floor(wx), Math.floor(wz));
    return recenter(cx, cz);
  };

  const getChunk = (cx: number, cz: number): Map<string, BlockType> | undefined => {
    const key = chunkKey(cx, cz);
    if (!retained.has(key)) return undefined;
    ensureBase(cx, cz);
    return composed.get(key) ?? compose(cx, cz);
  };

  const getBlock = (wx: number, wy: number, wz: number): BlockType | undefined => {
    const [cx, cz, lx, ly, lz] = worldToLocal(wx, wy, wz);
    const chunk = getChunk(cx, cz);
    if (!chunk) return undefined;
    return chunk.get(`${lx},${ly},${lz}`);
  };

  // Which neighbor chunk keys can observe an edit at local (lx,ly,lz) for
  // face-culling / AO purposes: self plus any chunk whose edge/corner touches
  // the edited voxel (AO samples diagonal neighbors, so corners cross two).
  const affectedNeighbors = (cx: number, cz: number, lx: number, lz: number): string[] => {
    const xs = lx === 0 ? [-1, 0] : lx === CHUNK_SIZE - 1 ? [0, 1] : [0];
    const zs = lz === 0 ? [-1, 0] : lz === CHUNK_SIZE - 1 ? [0, 1] : [0];
    const keys: string[] = [];
    for (const ddx of xs) {
      for (const ddz of zs) {
        keys.push(chunkKey(cx + ddx, cz + ddz));
      }
    }
    return keys;
  };

  const applyEdit = (
    layer: Map<string, Overlay>,
    wx: number,
    wy: number,
    wz: number,
    type: BlockType,
  ): string[] => {
    const [cx, cz, lx, ly, lz] = worldToLocal(wx, wy, wz);
    const key = chunkKey(cx, cz);
    const localKey = `${lx},${ly},${lz}`;

    let overlay = layer.get(key);
    if (!overlay) {
      overlay = new Map();
      layer.set(key, overlay);
    }

    // Redundant-edit removal for the PLAYER layer: if the edit restores the
    // value already produced by base+authored, drop the overlay entry so it
    // does not accumulate. Explicit air is only redundant when the composed
    // base is already air/absent.
    if (layer === player) {
      const b = base.get(key);
      const a = authored.get(key);
      const beneath = a?.get(localKey) ?? b?.get(localKey);
      const beneathVal = beneath ?? 'air';
      if (type === beneathVal) {
        if (overlay.has(localKey)) overlay.delete(localKey);
        if (overlay.size === 0) player.delete(key);
        composed.delete(key);
        const affected = affectedNeighbors(cx, cz, lx, lz);
        for (const k of affected) bumpRevision(k);
        return affected;
      }
    }

    overlay.set(localKey, type);
    composed.delete(key);
    const affected = affectedNeighbors(cx, cz, lx, lz);
    for (const k of affected) bumpRevision(k);
    return affected;
  };

  const setBlock = (wx: number, wy: number, wz: number, type: BlockType): string[] => {
    if (disposed) return [];
    const affected = applyEdit(player, wx, wy, wz, type);
    notify();
    return affected;
  };

  const setBlocks = (
    updates: Array<{ wx: number; wy: number; wz: number; type: BlockType }>,
  ): string[] => {
    if (disposed || updates.length === 0) return [];
    const affected = new Set<string>();
    for (const u of updates) {
      for (const k of applyEdit(player, u.wx, u.wy, u.wz, u.type)) affected.add(k);
    }
    notify();
    return [...affected];
  };

  const authorBlocks = (
    updates: Array<{ wx: number; wy: number; wz: number; type: BlockType }>,
  ): string[] => {
    if (disposed || updates.length === 0) return [];
    const affected = new Set<string>();
    for (const u of updates) {
      for (const k of applyEdit(authored, u.wx, u.wy, u.wz, u.type)) affected.add(k);
    }
    notify();
    return [...affected];
  };

  const getRevision = (cx: number, cz: number): number => revision.get(chunkKey(cx, cz)) ?? 0;

  const subscribe = (listener: MembershipListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const dispose = () => {
    disposed = true;
    listeners.clear();
    base.clear();
    authored.clear();
    player.clear();
    composed.clear();
    revision.clear();
    active = new Set();
    retained = new Set();
    center = null;
  };

  return {
    recenter,
    recenterWorld,
    getActiveKeys: () => new Set(active),
    getRetainedKeys: () => new Set(retained),
    getChunk,
    getBlock,
    setBlock,
    setBlocks,
    authorBlocks,
    getRevision,
    subscribe,
    dispose,
  };
}

import { useState, useCallback, useRef, useEffect } from 'react';
import { BlockType, generateChunk } from './terrain';
import {
  createWorldChunkManager,
  WorldChunkManager,
  ACTIVE_RADIUS,
} from './worldChunkManager';

const CHUNK_SIZE = 16;
const SEED = Math.floor(Math.random() * 10000);

export interface BlockUpdate {
  wx: number;
  wy: number;
  wz: number;
  type: BlockType;
}

export interface WorldState {
  /** Only the active (7x7) window — the set World.tsx renders. */
  chunks: Map<string, Map<string, BlockType>>;
  getBlock: (wx: number, wy: number, wz: number) => BlockType | undefined;
  setBlock: (wx: number, wy: number, wz: number, type: BlockType) => void;
  setBlocks: (updates: BlockUpdate[]) => void;
  loadChunksAround: (wx: number, wz: number) => void;
  /** Underlying bounded store (mesh revisions, disposal, active/retained). */
  manager: WorldChunkManager;
  /** Per-chunk mesh revision, for keyed geometry invalidation. */
  getRevision: (cx: number, cz: number) => number;
}

/** Build the active-window chunk map (only what World renders). */
function activeChunkMap(manager: WorldChunkManager): Map<string, Map<string, BlockType>> {
  const out = new Map<string, Map<string, BlockType>>();
  for (const key of manager.getActiveKeys()) {
    const [cx, cz] = key.split(',').map(Number);
    const chunk = manager.getChunk(cx, cz);
    if (chunk) out.set(key, chunk);
  }
  return out;
}

export function useWorld(): WorldState {
  const managerRef = useRef<WorldChunkManager | null>(null);
  if (!managerRef.current) {
    const m = createWorldChunkManager({ seed: SEED, generate: generateChunk });
    // Spawn window centered on origin, matching the previous initial 7x7 load.
    m.recenter(0, 0);
    managerRef.current = m;
  }
  const manager = managerRef.current;

  const [, forceUpdate] = useState(0);
  const rerender = useCallback(() => forceUpdate(n => n + 1), []);

  // React re-renders only when membership actually changes (frame-level
  // same-chunk movement publishes nothing, so it never reaches React).
  useEffect(() => {
    const unsub = manager.subscribe(rerender);
    return () => {
      unsub();
      manager.dispose();
    };
  }, [manager, rerender]);

  const getBlock = useCallback(
    (wx: number, wy: number, wz: number) => manager.getBlock(wx, wy, wz),
    [manager],
  );

  const setBlock = useCallback(
    (wx: number, wy: number, wz: number, type: BlockType) => {
      manager.setBlock(wx, wy, wz, type);
    },
    [manager],
  );

  const setBlocks = useCallback(
    (updates: BlockUpdate[]) => {
      manager.setBlocks(updates);
    },
    [manager],
  );

  const loadChunksAround = useCallback(
    (wx: number, wz: number) => {
      manager.recenterWorld(wx, wz);
    },
    [manager],
  );

  const getRevision = useCallback(
    (cx: number, cz: number) => manager.getRevision(cx, cz),
    [manager],
  );

  return {
    chunks: activeChunkMap(manager),
    getBlock,
    setBlock,
    setBlocks,
    loadChunksAround,
    manager,
    getRevision,
  };
}

export { CHUNK_SIZE, ACTIVE_RADIUS };

import { useState, useCallback, useRef } from 'react';
import { BlockType, generateChunk } from './terrain';

const CHUNK_SIZE = 16;
const RENDER_DISTANCE = 3;
const SEED = Math.floor(Math.random() * 10000);

export interface BlockUpdate {
  wx: number;
  wy: number;
  wz: number;
  type: BlockType;
}

export interface WorldState {
  chunks: Map<string, Map<string, BlockType>>;
  getBlock: (wx: number, wy: number, wz: number) => BlockType | undefined;
  setBlock: (wx: number, wy: number, wz: number, type: BlockType) => void;
  setBlocks: (updates: BlockUpdate[]) => void;
  loadChunksAround: (wx: number, wz: number) => void;
}

function worldToChunk(wx: number, wz: number): [number, number] {
  return [Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE)];
}

function worldToLocal(wx: number, wy: number, wz: number): [number, number, number, number, number] {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  let lx = wx - cx * CHUNK_SIZE;
  let lz = wz - cz * CHUNK_SIZE;
  if (lx < 0) lx += CHUNK_SIZE;
  if (lz < 0) lz += CHUNK_SIZE;
  return [cx, cz, lx, wy, lz];
}

function createInitialChunks(): Map<string, Map<string, BlockType>> {
  const map = new Map<string, Map<string, BlockType>>();
  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      map.set(`${dx},${dz}`, generateChunk(dx, dz, SEED));
    }
  }
  return map;
}

export function useWorld(): WorldState {
  const chunksRef = useRef<Map<string, Map<string, BlockType>>>(createInitialChunks());
  const [, forceUpdate] = useState(0);

  const ensureChunk = useCallback((cx: number, cz: number) => {
    const key = `${cx},${cz}`;
    if (!chunksRef.current.has(key)) {
      const chunk = generateChunk(cx, cz, SEED);
      chunksRef.current.set(key, chunk);
    }
  }, []);

  const getBlock = useCallback((wx: number, wy: number, wz: number): BlockType | undefined => {
    const [cx, cz, lx, ly, lz] = worldToLocal(wx, wy, wz);
    const chunkKey = `${cx},${cz}`;
    const chunk = chunksRef.current.get(chunkKey);
    if (!chunk) return undefined;
    return chunk.get(`${lx},${ly},${lz}`);
  }, []);

  const setBlock = useCallback((wx: number, wy: number, wz: number, type: BlockType) => {
    const [cx, cz, lx, ly, lz] = worldToLocal(wx, wy, wz);
    const chunkKey = `${cx},${cz}`;
    const existing = chunksRef.current.get(chunkKey) ?? generateChunk(cx, cz, SEED);
    const nextChunk = new Map(existing);
    nextChunk.set(`${lx},${ly},${lz}`, type);
    chunksRef.current.set(chunkKey, nextChunk);
    forceUpdate(n => n + 1);
  }, []);

  const setBlocks = useCallback((updates: BlockUpdate[]) => {
    if (updates.length === 0) return;
    const cloned = new Map<string, Map<string, BlockType>>();
    for (const u of updates) {
      const [cx, cz, lx, ly, lz] = worldToLocal(u.wx, u.wy, u.wz);
      const chunkKey = `${cx},${cz}`;
      let nc = cloned.get(chunkKey);
      if (!nc) {
        const existing = chunksRef.current.get(chunkKey) ?? generateChunk(cx, cz, SEED);
        nc = new Map(existing);
        cloned.set(chunkKey, nc);
      }
      nc.set(`${lx},${ly},${lz}`, u.type);
    }
    for (const [ck, nc] of cloned) {
      chunksRef.current.set(ck, nc);
    }
    forceUpdate(n => n + 1);
  }, []);

  const loadChunksAround = useCallback((wx: number, wz: number) => {
    const [pcx, pcz] = worldToChunk(Math.floor(wx), Math.floor(wz));
    let loaded = false;
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = `${cx},${cz}`;
        if (!chunksRef.current.has(key)) {
          ensureChunk(cx, cz);
          loaded = true;
        }
      }
    }
    if (loaded) {
      forceUpdate(n => n + 1);
    }
  }, [ensureChunk]);

  return {
    chunks: chunksRef.current,
    getBlock,
    setBlock,
    setBlocks,
    loadChunksAround,
  };
}

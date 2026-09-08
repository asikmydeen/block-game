export type BlockType = 'air' | 'grass' | 'dirt' | 'stone' | 'sand' | 'wood' | 'leaves' | 'water' | 'snow' | 'coal' | 'iron' | 'bedrock' | 'glass' | 'metal' | 'concrete' | 'neon' | 'chest' | 'door' | 'bed' | 'road';

export interface Block {
  type: BlockType;
}

const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 32;

function noise(x: number, z: number, seed: number): number {
  let n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.3) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = noise(ix, iz, seed);
  const b = noise(ix + 1, iz, seed);
  const c = noise(ix, iz + 1, seed);
  const d = noise(ix + 1, iz + 1, seed);

  return a + (b - a) * ux + (c - a) * uz + (d - a + a - b - c + b + c - d) * ux * uz;
}

function fbm(x: number, z: number, seed: number, octaves: number = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let max = 0;

  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, z * frequency, seed + i * 100) * amplitude;
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / max;
}

const FLOOR_SURFACE_Y = 12;

export function getTerrainHeight(_worldX: number, _worldZ: number, _seed: number = 42): number {
  return FLOOR_SURFACE_Y;
}

export function generateChunk(chunkX: number, chunkZ: number, seed: number = 42): Map<string, BlockType> {
  const blocks = new Map<string, BlockType>();

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = chunkX * CHUNK_SIZE + lx;
      const worldZ = chunkZ * CHUNK_SIZE + lz;
      const surfaceY = FLOOR_SURFACE_Y;

      for (let y = 0; y <= surfaceY; y++) {
        const key = `${lx},${y},${lz}`;
        if (y === 0) {
          blocks.set(key, 'bedrock');
        } else if (y === surfaceY) {
          blocks.set(key, 'grass');
        } else if (y >= surfaceY - 3) {
          blocks.set(key, 'dirt');
        } else {
          const oreNoise = noise(worldX * 0.7 + 17.1, y * 0.9, seed + worldZ * 0.7 + 999);
          if (oreNoise > 0.93) {
            blocks.set(key, 'iron');
          } else if (oreNoise > 0.85) {
            blocks.set(key, 'coal');
          } else {
            blocks.set(key, 'stone');
          }
        }
      }
    }
  }

  return blocks;
}

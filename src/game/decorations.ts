import { BlockUpdate } from './useWorld';
import { BlockType } from './terrain';

// Forest ring around the city outskirts plus small town details (park).
// Deterministic (fixed seed) so the layout is stable across sessions and
// identical for everyone in multiplayer.

const GROUND_Y = 13; // first free block above the superflat surface (y=12)

// Forest band just outside the roads/houses (roads reach ±70).
export const FOREST_INNER_R = 74;
export const FOREST_OUTER_R = 102;

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function set(updates: BlockUpdate[], wx: number, wy: number, wz: number, type: BlockType) {
  updates.push({ wx, wy, wz, type });
}

function buildOak(updates: BlockUpdate[], x: number, z: number, rand: () => number) {
  const trunkH = 4 + Math.floor(rand() * 2);
  for (let y = 0; y < trunkH; y++) set(updates, x, GROUND_Y + y, z, 'wood');
  const canopyBase = GROUND_Y + trunkH - 1;
  // 3x3 canopy, two layers
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0 && dy === 0) continue; // trunk top occupies center
        set(updates, x + dx, canopyBase + dy, z + dz, 'leaves');
      }
    }
  }
  // Top cross
  set(updates, x, canopyBase + 2, z, 'leaves');
  set(updates, x + 1, canopyBase + 2, z, 'leaves');
  set(updates, x - 1, canopyBase + 2, z, 'leaves');
  set(updates, x, canopyBase + 2, z + 1, 'leaves');
  set(updates, x, canopyBase + 2, z - 1, 'leaves');
}

function buildPine(updates: BlockUpdate[], x: number, z: number, rand: () => number) {
  const trunkH = 5 + Math.floor(rand() * 3);
  for (let y = 0; y < trunkH; y++) set(updates, x, GROUND_Y + y, z, 'wood');
  // Pyramid canopy
  for (let layer = 0; layer < 3; layer++) {
    const r = 2 - layer;
    const y = GROUND_Y + trunkH - 2 + layer;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
        if (dx === 0 && dz === 0 && layer < 2) continue;
        set(updates, x + dx, y, z + dz, 'leaves');
      }
    }
  }
  set(updates, x, GROUND_Y + trunkH + 1, z, 'leaves');
}

function buildBush(updates: BlockUpdate[], x: number, z: number) {
  set(updates, x, GROUND_Y, z, 'leaves');
  set(updates, x + 1, GROUND_Y, z, 'leaves');
  set(updates, x, GROUND_Y, z + 1, 'leaves');
  set(updates, x, GROUND_Y + 1, z, 'leaves');
}

// Ring of trees encircling the city. Corridors are kept clear where the two
// roads point so the world stays traversable by car.
export function generateForestUpdates(): BlockUpdate[] {
  const updates: BlockUpdate[] = [];
  const rand = mulberry32(1337);

  const TREES = 240;
  for (let i = 0; i < TREES; i++) {
    const angle = rand() * Math.PI * 2;
    const r = FOREST_INNER_R + rand() * (FOREST_OUTER_R - FOREST_INNER_R);
    const x = Math.round(Math.cos(angle) * r);
    const z = Math.round(Math.sin(angle) * r);
    // Keep the road corridors open (roads run at x≈-2 and z≈-2)
    if (Math.abs(z + 2) < 5 || Math.abs(x + 2) < 5) continue;
    const kind = rand();
    if (kind < 0.45) buildOak(updates, x, z, rand);
    else if (kind < 0.85) buildPine(updates, x, z, rand);
    else buildBush(updates, x, z);
  }
  return updates;
}

// A small park near spawn: a couple of trees, a pond and log benches.
export function generateParkUpdates(): BlockUpdate[] {
  const updates: BlockUpdate[] = [];
  const rand = mulberry32(4242);
  const cx = 14;
  const cz = 14;

  buildOak(updates, cx - 3, cz - 2, rand);
  buildOak(updates, cx + 4, cz + 3, rand);
  buildBush(updates, cx + 3, cz - 4);
  buildBush(updates, cx - 5, cz + 3);

  // Pond (water sunk into the surface)
  for (let dx = 0; dx <= 2; dx++) {
    for (let dz = 0; dz <= 1; dz++) {
      set(updates, cx + dx - 1, GROUND_Y - 1, cz + dz, 'water');
    }
  }

  // Log benches
  set(updates, cx - 2, GROUND_Y, cz + 4, 'wood');
  set(updates, cx - 1, GROUND_Y, cz + 4, 'wood');
  set(updates, cx + 1, GROUND_Y, cz - 5, 'wood');
  set(updates, cx + 2, GROUND_Y, cz - 5, 'wood');

  return updates;
}

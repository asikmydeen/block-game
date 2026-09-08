import { BlockUpdate } from './useWorld';
import { BlockType } from './terrain';

const ROAD_Y = 12;
const ROAD_EXTENT = 70;

function set(updates: BlockUpdate[], wx: number, wy: number, wz: number, type: BlockType) {
  updates.push({ wx, wy, wz, type });
}

// Two crossing roads: one along X at z = -3..-1, one along Z at x = -3..-1.
// Chosen to avoid all building footprints.
export function generateRoadUpdates(): BlockUpdate[] {
  const updates: BlockUpdate[] = [];

  for (let x = -ROAD_EXTENT; x <= ROAD_EXTENT; x++) {
    for (let z = -3; z <= -1; z++) {
      const isDash = z === -2 && ((x % 4) + 4) % 4 < 2;
      set(updates, x, ROAD_Y, z, isDash ? 'snow' : 'road');
      for (let y = ROAD_Y + 1; y <= ROAD_Y + 4; y++) {
        set(updates, x, y, z, 'air');
      }
    }
  }

  for (let z = -ROAD_EXTENT; z <= ROAD_EXTENT; z++) {
    for (let x = -3; x <= -1; x++) {
      const isDash = x === -2 && ((z % 4) + 4) % 4 < 2;
      // Don't re-carve the intersection dash pattern
      const inIntersection = z >= -3 && z <= -1;
      set(updates, x, ROAD_Y, z, inIntersection ? 'road' : isDash ? 'snow' : 'road');
      for (let y = ROAD_Y + 1; y <= ROAD_Y + 4; y++) {
        set(updates, x, y, z, 'air');
      }
    }
  }

  return updates;
}

import { WorldState } from './useWorld';

export const FLOOR_TOP_Y = 12;
const WORLD_CEILING = 30;

/**
 * Height an entity should stand at, searching DOWNWARD from just above its
 * current position.
 *
 * Scanning from the world ceiling instead (the old behaviour) returns the
 * highest solid block in the column, so anything walking under a tree snapped
 * up onto the leaf canopy and dropped back a moment later — entities appeared
 * to blink in and out as they wandered the forest. Starting the search at the
 * entity's own feet keeps it on the surface it is actually standing on, while
 * still allowing it to step up onto low blocks.
 */
export function groundYUnder(
  world: WorldState,
  x: number,
  z: number,
  currentY: number
): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  // +1 so a solid block level with the feet still counts as a step up.
  const start = Math.min(WORLD_CEILING, Math.floor(currentY) + 1);
  for (let y = start; y >= 0; y--) {
    const b = world.getBlock(ix, y, iz);
    if (b && b !== 'air' && b !== 'water') return y + 1;
  }
  // Unloaded chunk or empty column: fall back to the superflat surface so
  // entities never sink through an ungenerated world.
  return FLOOR_TOP_Y + 1;
}

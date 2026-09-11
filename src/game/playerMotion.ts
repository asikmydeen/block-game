// Task 10.4 support — pure player-motion collision step.
//
// The per-axis block collision resolution used by Player.tsx, factored into a
// pure function that takes ONLY simulation inputs (position, velocity, dt, and
// a block sampler). It takes NO visual/render profile, which is what makes the
// simulation provably invariant to mobile-vs-desktop quality settings.
//
// Behaviour mirrors Player.tsx exactly: X then Z then Y axis order, the same
// four-corner block probes per horizontal axis, ground snap on downward
// contact, ceiling stop on upward contact, and the y < -10 respawn to (8,18,8).

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;

export type BlockSampler = (x: number, y: number, z: number) => string | undefined;

export interface MotionInput {
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  dt: number;
  getBlock: BlockSampler;
}

export interface MotionResult {
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  grounded: boolean;
}

function solid(b: string | undefined): boolean {
  return !!b && b !== 'air' && b !== 'water';
}

/**
 * Advance the player one simulation step, resolving axis-aligned block
 * collisions. Pure: same inputs always yield the same result, and no rendering
 * state influences it.
 */
export function stepPlayerMotion(input: MotionInput): MotionResult {
  const { getBlock, dt } = input;
  const start = { ...input.pos };
  const vel = { ...input.vel };
  const pos = { ...input.pos };
  let grounded = false;

  // X axis
  pos.x += vel.x * dt;
  const bx =
    getBlock(Math.floor(pos.x - PLAYER_RADIUS), Math.floor(pos.y), Math.floor(pos.z)) ||
    getBlock(Math.floor(pos.x + PLAYER_RADIUS), Math.floor(pos.y), Math.floor(pos.z)) ||
    getBlock(Math.floor(pos.x - PLAYER_RADIUS), Math.floor(pos.y + 1), Math.floor(pos.z)) ||
    getBlock(Math.floor(pos.x + PLAYER_RADIUS), Math.floor(pos.y + 1), Math.floor(pos.z));
  if (solid(bx)) {
    pos.x = start.x;
    vel.x = 0;
  }

  // Z axis
  pos.z += vel.z * dt;
  const bz =
    getBlock(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z - PLAYER_RADIUS)) ||
    getBlock(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z + PLAYER_RADIUS)) ||
    getBlock(Math.floor(pos.x), Math.floor(pos.y + 1), Math.floor(pos.z - PLAYER_RADIUS)) ||
    getBlock(Math.floor(pos.x), Math.floor(pos.y + 1), Math.floor(pos.z + PLAYER_RADIUS));
  if (solid(bz)) {
    pos.z = start.z;
    vel.z = 0;
  }

  // Y axis
  pos.y += vel.y * dt;
  const feetY = Math.floor(pos.y - 0.05);
  const headY = Math.floor(pos.y + PLAYER_HEIGHT);
  const groundBlock = getBlock(Math.floor(pos.x), feetY, Math.floor(pos.z));
  if (solid(groundBlock) && vel.y <= 0) {
    pos.y = feetY + 1;
    vel.y = 0;
    grounded = true;
  }

  const ceilBlock = getBlock(Math.floor(pos.x), headY, Math.floor(pos.z));
  if (solid(ceilBlock) && vel.y > 0) {
    vel.y = 0;
  }

  if (pos.y < -10) {
    pos.x = 8;
    pos.y = 18;
    pos.z = 8;
    vel.x = 0;
    vel.y = 0;
    vel.z = 0;
  }

  return { pos, vel, grounded };
}

import { BlockType } from './terrain';
import { BlockUpdate } from './useWorld';

const FLOOR_TOP_Y = 12;

export type HouseStyle = 'cottage' | 'cabin' | 'modern' | 'futuristic' | 'tower' | 'skyscraper' | 'apartment';

export interface HouseSpec {
  cx: number;
  cz: number;
  style: HouseStyle;
}

export const HOUSES: HouseSpec[] = [
  { cx: 22, cz: 6, style: 'cottage' },
  { cx: -12, cz: 18, style: 'cabin' },
  { cx: 8, cz: -18, style: 'modern' },
  { cx: -22, cz: -10, style: 'futuristic' },
  { cx: 28, cz: -22, style: 'tower' },
  { cx: -28, cz: 22, style: 'cottage' },
  { cx: 55, cz: 10, style: 'skyscraper' },
  { cx: -55, cz: -10, style: 'skyscraper' },
  { cx: 40, cz: -40, style: 'apartment' },
  { cx: -40, cz: 40, style: 'apartment' },
];

export function generateHouseUpdates(): BlockUpdate[] {
  const updates: BlockUpdate[] = [];
  for (const h of HOUSES) {
    buildHouse(updates, h);
  }
  return updates;
}

function set(updates: BlockUpdate[], wx: number, wy: number, wz: number, type: BlockType) {
  updates.push({ wx, wy, wz, type });
}

function buildHouse(updates: BlockUpdate[], h: HouseSpec) {
  switch (h.style) {
    case 'cottage':
      buildCottage(updates, h.cx, h.cz);
      break;
    case 'cabin':
      buildCabin(updates, h.cx, h.cz);
      break;
    case 'modern':
      buildModern(updates, h.cx, h.cz);
      break;
    case 'futuristic':
      buildFuturistic(updates, h.cx, h.cz);
      break;
    case 'tower':
      buildTower(updates, h.cx, h.cz);
      break;
    case 'skyscraper':
      buildSkyscraper(updates, h.cx, h.cz);
      break;
    case 'apartment':
      buildApartment(updates, h.cx, h.cz);
      break;
  }
}

// ── Interior furniture helpers ─────────────────────────────────────────────

function addKitchen(updates: BlockUpdate[], cx: number, cz: number, baseY: number) {
  // L-shaped counter along back-left corner
  set(updates, cx, baseY, cz, 'wood');
  set(updates, cx - 1, baseY, cz, 'wood');
  set(updates, cx, baseY, cz - 1, 'wood');
  // Stove on counter (metal block one above the counter row)
  set(updates, cx - 1, baseY + 1, cz, 'metal');
  // Sink (glass pane look: glass block on counter)
  set(updates, cx, baseY + 1, cz - 1, 'glass');
}

function addBathroom(updates: BlockUpdate[], cx: number, cz: number, baseY: number) {
  // Toilet: stone block in corner
  set(updates, cx, baseY, cz, 'stone');
  // Sink: glass block beside it
  set(updates, cx - 1, baseY, cz, 'glass');
  // Bathtub suggestion: row of stone blocks
  set(updates, cx, baseY, cz - 1, 'stone');
  set(updates, cx, baseY, cz - 2, 'stone');
}

// Ascending staircase: places blocks at rising Y so player can walk up
function addStairs(
  updates: BlockUpdate[],
  startX: number,
  startY: number,
  startZ: number,
  dirX: number,
  dirZ: number,
  steps: number
) {
  for (let i = 0; i < steps; i++) {
    set(updates, startX + dirX * i, startY + i, startZ + dirZ * i, 'wood');
  }
}

// ── Exterior detail helpers ────────────────────────────────────────────────

// Full tree: 4-block wood trunk + layered leaf canopy
function addTree(updates: BlockUpdate[], cx: number, cz: number) {
  const base = FLOOR_TOP_Y + 1;
  for (let dy = 0; dy < 4; dy++) set(updates, cx, base + dy, cz, 'wood');
  // Lower canopy (5x5 minus far corners)
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      set(updates, cx + dx, base + 4, cz + dz, 'leaves');
    }
  }
  // Mid canopy (3x3)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      set(updates, cx + dx, base + 5, cz + dz, 'leaves');
    }
  }
  set(updates, cx, base + 6, cz, 'leaves');
}

// Lamp post: metal pole with arm + neon light
function addLampPost(updates: BlockUpdate[], cx: number, cz: number, armDx: number = 0) {
  const base = FLOOR_TOP_Y + 1;
  for (let dy = 0; dy < 4; dy++) set(updates, cx, base + dy, cz, 'metal');
  // Arm extending sideways
  if (armDx !== 0) {
    set(updates, cx + armDx, base + 3, cz, 'metal');
    set(updates, cx + armDx, base + 4, cz, 'neon');
  } else {
    set(updates, cx, base + 4, cz, 'neon');
  }
}

// Stone path from a doorstep outward in the -z direction
// Placed at FLOOR_TOP_Y (terrain surface) so the player walks ON it, not into it
function addPath(updates: BlockUpdate[], cx: number, cz: number, length: number, width: number = 1) {
  const base = FLOOR_TOP_Y; // terrain surface level — walkable
  const half = Math.floor(width / 2);
  for (let i = 0; i < length; i++) {
    for (let dx = -half; dx <= half; dx++) {
      set(updates, cx + dx, base, cz - i, 'stone');
    }
  }
}

// Fireplace: stone surround + iron embers (iron is a warm orange hue)
function addFireplace(updates: BlockUpdate[], cx: number, cz: number, baseY: number) {
  // Embers
  set(updates, cx, baseY, cz, 'iron');
  set(updates, cx, baseY + 1, cz, 'iron');
  // Stone sides
  set(updates, cx - 1, baseY, cz, 'stone');
  set(updates, cx + 1, baseY, cz, 'stone');
  set(updates, cx - 1, baseY + 1, cz, 'stone');
  set(updates, cx + 1, baseY + 1, cz, 'stone');
  // Mantle beam
  set(updates, cx - 1, baseY + 2, cz, 'stone');
  set(updates, cx,     baseY + 2, cz, 'stone');
  set(updates, cx + 1, baseY + 2, cz, 'stone');
}

// Chimney: stone column that overrides roof blocks
function addChimney(updates: BlockUpdate[], cx: number, cz: number, fromY: number, height: number = 4) {
  for (let dy = 0; dy < height; dy++) set(updates, cx, fromY + dy, cz, 'stone');
  set(updates, cx, fromY + height, cz, 'iron'); // glowing "smoke" top
}

// Bookshelf: 2-wide, 2-tall wood slab
function addBookshelf(updates: BlockUpdate[], cx: number, cz: number, baseY: number) {
  set(updates, cx,     baseY,     cz, 'wood');
  set(updates, cx,     baseY + 1, cz, 'wood');
  set(updates, cx - 1, baseY,     cz, 'wood');
  set(updates, cx - 1, baseY + 1, cz, 'wood');
}

// Dining table + two chairs: wood block table, stone chairs
function addDiningTable(updates: BlockUpdate[], cx: number, cz: number, baseY: number) {
  set(updates, cx, baseY, cz, 'wood');        // table
  set(updates, cx - 1, baseY - 1, cz, 'stone'); // chair left (slightly lower)
  set(updates, cx + 1, baseY - 1, cz, 'stone'); // chair right
}

// Garden fence: spaced stone posts around perimeter.
// Front side leaves a gap (frontGap blocks on each side of centre) for the door.
function addFence(
  updates: BlockUpdate[],
  cx: number, cz: number,
  w: number, d: number,
  spacing: number = 2,
  frontGap: number = 3
) {
  const base = FLOOR_TOP_Y + 1; // fence posts rise up from ground — solid obstacles to walk around
  // Front fence: skip posts within frontGap of the door
  for (let dx = -w; dx <= w; dx += spacing) {
    if (Math.abs(dx) <= frontGap) continue;
    set(updates, cx + dx, base, cz - d - 1, 'stone');
  }
  // Back fence
  for (let dx = -w; dx <= w; dx += spacing) {
    set(updates, cx + dx, base, cz + d + 1, 'stone');
  }
  // Side fences
  for (let dz = -d; dz <= d; dz += spacing) {
    set(updates, cx - w - 1, base, cz + dz, 'stone');
    set(updates, cx + w + 1, base, cz + dz, 'stone');
  }
}

// Flower bed: leaves at terrain surface so the player walks over them, not into them
function addFlowerBox(updates: BlockUpdate[], cx: number, cz: number) {
  const base = FLOOR_TOP_Y; // terrain surface level
  set(updates, cx - 1, base, cz, 'leaves');
  set(updates, cx,     base, cz, 'leaves');
  set(updates, cx + 1, base, cz, 'leaves');
}

// Stone bench: placed at terrain surface so the player walks over, not into
function addBench(updates: BlockUpdate[], cx: number, cz: number) {
  const base = FLOOR_TOP_Y; // terrain surface level
  set(updates, cx,     base, cz, 'stone');
  set(updates, cx + 1, base, cz, 'stone');
}

// ── Cottage ────────────────────────────────────────────────────────────────
// Single-storey wood cottage with pitched roof.
// Interior: kitchen (back-left) + bathroom (back-right).

function buildCottage(updates: BlockUpdate[], cx: number, cz: number) {
  const baseY = FLOOR_TOP_Y + 1;
  const w = 4, d = 4, height = 3;

  // Walls
  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      for (let dy = 0; dy < height; dy++) {
        const onEdge = dx === -w || dx === w || dz === -d || dz === d;
        if (!onEdge) continue;
        const isDoor = dz === -d && dx === 0 && dy < 2;
        if (isDoor) continue;
        const isWindow = dy === 1 && (
          (dx === -w && dz === 0) ||
          (dx === w && dz === 0) ||
          (dz === d && (dx === -1 || dx === 1))
        );
        set(updates, cx + dx, baseY + dy, cz + dz, isWindow ? 'glass' : 'wood');
      }
    }
  }

  // Pitched roof
  for (let dx = -w - 1; dx <= w + 1; dx++) {
    for (let dz = -d - 1; dz <= d + 1; dz++) {
      const ridge = Math.max(0, Math.min(d, w) - Math.max(Math.abs(dx), Math.abs(dz)) + 1);
      const roofY = baseY + height + ridge;
      const edge = dx === -w - 1 || dx === w + 1 || dz === -d - 1 || dz === d + 1;
      set(updates, cx + dx, roofY, cz + dz, edge ? 'wood' : 'leaves');
    }
  }

  // Interior: kitchen at back-left, bathroom at back-right
  addKitchen(updates, cx - 2, cz + 2, baseY);
  addBathroom(updates, cx + 2, cz + 2, baseY);
  // Fireplace on back-center wall
  addFireplace(updates, cx, cz + 3, baseY);
  // Bookshelf against left wall
  addBookshelf(updates, cx - 2, cz, baseY);
  // Dining table in the middle
  addDiningTable(updates, cx + 1, cz, baseY);

  // Interactive: door in doorway, chest near left wall, bed in front-right area
  set(updates, cx, baseY, cz - d, 'door');
  set(updates, cx, baseY + 1, cz - d, 'door');
  set(updates, cx - 3, baseY, cz - 2, 'chest');
  set(updates, cx + 2, baseY, cz - 2, 'bed');

  // Chimney: rises from back-center wall through roof
  addChimney(updates, cx, cz + d, baseY + height, 5);

  // Garden fence around perimeter
  addFence(updates, cx, cz, w + 1, d + 1, 2);

  // Stone path from doorstep
  addPath(updates, cx, cz - d - 1, 5, 3);

  // Lamp posts flanking the path
  addLampPost(updates, cx - 3, cz - d - 3, 1);
  addLampPost(updates, cx + 3, cz - d - 3, -1);

  // Trees to the sides
  addTree(updates, cx - 7, cz);
  addTree(updates, cx + 7, cz);
  addTree(updates, cx - 5, cz + 6);

  // Window flower boxes on exterior
  addFlowerBox(updates, cx - w - 1, cz + 0);
  addFlowerBox(updates, cx + w + 1, cz + 0);
}

// ── Cabin ──────────────────────────────────────────────────────────────────
// Two-storey log cabin. Ground floor: living area + kitchen. Upper floor: bedroom.

function buildCabin(updates: BlockUpdate[], cx: number, cz: number) {
  const baseY = FLOOR_TOP_Y + 1;
  const w = 5, d = 6;
  const floor1H = 4;
  const floor2H = 3;

  // ── Ground floor walls ──
  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      for (let dy = 0; dy < floor1H; dy++) {
        const onEdge = dx === -w || dx === w || dz === -d || dz === d;
        if (!onEdge) continue;
        const isDoor = dz === -d && dx === 0 && dy < 2;
        if (isDoor) continue;
        const isWindow = (dy === 1 || dy === 2) && (
          ((dx === -w || dx === w) && (dz === -2 || dz === 0 || dz === 2)) ||
          (dz === d && (dx === -2 || dx === 0 || dx === 2))
        );
        set(updates, cx + dx, baseY + dy, cz + dz, isWindow ? 'glass' : 'wood');
      }
    }
  }

  // ── Inter-floor slab (ceiling of floor 1 / floor of floor 2) ──
  for (let dx = -w + 1; dx <= w - 1; dx++) {
    for (let dz = -d + 1; dz <= d - 1; dz++) {
      set(updates, cx + dx, baseY + floor1H, cz + dz, 'wood');
    }
  }
  // Outer ring of slab (on top of walls)
  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      const onEdge = dx === -w || dx === w || dz === -d || dz === d;
      if (onEdge) set(updates, cx + dx, baseY + floor1H, cz + dz, 'wood');
    }
  }

  // ── Staircase: corner of interior, ascending toward front ──
  // Starts at back-right interior corner, climbs 4 steps toward front
  addStairs(updates, cx + w - 1, baseY, cz + d - 1, 0, -1, floor1H);

  // ── Second floor walls ──
  const f2Base = baseY + floor1H;
  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      for (let dy = 1; dy <= floor2H; dy++) {
        const onEdge = dx === -w || dx === w || dz === -d || dz === d;
        if (!onEdge) continue;
        const isWindow2 = dy === 1 && (
          ((dx === -w || dx === w) && (dz === 0)) ||
          (dz === -d && (dx === -2 || dx === 2)) ||
          (dz === d && (dx === 0))
        );
        set(updates, cx + dx, f2Base + dy, cz + dz, isWindow2 ? 'glass' : 'wood');
      }
    }
  }

  // ── Second floor roof (flat layered) ──
  const roofBase = f2Base + floor2H + 1;
  for (let layer = 0; layer < 3; layer++) {
    const expand = 1 - layer;
    for (let dx = -w - expand; dx <= w + expand; dx++) {
      for (let dz = -d - expand; dz <= d + expand; dz++) {
        if (layer === 0) {
          set(updates, cx + dx, roofBase + layer, cz + dz, 'wood');
        } else {
          const distFromCenterX = Math.abs(dx);
          const distFromCenterZ = Math.abs(dz);
          if (distFromCenterX <= w - layer + 1 && distFromCenterZ <= d - layer + 1) {
            set(updates, cx + dx, roofBase + layer, cz + dz, 'wood');
          }
        }
      }
    }
  }

  // ── Ground floor interior: kitchen (back-left) ──
  addKitchen(updates, cx - 3, cz + 4, baseY);

  // ── Second floor interior: bathroom ──
  addBathroom(updates, cx + 3, cz + 4, f2Base + 1);

  // ── Ground floor interior extras ──
  addFireplace(updates, cx - 3, cz + 5, baseY);
  addBookshelf(updates, cx + 3, cz + 5, baseY);
  addDiningTable(updates, cx, cz + 2, baseY);

  // Interactive: front door, chest on ground floor, bed on second floor
  set(updates, cx, baseY, cz - d, 'door');
  set(updates, cx, baseY + 1, cz - d, 'door');
  set(updates, cx - 4, baseY, cz - 4, 'chest');
  set(updates, cx - 4, f2Base + 1, cz - 4, 'bed');
  set(updates, cx - 3, f2Base + 1, cz - 4, 'bed');

  // Chimney from side of cabin
  addChimney(updates, cx - w, cz + 3, baseY + floor1H, 8);

  // Stone path from front door outward
  addPath(updates, cx, cz - d - 1, 6, 3);

  // Lamp posts at entrance
  addLampPost(updates, cx - 4, cz - d - 3, 1);
  addLampPost(updates, cx + 4, cz - d - 3, -1);

  // Trees around the cabin
  addTree(updates, cx - 9, cz - 4);
  addTree(updates, cx + 9, cz + 4);
  addTree(updates, cx, cz + 10);

  // Flower boxes on side windows
  addFlowerBox(updates, cx - w - 1, cz - 2);
  addFlowerBox(updates, cx + w + 1, cz + 2);

  // Benches near entrance
  addBench(updates, cx - 6, cz - d - 1);
  addBench(updates, cx + 4, cz - d - 1);
}

// ── Modern ─────────────────────────────────────────────────────────────────
// Flat-roof concrete/glass house with second floor and interior rooms.

function buildModern(updates: BlockUpdate[], cx: number, cz: number) {
  const baseY = FLOOR_TOP_Y + 1;
  const w = 5, d = 4;
  const floor1H = 4;
  const floor2H = 3;

  // ── Ground floor walls ──
  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      for (let dy = 0; dy < floor1H; dy++) {
        const onEdge = dx === -w || dx === w || dz === -d || dz === d;
        if (!onEdge) continue;
        const isDoor = dz === -d && (dx === 0 || dx === 1) && dy < 2;
        if (isDoor) continue;
        const isFrontGlass = dz === -d && (dx === -2 || dx === -1) && (dy === 1 || dy === 2);
        const isSidePane = (dx === -w || dx === w) && (dy === 1 || dy === 2);
        const isBackPane = dz === d && (dy === 1 || dy === 2);
        const isGlass = isFrontGlass || isSidePane || isBackPane;
        let material: BlockType = 'concrete';
        if (dy === 0) material = 'stone';
        if (isGlass) material = 'glass';
        set(updates, cx + dx, baseY + dy, cz + dz, material);
      }
    }
  }

  // ── Floor slab between floors ──
  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      set(updates, cx + dx, baseY + floor1H, cz + dz, 'concrete');
    }
  }

  // ── Staircase (interior front-left corner) ──
  addStairs(updates, cx - w + 1, baseY, cz - d + 1, 0, 1, floor1H);

  // ── Second floor walls ──
  const f2Base = baseY + floor1H;
  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      for (let dy = 1; dy <= floor2H; dy++) {
        const onEdge = dx === -w || dx === w || dz === -d || dz === d;
        if (!onEdge) continue;
        const isSideGlass = (dx === -w || dx === w) && dy === 1;
        const isBackGlass = dz === d && dy === 1;
        const isGlass = isSideGlass || isBackGlass;
        set(updates, cx + dx, f2Base + dy, cz + dz, isGlass ? 'glass' : 'concrete');
      }
    }
  }

  // ── Flat roof over second floor ──
  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      set(updates, cx + dx, f2Base + floor2H + 1, cz + dz, 'concrete');
    }
  }

  // ── Rooftop railing ──
  const roofY = f2Base + floor2H + 1;
  for (let dx = -w; dx <= w; dx++) {
    set(updates, cx + dx, roofY + 1, cz - d, 'metal');
    set(updates, cx + dx, roofY + 1, cz + d, 'metal');
  }
  for (let dz = -d; dz <= d; dz++) {
    set(updates, cx - w, roofY + 1, cz + dz, 'metal');
    set(updates, cx + w, roofY + 1, cz + dz, 'metal');
  }

  // Decorative poles
  set(updates, cx - w - 1, baseY + floor1H, cz - d, 'metal');
  set(updates, cx + w + 1, baseY + floor1H, cz + d, 'metal');

  // ── Interior rooms ──
  addKitchen(updates, cx + 3, cz + 2, baseY);
  addBathroom(updates, cx + 3, cz - 2, baseY);
  addBathroom(updates, cx + 3, cz + 2, f2Base + 1);

  // Interactive: double front door, chest ground floor, bed second floor
  set(updates, cx, baseY, cz - d, 'door');
  set(updates, cx + 1, baseY, cz - d, 'door');
  set(updates, cx, baseY + 1, cz - d, 'door');
  set(updates, cx + 1, baseY + 1, cz - d, 'door');
  set(updates, cx - 4, baseY, cz + 2, 'chest');
  set(updates, cx - 4, f2Base + 1, cz + 2, 'bed');
  set(updates, cx - 3, f2Base + 1, cz + 2, 'bed');

  // Dining area on ground floor
  addDiningTable(updates, cx - 2, cz - 1, baseY);
  addBookshelf(updates, cx - 4, cz + 2, baseY);

  // Wide stone driveway / plaza in front
  addPath(updates, cx, cz - d - 1, 6, 5);

  // Lamp posts flanking driveway
  addLampPost(updates, cx - 5, cz - d - 4, 1);
  addLampPost(updates, cx + 5, cz - d - 4, -1);

  // Decorative hedge bushes at front corners
  addFlowerBox(updates, cx - w - 1, cz - d);
  addFlowerBox(updates, cx + w - 1, cz - d);

  // Trees to the rear
  addTree(updates, cx - 8, cz + 6);
  addTree(updates, cx + 8, cz + 6);

  // Benches near front path
  addBench(updates, cx - 7, cz - d - 2);
  addBench(updates, cx + 5, cz - d - 2);
}

// ── Futuristic ─────────────────────────────────────────────────────────────
// Cylindrical metal/glass pod with interior bathroom.

function buildFuturistic(updates: BlockUpdate[], cx: number, cz: number) {
  const baseY = FLOOR_TOP_Y + 1;
  const w = 4, d = 4, height = 5;

  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      const distSq = dx * dx + dz * dz;
      if (distSq > (w + 0.5) * (w + 0.5)) continue;
      for (let dy = 0; dy < height; dy++) {
        const isShellAtY =
          distSq > (w - 0.5) * (w - 0.5) ||
          (dy === 0) ||
          (dy === height - 1);
        if (!isShellAtY) continue;
        const isDoor = dz === -d && dx === 0 && dy < 2;
        if (isDoor) continue;
        let material: BlockType = 'metal';
        const isGlassBand = dy === 2 || dy === 3;
        if (isGlassBand && distSq > (w - 1) * (w - 1)) {
          material = 'glass';
        }
        if (dy === 0) material = 'metal';
        if (dy === height - 1) material = 'metal';
        set(updates, cx + dx, baseY + dy, cz + dz, material);
      }
    }
  }

  // Spire
  for (let r = 0; r < 3; r++) {
    for (let dx = -w + r; dx <= w - r; dx++) {
      for (let dz = -d + r; dz <= d - r; dz++) {
        const distSq = dx * dx + dz * dz;
        if (distSq > (w - r) * (w - r)) continue;
        if (distSq < (w - r - 1) * (w - r - 1)) continue;
        set(updates, cx + dx, baseY + height + r, cz + dz, 'metal');
      }
    }
  }
  set(updates, cx, baseY + height + 3, cz, 'neon');
  set(updates, cx + 2, baseY + height, cz - 2, 'neon');
  set(updates, cx - 2, baseY + height, cz + 2, 'neon');
  set(updates, cx - w - 1, baseY, cz, 'neon');
  set(updates, cx + w + 1, baseY, cz, 'neon');

  // Interior bathroom pod
  addBathroom(updates, cx + 2, cz + 2, baseY + 1);

  // Interactive: front door, chest inside
  set(updates, cx, baseY, cz - d, 'door');
  set(updates, cx, baseY + 1, cz - d, 'door');
  set(updates, cx - 2, baseY + 1, cz - 2, 'chest');
  set(updates, cx - 2, baseY + 1, cz + 0, 'bed');

  // Circular neon-lit plaza in front (at terrain surface — walkable)
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 0; dz++) {
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= 4) set(updates, cx + dx, FLOOR_TOP_Y, cz + dz, 'stone');
    }
  }

  // Neon lamp posts on plaza perimeter
  addLampPost(updates, cx - 5, cz - 1, 1);
  addLampPost(updates, cx + 5, cz - 1, -1);
  addLampPost(updates, cx, cz - 6, 0);

  // Trees behind the pod
  addTree(updates, cx - 7, cz + 5);
  addTree(updates, cx + 7, cz + 5);

  // Benches on the plaza
  addBench(updates, cx - 3, cz - 4);
  addBench(updates, cx + 2, cz - 4);
}

// ── Tower ──────────────────────────────────────────────────────────────────
// Narrow concrete/glass tower with antenna.

function buildTower(updates: BlockUpdate[], cx: number, cz: number) {
  const baseY = FLOOR_TOP_Y + 1;
  const w = 3, d = 3, height = 9;

  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      for (let dy = 0; dy < height; dy++) {
        const onEdge = dx === -w || dx === w || dz === -d || dz === d;
        if (!onEdge) continue;
        const isDoor = dz === -d && dx === 0 && dy < 2;
        if (isDoor) continue;
        const isFloor = dy % 3 === 0 && dy > 0;
        const inWindowBand = dy % 3 === 1;
        const isWindow = inWindowBand && (
          (dx === -w && dz === 0) ||
          (dx === w && dz === 0) ||
          (dz === d && (dx === -1 || dx === 1)) ||
          (dz === -d && (dx === -2 || dx === 2))
        );
        let material: BlockType = isFloor ? 'metal' : 'concrete';
        if (isWindow) material = 'glass';
        set(updates, cx + dx, baseY + dy, cz + dz, material);
      }
    }
  }

  // Roof slab
  for (let dx = -w - 1; dx <= w + 1; dx++) {
    for (let dz = -d - 1; dz <= d + 1; dz++) {
      set(updates, cx + dx, baseY + height, cz + dz, 'metal');
    }
  }

  // Antenna
  set(updates, cx, baseY + height + 1, cz, 'neon');
  set(updates, cx, baseY + height + 2, cz, 'neon');
  set(updates, cx, baseY + height + 3, cz, 'metal');
  set(updates, cx + 1, baseY + height + 3, cz, 'metal');
  set(updates, cx - 1, baseY + height + 3, cz, 'metal');
  set(updates, cx, baseY + height + 3, cz + 1, 'metal');
  set(updates, cx, baseY + height + 3, cz - 1, 'metal');

  // Interior stairwell at each floor + lobby bathroom
  addStairs(updates, cx + w - 1, baseY, cz + d - 1, 0, -1, 3);
  addStairs(updates, cx + w - 1, baseY + 3, cz + d - 1, 0, -1, 3);
  addStairs(updates, cx + w - 1, baseY + 6, cz + d - 1, 0, -1, 3);
  addBathroom(updates, cx - 1, cz + 1, baseY + 1);

  // Interactive: door, chest on floor 1, chest on floor 3, bed on floor 2
  set(updates, cx, baseY, cz - d, 'door');
  set(updates, cx, baseY + 1, cz - d, 'door');
  set(updates, cx - 2, baseY + 1, cz + 1, 'chest');
  set(updates, cx - 2, baseY + 4, cz + 1, 'bed');
  set(updates, cx - 2, baseY + 7, cz + 1, 'chest');

  // Stone plaza surrounding the base (at terrain surface so it's walkable)
  for (let dx = -w - 2; dx <= w + 2; dx++) {
    for (let dz = -d - 3; dz <= d + 2; dz++) {
      if (Math.abs(dx) <= w && Math.abs(dz) <= d) continue; // skip building footprint
      set(updates, cx + dx, FLOOR_TOP_Y, cz + dz, 'stone');
    }
  }

  // Lamp posts at plaza corners
  addLampPost(updates, cx - w - 2, cz - d - 2, 1);
  addLampPost(updates, cx + w + 2, cz - d - 2, -1);
  addLampPost(updates, cx - w - 2, cz + d + 1, 1);
  addLampPost(updates, cx + w + 2, cz + d + 1, -1);

  // Trees around the plaza
  addTree(updates, cx - 7, cz);
  addTree(updates, cx + 7, cz);

  // Benches on the plaza
  addBench(updates, cx - 5, cz - d - 2);
  addBench(updates, cx + 4, cz - d - 2);
}

// ── Skyscraper ─────────────────────────────────────────────────────────────
// Tall glass-and-concrete office tower with repeating floor bands,
// lobby, internal stairwell, and rooftop observation deck.

function buildSkyscraper(updates: BlockUpdate[], cx: number, cz: number) {
  const baseY = FLOOR_TOP_Y + 1;
  const w = 4, d = 4;
  const numFloors = 7;        // 7 floors × 4 blocks each = 28 blocks tall
  const floorHeight = 4;
  const totalHeight = numFloors * floorHeight;

  for (let floor = 0; floor < numFloors; floor++) {
    const floorBase = baseY + floor * floorHeight;
    const isGroundFloor = floor === 0;

    for (let dx = -w; dx <= w; dx++) {
      for (let dz = -d; dz <= d; dz++) {
        for (let dy = 0; dy < floorHeight; dy++) {
          const onEdge = dx === -w || dx === w || dz === -d || dz === d;
          if (!onEdge) continue;

          // Door: ground floor front, two blocks wide
          const isDoor = isGroundFloor && dz === -d && (dx === 0 || dx === 1) && dy < 2;
          if (isDoor) continue;

          // Slab row at bottom of each floor band
          const isFloorBand = dy === 0 && floor > 0;

          // Window bands: rows 1 and 2 within each floor segment (skip corners for structure)
          const isWindowRow = dy === 1 || dy === 2;
          const isCorner = (dx === -w || dx === w) && (dz === -d || dz === d);
          const isWindow = isWindowRow && !isCorner;

          // Ground floor: mostly glass facade
          const isGroundGlass = isGroundFloor && (dy === 1 || dy === 2) && !isCorner;

          let material: BlockType = 'concrete';
          if (isFloorBand) material = 'metal';
          if (isWindow || isGroundGlass) material = 'glass';
          if (dy === 0 && floor === 0) material = 'stone'; // foundation row

          set(updates, cx + dx, floorBase + dy, cz + dz, material);
        }
      }
    }

    // Floor slab (interior only) between floors
    if (floor > 0) {
      for (let dx = -w + 1; dx <= w - 1; dx++) {
        for (let dz = -d + 1; dz <= d - 1; dz++) {
          set(updates, cx + dx, floorBase, cz + dz, 'concrete');
        }
      }
    }

    // Stairwell column at back-right corner of interior: one step per floor
    if (floor < numFloors - 1) {
      addStairs(updates, cx + w - 1, floorBase, cz + d - 1, 0, -1, floorHeight);
    }

    // Add bathroom on floors 2, 4 (zero-indexed 1, 3)
    if (floor === 1 || floor === 3) {
      addBathroom(updates, cx - w + 2, cz + d - 2, floorBase + 1);
    }
    // Kitchen/break-room on floor 3
    if (floor === 2) {
      addKitchen(updates, cx + w - 2, cz + d - 2, floorBase + 1);
    }
  }

  // Rooftop observation deck
  const roofY = baseY + totalHeight;
  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      set(updates, cx + dx, roofY, cz + dz, 'metal');
    }
  }
  // Railing around roof edge
  for (let dx = -w; dx <= w; dx++) {
    set(updates, cx + dx, roofY + 1, cz - d, 'metal');
    set(updates, cx + dx, roofY + 1, cz + d, 'metal');
  }
  for (let dz = -d + 1; dz <= d - 1; dz++) {
    set(updates, cx - w, roofY + 1, cz + dz, 'metal');
    set(updates, cx + w, roofY + 1, cz + dz, 'metal');
  }
  // Spire / antenna
  set(updates, cx, roofY + 1, cz, 'metal');
  set(updates, cx, roofY + 2, cz, 'metal');
  set(updates, cx, roofY + 3, cz, 'metal');
  set(updates, cx, roofY + 4, cz, 'neon');
  set(updates, cx, roofY + 5, cz, 'neon');
  set(updates, cx, roofY + 6, cz, 'metal');

  // Interactive: lobby double door, chests on several floors
  set(updates, cx, baseY, cz - d, 'door');
  set(updates, cx + 1, baseY, cz - d, 'door');
  set(updates, cx, baseY + 1, cz - d, 'door');
  set(updates, cx + 1, baseY + 1, cz - d, 'door');
  set(updates, cx - 2, baseY + 1, cz - 2, 'chest');
  set(updates, cx - 2, baseY + 5, cz - 2, 'chest');
  set(updates, cx - 2, baseY + 9, cz - 2, 'chest');
  set(updates, cx - 2, baseY + 13, cz - 2, 'chest');

  // Large stone grand plaza (at terrain surface — walkable)
  for (let dx = -w - 4; dx <= w + 4; dx++) {
    for (let dz = -d - 6; dz <= d + 4; dz++) {
      if (Math.abs(dx) <= w && Math.abs(dz) <= d) continue;
      set(updates, cx + dx, FLOOR_TOP_Y, cz + dz, 'stone');
    }
  }
  // Paving accent stripes (concrete strip in plaza)
  for (let dx = -w - 4; dx <= w + 4; dx++) {
    set(updates, cx + dx, FLOOR_TOP_Y, cz - d - 3, 'concrete');
    set(updates, cx + dx, FLOOR_TOP_Y, cz + d + 2, 'concrete');
  }

  // Eight lamp posts around plaza
  for (const side of [-1, 1]) {
    addLampPost(updates, cx + side * (w + 4), cz - d - 4, -side);
    addLampPost(updates, cx + side * (w + 4), cz - d - 1, -side);
    addLampPost(updates, cx + side * (w + 4), cz + d + 2, -side);
    addLampPost(updates, cx + side * (w + 1), cz - d - 5, 0);
  }

  // Trees flanking plaza
  addTree(updates, cx - w - 6, cz - d - 2);
  addTree(updates, cx + w + 6, cz - d - 2);
  addTree(updates, cx - w - 6, cz + d + 3);
  addTree(updates, cx + w + 6, cz + d + 3);

  // Lobby benches
  addBench(updates, cx - 4, cz - d - 4);
  addBench(updates, cx + 3, cz - d - 4);
  addBench(updates, cx - 4, cz + d + 3);
  addBench(updates, cx + 3, cz + d + 3);
}

// ── Apartment ──────────────────────────────────────────────────────────────
// Mid-rise apartment block: 3 floors, multiple unit doors, front balconies,
// interior stairwell, bathroom + kitchen per floor.

function buildApartment(updates: BlockUpdate[], cx: number, cz: number) {
  const baseY = FLOOR_TOP_Y + 1;
  const w = 7, d = 5;
  const numFloors = 3;
  const floorHeight = 4;

  for (let floor = 0; floor < numFloors; floor++) {
    const floorBase = baseY + floor * floorHeight;
    const isGroundFloor = floor === 0;

    // ── Walls ──
    for (let dx = -w; dx <= w; dx++) {
      for (let dz = -d; dz <= d; dz++) {
        for (let dy = 0; dy < floorHeight; dy++) {
          const onEdge = dx === -w || dx === w || dz === -d || dz === d;
          if (!onEdge) continue;

          // Unit doors on ground floor front: three doors at evenly spaced positions
          const unitDoorPositions = [-4, 0, 4];
          const isDoor = isGroundFloor && dz === -d &&
            unitDoorPositions.includes(dx) && dy < 2;
          if (isDoor) continue;

          // Floor band at base of upper floors
          const isFloorBand = dy === 0 && floor > 0;

          // Windows: rows 1-2, spaced along walls (not corners)
          const isCorner = (dx === -w || dx === w) && (dz === -d || dz === d);
          const isFrontWindow = dz === -d && (dy === 1 || dy === 2) && !isCorner &&
            !unitDoorPositions.includes(dx);
          const isSideWindow = (dx === -w || dx === w) && (dy === 1 || dy === 2) &&
            (dz === -2 || dz === 0 || dz === 2);
          const isBackWindow = dz === d && (dy === 1 || dy === 2) &&
            (Math.abs(dx) === 2 || dx === 0);
          const isWindow = isFrontWindow || isSideWindow || isBackWindow;

          let material: BlockType = 'concrete';
          if (isFloorBand) material = 'stone';
          if (isWindow) material = 'glass';
          if (dy === 0 && floor === 0) material = 'stone';

          set(updates, cx + dx, floorBase + dy, cz + dz, material);
        }
      }
    }

    // ── Interior floor slab (above ground floor and up) ──
    if (floor > 0) {
      for (let dx = -w + 1; dx <= w - 1; dx++) {
        for (let dz = -d + 1; dz <= d - 1; dz++) {
          set(updates, cx + dx, floorBase, cz + dz, 'wood');
        }
      }
    }

    // ── Front balconies: extend 2 blocks out from front wall ──
    if (floor > 0) {
      for (let dx = -w + 1; dx <= w - 1; dx++) {
        // Balcony floor
        set(updates, cx + dx, floorBase, cz - d - 1, 'concrete');
        set(updates, cx + dx, floorBase, cz - d - 2, 'concrete');
      }
      // Balcony railing
      for (let dx = -w + 1; dx <= w - 1; dx++) {
        set(updates, cx + dx, floorBase + 1, cz - d - 2, 'metal');
      }
      set(updates, cx - w + 1, floorBase + 1, cz - d - 1, 'metal');
      set(updates, cx + w - 1, floorBase + 1, cz - d - 1, 'metal');
    }

    // ── Stairwell at back-right interior corner ──
    if (floor < numFloors - 1) {
      addStairs(updates, cx + w - 1, floorBase, cz + d - 1, 0, -1, floorHeight);
    }

    // ── Interior rooms ──
    // Kitchen: back-left of each unit section
    addKitchen(updates, cx - 5, cz + 3, floorBase + 1);
    addKitchen(updates, cx + 1, cz + 3, floorBase + 1);
    // Bathroom: back-right of each unit section
    addBathroom(updates, cx + 5, cz + 3, floorBase + 1);
    addBathroom(updates, cx - 1, cz + 3, floorBase + 1);
  }

  // ── Flat roof ──
  const roofY = baseY + numFloors * floorHeight;
  for (let dx = -w; dx <= w; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      set(updates, cx + dx, roofY, cz + dz, 'concrete');
    }
  }
  // Parapet walls
  for (let dx = -w; dx <= w; dx++) {
    set(updates, cx + dx, roofY + 1, cz - d, 'concrete');
    set(updates, cx + dx, roofY + 1, cz + d, 'concrete');
  }
  for (let dz = -d; dz <= d; dz++) {
    set(updates, cx - w, roofY + 1, cz + dz, 'concrete');
    set(updates, cx + w, roofY + 1, cz + dz, 'concrete');
  }
  // Rooftop water tower (decorative)
  set(updates, cx + w - 2, roofY + 1, cz + d - 2, 'metal');
  set(updates, cx + w - 2, roofY + 2, cz + d - 2, 'metal');
  set(updates, cx + w - 2, roofY + 3, cz + d - 2, 'water');
  set(updates, cx + w - 3, roofY + 2, cz + d - 2, 'metal');
  set(updates, cx + w - 1, roofY + 2, cz + d - 2, 'metal');

  // Interactive: three unit doors across front, chests + beds per unit
  for (const udx of [-4, 0, 4]) {
    set(updates, cx + udx, baseY, cz - d, 'door');
    set(updates, cx + udx, baseY + 1, cz - d, 'door');
  }
  // Ground floor: chests in each unit lobby
  set(updates, cx - 5, baseY + 1, cz - 3, 'chest');
  set(updates, cx + 1, baseY + 1, cz - 3, 'chest');
  set(updates, cx + 5, baseY + 1, cz - 3, 'chest');
  // Second floor: beds in each unit
  set(updates, cx - 5, baseY + floorHeight + 1, cz - 3, 'bed');
  set(updates, cx - 4, baseY + floorHeight + 1, cz - 3, 'bed');
  set(updates, cx + 2, baseY + floorHeight + 1, cz - 3, 'bed');
  set(updates, cx + 3, baseY + floorHeight + 1, cz - 3, 'bed');
  // Third floor: chests with extra loot
  set(updates, cx - 5, baseY + floorHeight * 2 + 1, cz - 3, 'chest');
  set(updates, cx + 4, baseY + floorHeight * 2 + 1, cz - 3, 'chest');

  // Courtyard / front plaza (at terrain surface — walkable)
  for (let dx = -w - 2; dx <= w + 2; dx++) {
    for (let dz = -d - 5; dz <= -d - 1; dz++) {
      set(updates, cx + dx, FLOOR_TOP_Y, cz + dz, 'stone');
    }
  }

  // Lamp posts on courtyard
  addLampPost(updates, cx - w - 2, cz - d - 4, 1);
  addLampPost(updates, cx + w + 2, cz - d - 4, -1);
  addLampPost(updates, cx - 2, cz - d - 5, 0);
  addLampPost(updates, cx + 2, cz - d - 5, 0);

  // Trees flanking courtyard
  addTree(updates, cx - w - 4, cz - d - 2);
  addTree(updates, cx + w + 4, cz - d - 2);
  addTree(updates, cx - w - 4, cz + d + 3);
  addTree(updates, cx + w + 4, cz + d + 3);

  // Courtyard benches
  addBench(updates, cx - 5, cz - d - 3);
  addBench(updates, cx + 4, cz - d - 3);

  // Flower boxes below each unit's ground-floor window
  addFlowerBox(updates, cx - 6, cz - d - 1);
  addFlowerBox(updates, cx,     cz - d - 1);
  addFlowerBox(updates, cx + 5, cz - d - 1);
}

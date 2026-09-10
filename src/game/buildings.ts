import type { BlockType } from './terrain';
import type { WorldState } from './useWorld';

export type PlanId = 'pad' | 'wall' | 'hut' | 'tower' | 'garage';

export interface PlanCell {
  dx: number;
  dy: number;
  dz: number;
  type: BlockType;
}

export interface BuildingPlan {
  id: PlanId;
  name: string;
  blurb: string;
  cells: PlanCell[];
}

export interface NamedBuilding {
  id: string;
  name: string;
  plan: PlanId;
  x: number;
  y: number;
  z: number;
}

function cell(dx: number, dy: number, dz: number, type: BlockType): PlanCell {
  return { dx, dy, dz, type };
}

function box(
  x0: number, x1: number,
  y0: number, y1: number,
  z0: number, z1: number,
  type: BlockType,
  skip?: (x: number, y: number, z: number) => boolean
): PlanCell[] {
  const out: PlanCell[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        if (skip?.(x, y, z)) continue;
        out.push(cell(x, y, z, type));
      }
    }
  }
  return out;
}

const pad: BuildingPlan = {
  id: 'pad',
  name: 'Pad',
  blurb: 'A 3×3 concrete slab.',
  cells: box(0, 2, 0, 0, 0, 2, 'concrete'),
};

const wall: BuildingPlan = {
  id: 'wall',
  name: 'Wall',
  blurb: 'A stone barricade, seven across and three high.',
  cells: box(0, 6, 0, 2, 0, 0, 'stone'),
};

const hut: BuildingPlan = {
  id: 'hut',
  name: 'Hut',
  blurb: 'A small wood house with a door and roof.',
  cells: [
    ...box(0, 4, 0, 0, 0, 4, 'wood'),
    ...box(0, 4, 1, 2, 0, 4, 'wood', (x, y, z) => {
      const edge = x === 0 || x === 4 || z === 0 || z === 4;
      if (!edge) return true;
      // Door gap on the front
      if (z === 0 && x === 2 && y <= 2) return true;
      return false;
    }),
    cell(2, 1, 0, 'door'),
    cell(2, 2, 0, 'door'),
    ...box(0, 4, 3, 3, 0, 4, 'wood'),
    cell(2, 1, 3, 'glass'),
  ],
};

const tower: BuildingPlan = {
  id: 'tower',
  name: 'Tower',
  blurb: 'A tall stone lookout, three by three.',
  cells: [
    ...box(0, 2, 0, 7, 0, 2, 'stone', (x, y, z) => {
      const edge = x === 0 || x === 2 || z === 0 || z === 2;
      if (!edge) return y > 0; // hollow
      // windows
      if (y === 3 && ((x === 1 && (z === 0 || z === 2)) || (z === 1 && (x === 0 || x === 2)))) return true;
      return false;
    }),
    ...box(0, 2, 8, 8, 0, 2, 'concrete'),
  ],
};

const garage: BuildingPlan = {
  id: 'garage',
  name: 'Garage',
  blurb: 'Open-front concrete bay with a metal roof.',
  cells: [
    ...box(0, 5, 0, 0, 0, 4, 'concrete'),
    ...box(0, 5, 1, 3, 0, 4, 'concrete', (x, y, z) => {
      const edge = x === 0 || x === 5 || z === 4;
      const front = z === 0;
      if (front) return true; // open
      if (!edge) return true;
      return false;
    }),
    ...box(0, 5, 4, 4, 0, 4, 'metal'),
  ],
};

export const BUILDING_PLANS: BuildingPlan[] = [pad, wall, hut, tower, garage];

export function getPlan(id: PlanId): BuildingPlan {
  return BUILDING_PLANS.find((p) => p.id === id) ?? pad;
}

export function stampPlan(
  world: WorldState,
  plan: BuildingPlan,
  ox: number,
  oy: number,
  oz: number
): { x: number; y: number; z: number; count: number } | null {
  for (const c of plan.cells) {
    const b = world.getBlock(ox + c.dx, oy + c.dy, oz + c.dz);
    if (b && b !== 'air' && b !== 'water') return null;
  }
  world.setBlocks(plan.cells.map((c) => ({
    wx: ox + c.dx,
    wy: oy + c.dy,
    wz: oz + c.dz,
    type: c.type,
  })));
  return { x: ox, y: oy, z: oz, count: plan.cells.length };
}

const LS = 'blockgame.buildings.';

export function loadBuildings(accountId: string): NamedBuilding[] {
  try {
    const raw = window.localStorage.getItem(LS + accountId);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveBuildings(accountId: string, list: NamedBuilding[]) {
  try {
    window.localStorage.setItem(LS + accountId, JSON.stringify(list));
  } catch {
    /* private mode */
  }
}

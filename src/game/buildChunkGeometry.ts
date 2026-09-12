// GREEN (task 8.9): pure chunk meshing boundary.
//
// This is the ChunkMesh geometry algorithm lifted verbatim into a pure
// function with NO dependency on three.js or a GL context. It turns a chunk's
// block map plus a world-level block lookup (for cross-seam face culling and
// ambient occlusion) into plain vertex buckets. ChunkMesh consumes these
// buckets and uploads them to THREE.BufferGeometry; tests consume them
// directly. The synchronous algorithm here is unchanged from the original
// useMemo body — only the THREE object construction was moved to the caller.

import { BlockType } from './terrain';
import { BLOCK_COLORS, BLOCK_TOP_COLORS, BLOCK_OPACITY, TRANSPARENT_BLOCKS } from './blockColors';

const CHUNK_SIZE = 16;

// Baked directional shading (tops catch light, sides differ per axis, bottoms
// sit in shade) — identical to the original ChunkMesh constants.
const FACE_SHADE = { top: 1.0, sideZ: 0.92, sideX: 0.84, bottom: 0.7 } as const;
const AO_LEVELS = [0.48, 0.66, 0.83, 1.0] as const;

type FaceKind = 'top' | 'side' | 'bottom';

interface FaceDef {
  dir: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  corners: Array<[number, number, number]>;
  face: FaceKind;
  shade: number;
}

const FACES: FaceDef[] = [
  { dir: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], face: 'top', shade: FACE_SHADE.top },
  { dir: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], corners: [[0,0,1],[1,0,1],[1,0,0],[0,0,0]], face: 'bottom', shade: FACE_SHADE.bottom },
  { dir: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], face: 'side', shade: FACE_SHADE.sideX },
  { dir: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], face: 'side', shade: FACE_SHADE.sideX },
  { dir: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], face: 'side', shade: FACE_SHADE.sideZ },
  { dir: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], face: 'side', shade: FACE_SHADE.sideZ },
];

/** sRGB hex -> linear-ish [r,g,b] in 0..1. Matches THREE.Color's plain hex
 *  parse (no color-management conversion), so baked vertex colors are byte
 *  identical to the original mesher. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function getColor(type: BlockType, face: FaceKind): [number, number, number] {
  const col = face === 'top' ? BLOCK_TOP_COLORS[type] : BLOCK_COLORS[type];
  return hexToRgb(col || '#888888');
}

function axisSign(corner: [number, number, number], axis: [number, number, number]): number {
  const c = corner[0] * axis[0] + corner[1] * axis[1] + corner[2] * axis[2];
  return c === 1 ? 1 : -1;
}

export interface GeometryBucket {
  positions: number[];
  colors: number[];
  normals: number[];
  indices: number[];
}

export interface ChunkGeometryData {
  opaque: GeometryBucket;
  transparent: GeometryBucket;
  water: GeometryBucket;
  transparentOpacity: number;
}

const newBucket = (): GeometryBucket => ({ positions: [], colors: [], normals: [], indices: [] });

export type BlockLookup = (wx: number, wy: number, wz: number) => BlockType | undefined;

/** Pure meshing: chunk blocks + world lookup -> vertex buckets. */
export function buildChunkGeometry(
  chunkX: number,
  chunkZ: number,
  blocks: Map<string, BlockType>,
  getBlock: BlockLookup,
): ChunkGeometryData {
  const opaque = newBucket();
  const transparent = newBucket();
  const water = newBucket();
  let tOpacity = 0.5;

  const occludes = (wx: number, wy: number, wz: number): boolean => {
    const bt = getBlock(wx, wy, wz);
    if (!bt || bt === 'air') return false;
    if (bt === 'leaves') return false;
    if (TRANSPARENT_BLOCKS.has(bt)) return false;
    return true;
  };

  const cornerAO = (
    bx: number, by: number, bz: number,
    d: [number, number, number],
    u: [number, number, number], su: number,
    v: [number, number, number], sv: number,
  ): number => {
    const s1 = occludes(bx + d[0] + u[0] * su, by + d[1] + u[1] * su, bz + d[2] + u[2] * su);
    const s2 = occludes(bx + d[0] + v[0] * sv, by + d[1] + v[1] * sv, bz + d[2] + v[2] * sv);
    if (s1 && s2) return 0;
    const cn = occludes(
      bx + d[0] + u[0] * su + v[0] * sv,
      by + d[1] + u[1] * su + v[1] * sv,
      bz + d[2] + u[2] * su + v[2] * sv,
    );
    return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (cn ? 1 : 0));
  };

  for (const [key, blockType] of blocks) {
    if (blockType === 'air') continue;
    const parts = key.split(',');
    const lx = parseInt(parts[0]);
    const ly = parseInt(parts[1]);
    const lz = parseInt(parts[2]);
    const wx = chunkX * CHUNK_SIZE + lx;
    const wz = chunkZ * CHUNK_SIZE + lz;

    const isWater = blockType === 'water';
    const isTransparent = TRANSPARENT_BLOCKS.has(blockType);
    if (isTransparent && !isWater) {
      const o = BLOCK_OPACITY[blockType];
      if (typeof o === 'number') tOpacity = o;
    }
    const target = isWater ? water : isTransparent ? transparent : opaque;

    for (const { dir, u, v, corners, face, shade } of FACES) {
      const nx = wx + dir[0];
      const ny = ly + dir[1];
      const nz = wz + dir[2];

      if (isTransparent) {
        if (occludes(nx, ny, nz)) continue;
        if (getBlock(nx, ny, nz) === blockType) continue;
      } else if (occludes(nx, ny, nz)) {
        continue;
      }

      const [cr, cg, cb] = getColor(blockType, face);
      const baseIdx = target.positions.length / 3;

      const ao: number[] = [];
      for (const corner of corners) {
        const su = axisSign(corner, u);
        const sv = axisSign(corner, v);
        const level = isWater ? 3 : cornerAO(wx, ly, wz, dir, u, su, v, sv);
        ao.push(level);
        const k = shade * AO_LEVELS[level];
        target.positions.push(wx + corner[0], ly + corner[1], wz + corner[2]);
        target.colors.push(cr * k, cg * k, cb * k);
        target.normals.push(dir[0], dir[1], dir[2]);
      }

      if (ao[0] + ao[2] > ao[1] + ao[3]) {
        target.indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
      } else {
        target.indices.push(baseIdx + 1, baseIdx + 2, baseIdx + 3, baseIdx + 1, baseIdx + 3, baseIdx);
      }
    }
  }

  return { opaque, transparent, water, transparentOpacity: tOpacity };
}

export { CHUNK_SIZE };

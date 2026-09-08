import { useMemo } from 'react';
import * as THREE from 'three';
import { BlockType } from '../game/terrain';
import { BLOCK_COLORS, BLOCK_TOP_COLORS, BLOCK_OPACITY, TRANSPARENT_BLOCKS } from '../game/blockColors';

interface ChunkMeshProps {
  chunkX: number;
  chunkZ: number;
  blocks: Map<string, BlockType>;
  onPointerDown?: (e: THREE.Event, worldX: number, worldY: number, worldZ: number, face: THREE.Vector3) => void;
}

const CHUNK_SIZE = 16;

function getColor(type: BlockType, face: 'top' | 'side' | 'bottom'): THREE.Color {
  const col = face === 'top' ? BLOCK_TOP_COLORS[type] : BLOCK_COLORS[type];
  return new THREE.Color(col || '#888888');
}

const FACES = [
  { dir: [0, 1, 0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], face: 'top' as const },
  { dir: [0, -1, 0], corners: [[0,0,1],[1,0,1],[1,0,0],[0,0,0]], face: 'bottom' as const },
  { dir: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], face: 'side' as const },
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], face: 'side' as const },
  { dir: [0, 0, 1], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], face: 'side' as const },
  { dir: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], face: 'side' as const },
];

export function ChunkMesh({ chunkX, chunkZ, blocks, onPointerDown }: ChunkMeshProps) {
  const { geometry, transparentGeometry, transparentOpacity } = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    const tPositions: number[] = [];
    const tColors: number[] = [];
    const tIndices: number[] = [];
    const tNormals: number[] = [];
    let tOpacity = 0.5;

    function isOpaque(lx: number, ly: number, lz: number): boolean {
      if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || lz < 0 || lz >= CHUNK_SIZE) return false;
      const bt = blocks.get(`${lx},${ly},${lz}`);
      if (!bt || bt === 'air') return false;
      if (bt === 'leaves') return false;
      if (TRANSPARENT_BLOCKS.has(bt)) return false;
      return true;
    }

    function neighborSameTransparent(lx: number, ly: number, lz: number, type: BlockType): boolean {
      if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || lz < 0 || lz >= CHUNK_SIZE) return false;
      const bt = blocks.get(`${lx},${ly},${lz}`);
      return bt === type;
    }

    for (const [key, blockType] of blocks) {
      if (blockType === 'air') continue;
      const parts = key.split(',');
      const lx = parseInt(parts[0]);
      const ly = parseInt(parts[1]);
      const lz = parseInt(parts[2]);
      const wx = chunkX * CHUNK_SIZE + lx;
      const wz = chunkZ * CHUNK_SIZE + lz;

      const isTransparent = TRANSPARENT_BLOCKS.has(blockType);
      if (isTransparent) {
        const o = BLOCK_OPACITY[blockType];
        if (typeof o === 'number') tOpacity = o;
      }
      const targetPositions = isTransparent ? tPositions : positions;
      const targetColors = isTransparent ? tColors : colors;
      const targetIndices = isTransparent ? tIndices : indices;
      const targetNormals = isTransparent ? tNormals : normals;

      for (const { dir, corners, face } of FACES) {
        const nx = lx + dir[0];
        const ny = ly + dir[1];
        const nz = lz + dir[2];

        let shouldDraw: boolean;
        if (isTransparent) {
          shouldDraw = !isOpaque(nx, ny, nz) && !neighborSameTransparent(nx, ny, nz, blockType);
        } else {
          shouldDraw = !isOpaque(nx, ny, nz);
        }

        if (!shouldDraw) continue;

        const color = getColor(blockType, face);
        const ndx = targetPositions.length / 3;

        for (const corner of corners) {
          targetPositions.push(wx + corner[0], ly + corner[1], wz + corner[2]);
          targetColors.push(color.r, color.g, color.b);
          targetNormals.push(dir[0], dir[1], dir[2]);
        }

        targetIndices.push(ndx, ndx + 1, ndx + 2, ndx, ndx + 2, ndx + 3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();

    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPositions, 3));
    tGeo.setAttribute('color', new THREE.Float32BufferAttribute(tColors, 3));
    tGeo.setAttribute('normal', new THREE.Float32BufferAttribute(tNormals, 3));
    tGeo.setIndex(tIndices);
    tGeo.computeBoundingSphere();

    return { geometry: geo, transparentGeometry: tGeo, transparentOpacity: tOpacity };
  }, [chunkX, chunkZ, blocks]);

  return (
    <group>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
      >
        <meshLambertMaterial vertexColors side={THREE.FrontSide} />
      </mesh>
      <mesh
        geometry={transparentGeometry}
        renderOrder={1}
      >
        <meshLambertMaterial
          vertexColors
          transparent
          opacity={transparentOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

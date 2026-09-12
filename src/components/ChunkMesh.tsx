import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BlockType } from '../game/terrain';
import { buildChunkGeometry, GeometryBucket } from '../game/buildChunkGeometry';
import { WaterMaterial } from './WaterMaterial';

interface ChunkMeshProps {
  chunkX: number;
  chunkZ: number;
  blocks: Map<string, BlockType>;
  /** World-level block lookup so faces and AO are correct across chunk seams. */
  getBlock: (wx: number, wy: number, wz: number) => BlockType | undefined;
  night: boolean;
}

function bucketToGeometry(b: GeometryBucket): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  g.setIndex(b.indices);
  g.computeBoundingSphere();
  return g;
}

export function ChunkMesh({ chunkX, chunkZ, blocks, getBlock, night }: ChunkMeshProps) {
  // The pure meshing algorithm is unchanged; only the THREE object creation
  // moved here. useMemo keeps the buckets stable for a given (chunk, blocks).
  const data = useMemo(
    () => buildChunkGeometry(chunkX, chunkZ, blocks, getBlock),
    [chunkX, chunkZ, blocks, getBlock],
  );

  const { geometry, transparentGeometry, waterGeometry } = useMemo(
    () => ({
      geometry: bucketToGeometry(data.opaque),
      transparentGeometry: bucketToGeometry(data.transparent),
      waterGeometry: bucketToGeometry(data.water),
    }),
    [data],
  );
  const transparentOpacity = data.transparentOpacity;

  // Dispose the geometries this render owns when they are REPLACED (a new
  // `data` produced fresh geometries) and when the component UNMOUNTS (the
  // chunk left the active window, so World stopped rendering it). Without this
  // the memoized geometry leaked its GPU buffers on every edit and eviction.
  useEffect(() => {
    return () => {
      geometry.dispose();
      transparentGeometry.dispose();
      waterGeometry.dispose();
    };
  }, [geometry, transparentGeometry, waterGeometry]);

  const waterRef = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (waterRef.current) waterRef.current.uniforms.uTime.value = clock.elapsedTime;
  });

  const hasWater = waterGeometry.getAttribute('position')?.count > 0;

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshLambertMaterial vertexColors side={THREE.FrontSide} />
      </mesh>
      <mesh geometry={transparentGeometry} renderOrder={1}>
        <meshLambertMaterial
          vertexColors
          transparent
          opacity={transparentOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {hasWater && (
        <mesh geometry={waterGeometry} renderOrder={2}>
          <WaterMaterial ref={waterRef} night={night} />
        </mesh>
      )}
    </group>
  );
}

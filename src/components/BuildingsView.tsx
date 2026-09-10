import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { WorldState } from '../game/useWorld';
import { BLOCK_COLORS } from '../game/blockColors';
import { getPlan, type NamedBuilding, type PlanId } from '../game/buildings';

export function BuildingGhost({
  world,
  planId,
}: {
  world: WorldState;
  planId: PlanId | null;
}) {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const origin = useRef(new THREE.Vector3());
  const dir = useRef(new THREE.Vector3());
  const p = useRef(new THREE.Vector3());
  const plan = planId ? getPlan(planId) : null;

  const meshes = useMemo(() => {
    if (!plan) return null;
    return plan.cells.map((c, i) => (
      <mesh key={i} position={[c.dx + 0.5, c.dy + 0.5, c.dz + 0.5]}>
        <boxGeometry args={[0.95, 0.95, 0.95]} />
        <meshBasicMaterial color={BLOCK_COLORS[c.type]} transparent opacity={0.35} depthWrite={false} />
      </mesh>
    ));
  }, [plan]);

  useFrame(() => {
    const g = group.current;
    if (!g || !plan) {
      if (g) g.visible = false;
      return;
    }
    camera.getWorldDirection(dir.current);
    origin.current.copy(camera.position);
    let hit: THREE.Vector3 | null = null;
    for (let t = 0.6; t <= 8; t += 0.2) {
      p.current.copy(origin.current).addScaledVector(dir.current, t);
      const bx = Math.floor(p.current.x);
      const by = Math.floor(p.current.y);
      const bz = Math.floor(p.current.z);
      const b = world.getBlock(bx, by, bz);
      if (b && b !== 'air' && b !== 'water') {
        hit = new THREE.Vector3(bx, by + 1, bz);
        break;
      }
    }
    if (!hit) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(hit.x, hit.y, hit.z);
  });

  if (!plan) return null;
  return <group ref={group} visible={false}>{meshes}</group>;
}

export function NamedBuildingLabels({ buildings }: { buildings: NamedBuilding[] }) {
  return (
    <>
      {buildings.map((b) => (
        <Billboard key={b.id} position={[b.x + 1.2, b.y + 3.2, b.z + 1.2]}>
          <Text
            fontSize={0.38}
            color="#ffd76a"
            outlineWidth={0.04}
            outlineColor="#000000"
            anchorX="center"
            anchorY="middle"
          >
            {b.name}
          </Text>
        </Billboard>
      ))}
    </>
  );
}

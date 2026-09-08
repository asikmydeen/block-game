import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getLightColor, type RoadAxis } from '../game/traffic';

// Four traffic light poles on the corners of the road intersection.
// Poles are meshes (not world blocks) so cars never collide with them
// (moveCar only probes world blocks). Ground level next to the road is y=13.

const GROUND_Y = 13;
const POLE_H = 4.2;
const HEAD_Y = POLE_H - 0.7;

const LAMP_COLORS = {
  red: { on: '#ff2f2f', off: '#3d0c0c' },
  yellow: { on: '#ffcf3d', off: '#3d340c' },
  green: { on: '#3dff5e', off: '#0c3d16' },
} as const;

interface PoleSpec {
  x: number;
  z: number;
  // The road axis this head controls, which also determines facing.
  axis: RoadAxis;
  faceYaw: number;
}

// Corner block positions just off the asphalt (road is x,z ∈ [-3,-1]).
// Heads controlling X traffic face along X; Z heads face along Z, so drivers
// see the light for their own road as they approach.
const POLES: PoleSpec[] = [
  { x: 0.5, z: 0.5, axis: 'x', faceYaw: Math.PI / 2 },
  { x: -3.5, z: -3.5, axis: 'x', faceYaw: -Math.PI / 2 },
  { x: 0.5, z: -3.5, axis: 'z', faceYaw: 0 },
  { x: -3.5, z: 0.5, axis: 'z', faceYaw: Math.PI },
];

interface LampMats {
  red: THREE.MeshBasicMaterial | null;
  yellow: THREE.MeshBasicMaterial | null;
  green: THREE.MeshBasicMaterial | null;
}

export function TrafficLights() {
  const lampMatsRef = useRef<LampMats[]>(POLES.map(() => ({ red: null, yellow: null, green: null })));

  useFrame(() => {
    const xColor = getLightColor('x');
    const zColor = getLightColor('z');
    for (let i = 0; i < POLES.length; i++) {
      const active = POLES[i].axis === 'x' ? xColor : zColor;
      const mats = lampMatsRef.current[i];
      for (const key of ['red', 'yellow', 'green'] as const) {
        const mat = mats[key];
        if (mat) mat.color.set(active === key ? LAMP_COLORS[key].on : LAMP_COLORS[key].off);
      }
    }
  });

  return (
    <>
      {POLES.map((p, i) => (
        <group key={i} position={[p.x, GROUND_Y, p.z]} rotation={[0, p.faceYaw, 0]}>
          {/* Pole */}
          <mesh position={[0, POLE_H / 2, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.12, POLE_H, 8]} />
            <meshLambertMaterial color="#3c4148" />
          </mesh>
          {/* Base */}
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.22, 0.28, 0.3, 8]} />
            <meshLambertMaterial color="#2a2e33" />
          </mesh>
          {/* Head housing */}
          <mesh position={[0, HEAD_Y, 0]} castShadow>
            <boxGeometry args={[0.5, 1.35, 0.35]} />
            <meshLambertMaterial color="#1d2126" />
          </mesh>
          {/* Visor-side lamps (front face of the housing) */}
          <mesh position={[0, HEAD_Y + 0.4, 0.19]}>
            <sphereGeometry args={[0.14, 12, 12]} />
            <meshBasicMaterial
              ref={(m) => { lampMatsRef.current[i].red = m; }}
              color={LAMP_COLORS.red.off}
            />
          </mesh>
          <mesh position={[0, HEAD_Y, 0.19]}>
            <sphereGeometry args={[0.14, 12, 12]} />
            <meshBasicMaterial
              ref={(m) => { lampMatsRef.current[i].yellow = m; }}
              color={LAMP_COLORS.yellow.off}
            />
          </mesh>
          <mesh position={[0, HEAD_Y - 0.4, 0.19]}>
            <sphereGeometry args={[0.14, 12, 12]} />
            <meshBasicMaterial
              ref={(m) => { lampMatsRef.current[i].green = m; }}
              color={LAMP_COLORS.green.off}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

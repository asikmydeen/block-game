import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { selectNearestLights } from '../game/renderQuality';

// Decorative street lamps lining both roads. Meshes (not blocks) so cars
// never collide with them — same reasoning as the traffic light poles.
// At night each lamp shows a soft glow pool on the asphalt beneath the head;
// the REAL point light is pooled: at most `lightLimit` of them are lit at once,
// chosen as the lamps nearest the player. On desktop the limit is Infinity so
// every lamp keeps its light, exactly as before.

const GROUND_Y = 13;
const POLE_H = 5;

interface LampSpec {
  x: number;
  z: number;
  armYaw: number; // arm points over the road
}

function buildLamps(): LampSpec[] {
  const lamps: LampSpec[] = [];
  // Along the X road (z ∈ [-3,-1]): alternate sides, skip the intersection
  for (let x = -60; x <= 60; x += 20) {
    if (Math.abs(x + 2) < 8) continue;
    const side = (x / 20) % 2 === 0 ? 1 : -1;
    const z = side > 0 ? 0.5 : -4.5;
    lamps.push({ x, z, armYaw: side > 0 ? Math.PI : 0 });
  }
  // Along the Z road (x ∈ [-3,-1])
  for (let z = -60; z <= 60; z += 20) {
    if (Math.abs(z + 2) < 8) continue;
    const side = (z / 20) % 2 === 0 ? 1 : -1;
    const x = side > 0 ? 0.5 : -4.5;
    lamps.push({ x, z, armYaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  return lamps;
}

const LAMPS = buildLamps();

// World-space centres of each lamp's pool of light (the head hangs 1.4 units
// from the pole along the arm). Zombies treat these as safe zones at night.
export const LAMP_LIGHT_SPOTS: Array<{ x: number; z: number }> = LAMPS.map((l) => ({
  x: l.x + Math.sin(l.armYaw) * 1.4,
  z: l.z + Math.cos(l.armYaw) * 1.4,
}));
export const LAMP_SAFE_RADIUS = 4.5;

// Re-pool the lit lamps only when the player has moved at least this far since
// the last selection — a coarse threshold, so light assignment updates on
// movement/chunk-scale changes rather than every frame.
const REPOOL_DISTANCE = 6;
const REPOOL_DISTANCE_SQ = REPOOL_DISTANCE * REPOOL_DISTANCE;

interface StreetLampsProps {
  night: boolean;
  // Max simultaneously-lit decorative point lights. Infinity => all lamps lit.
  lightLimit?: number;
  // Live player position; read in useFrame to pool the nearest lights. Optional
  // so existing callers/tests that only need meshes keep working.
  playerPosRef?: MutableRefObject<THREE.Vector3>;
}

export function StreetLamps({ night, lightLimit = Infinity, playerPosRef }: StreetLampsProps) {
  // One pointLight ref per lamp. We toggle `.visible` (and reuse the object)
  // instead of mounting/unmounting, so pooling never touches React state.
  const lightRefs = useRef<Array<THREE.PointLight | null>>(
    LAMPS.map(() => null),
  );
  const lastPoolCenter = useRef<{ x: number; z: number } | null>(null);
  // Index set of lamps currently allowed to be lit (by nearest-N selection).
  const litSet = useRef<Set<number>>(new Set());

  const applyPool = (cx: number, cz: number) => {
    if (!Number.isFinite(lightLimit)) {
      // All lamps lit: fast path, no per-lamp distance work.
      for (const l of lightRefs.current) if (l) l.visible = night;
      return;
    }
    const chosen = selectNearestLights(
      LAMP_LIGHT_SPOTS.map((s, i) => ({ ...s, i })),
      { x: cx, z: cz },
      lightLimit,
    );
    const next = new Set(chosen.map((c) => c.i));
    litSet.current = next;
    for (let i = 0; i < lightRefs.current.length; i++) {
      const lt = lightRefs.current[i];
      if (lt) lt.visible = night && next.has(i);
    }
  };

  useFrame(() => {
    const p = playerPosRef?.current;
    // No player position (e.g. static test mount): light everything within the
    // limit around the origin once.
    const cx = p ? p.x : 0;
    const cz = p ? p.z : 0;
    const prev = lastPoolCenter.current;
    const moved =
      !prev || (cx - prev.x) ** 2 + (cz - prev.z) ** 2 >= REPOOL_DISTANCE_SQ;
    if (moved) {
      lastPoolCenter.current = { x: cx, z: cz };
      applyPool(cx, cz);
    }
  });

  return (
    <>
      {LAMPS.map((l, i) => (
        <group key={i} position={[l.x, GROUND_Y, l.z]} rotation={[0, l.armYaw, 0]}>
          {/* Pole */}
          <mesh position={[0, POLE_H / 2, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.1, POLE_H, 8]} />
            <meshLambertMaterial color="#2f343a" />
          </mesh>
          {/* Arm over the road */}
          <mesh position={[0, POLE_H - 0.1, 0.7]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 1.4, 8]} />
            <meshLambertMaterial color="#2f343a" />
          </mesh>
          {/* Lamp head + bulb plate */}
          <mesh position={[0, POLE_H - 0.2, 1.4]}>
            <boxGeometry args={[0.3, 0.14, 0.5]} />
            <meshLambertMaterial color="#23272c" />
          </mesh>
          <mesh position={[0, POLE_H - 0.31, 1.4]}>
            <boxGeometry args={[0.22, 0.08, 0.4]} />
            <meshBasicMaterial color={night ? '#fff3c4' : '#ffe9a8'} />
          </mesh>
          {night && (
            <>
              {/* Real light on the surroundings — pooled via ref.visible so at
                  most `lightLimit` are lit; mesh + glow below stay visible so
                  the lamp always reads as a lamp even when its light is off. */}
              <pointLight
                ref={(el) => {
                  lightRefs.current[i] = el;
                }}
                visible={Number.isFinite(lightLimit) ? litSet.current.has(i) : true}
                position={[0, POLE_H - 0.6, 1.4]}
                color="#ffdf9e"
                intensity={50}
                distance={16}
                decay={2}
              />
              {/* Soft pool of light on the asphalt (always shown at night) */}
              <mesh position={[0, 0.03, 1.4]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[3.4, 24]} />
                <meshBasicMaterial
                  color="#ffdf9e"
                  transparent
                  opacity={0.14}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            </>
          )}
        </group>
      ))}
    </>
  );
}

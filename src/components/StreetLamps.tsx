import * as THREE from 'three';

// Decorative street lamps lining both roads. Meshes (not blocks) so cars
// never collide with them — same reasoning as the traffic light poles.
// At night each lamp casts a real point light plus a soft glow pool on the
// asphalt beneath the head.

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

export function StreetLamps({ night }: { night: boolean }) {
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
              {/* Real light on the surroundings */}
              <pointLight
                position={[0, POLE_H - 0.6, 1.4]}
                color="#ffdf9e"
                intensity={50}
                distance={16}
                decay={2}
              />
              {/* Soft pool of light on the asphalt */}
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

import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { WorldState } from '../game/useWorld';
import { FOREST_INNER_R } from '../game/decorations';
import { RIDE_SPECS, animalsRegistry, ridingState, riderCombat, type RideableKind } from '../game/animals';
import { drivingState } from '../game/cars';
import { touchState } from './TouchControls';
import { Humanoid, createLimbs, HUMANOID_HIP_Y } from './Humanoid';

// Ambient blocky wildlife roaming the meadows and forest edge around town.
// Every animal can be mounted and ridden (E key), car-style: W/S for
// speed, A/D to steer, chase camera behind the animal.

enum Controls {
  forward = 'forward',
  back = 'back',
  left = 'left',
  right = 'right',
  jump = 'jump',
}

type AnimalKind = RideableKind;

const MOUNT_RANGE = 4;

interface AnimalData {
  id: number;
  kind: AnimalKind;
  pos: THREE.Vector3;
  dir: number;
  walkTimer: number;
  walking: boolean;
  speed: number;
  rideVel: number;
  homeX: number;
  homeZ: number;
}

const FLOOR_TOP_Y = 12;

function isSolid(world: WorldState, x: number, y: number, z: number): boolean {
  const b = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  return !!b && b !== 'air' && b !== 'water';
}

function findGroundY(world: WorldState, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  for (let y = 30; y >= 0; y--) {
    const b = world.getBlock(ix, y, iz);
    if (b && b !== 'air' && b !== 'water') return y + 1;
  }
  return FLOOR_TOP_Y + 1;
}

const HERD_SPECS: Array<{ kind: AnimalKind; count: number; speed: number }> = [
  { kind: 'pig', count: 5, speed: 0.7 },
  { kind: 'chicken', count: 6, speed: 0.9 },
  { kind: 'deer', count: 5, speed: 1.3 },
];

function createAnimals(): AnimalData[] {
  const list: AnimalData[] = [];
  let id = 0;
  for (const spec of HERD_SPECS) {
    for (let i = 0; i < spec.count; i++) {
      // Meadow band between the houses and the deep forest
      const angle = Math.random() * Math.PI * 2;
      const r = 52 + Math.random() * (FOREST_INNER_R - 52 + 14);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      list.push({
        id: id++,
        kind: spec.kind,
        pos: new THREE.Vector3(x, FLOOR_TOP_Y + 1, z),
        dir: Math.random() * Math.PI * 2,
        walkTimer: 1 + Math.random() * 3,
        walking: true,
        speed: spec.speed * (0.85 + Math.random() * 0.3),
        rideVel: 0,
        homeX: x,
        homeZ: z,
      });
    }
  }
  return list;
}

interface LegRefs {
  fl: THREE.Group | null;
  fr: THREE.Group | null;
  bl: THREE.Group | null;
  br: THREE.Group | null;
}

interface AnimalsProps {
  world: WorldState;
  playerPosRef: MutableRefObject<THREE.Vector3>;
  touchMode: boolean;
  onNearAnimal: (kind: AnimalKind | null) => void;
}

export function Animals({ world, playerPosRef, touchMode, onNearAnimal }: AnimalsProps) {
  const { camera } = useThree();
  const [, getControls] = useKeyboardControls<Controls>();
  const dataRef = useRef<AnimalData[] | null>(null);
  if (dataRef.current === null) dataRef.current = createAnimals();
  const animals = dataRef.current;

  const groupRefs = useRef<(THREE.Group | null)[]>(animals.map(() => null));
  const legRefs = useRef<LegRefs[]>(animals.map(() => ({ fl: null, fr: null, bl: null, br: null })));
  const riderRefs = useRef<(THREE.Group | null)[]>(animals.map(() => null));
  const riderLimbsRef = useRef(animals.map(() => createLimbs()));
  const riddenIdRef = useRef<number | null>(null);
  const nearTimerRef = useRef(0);
  const lastNearRef = useRef<AnimalKind | null>(null);

  useEffect(() => {
    animalsRegistry.toggleRide = (playerPos: THREE.Vector3) => {
      if (riddenIdRef.current !== null) {
        // Dismount beside the animal
        const a = animals[riddenIdRef.current];
        a.rideVel = 0;
        const sideX = -Math.sin(a.dir) * 1.6;
        const sideZ = Math.cos(a.dir) * 1.6;
        const px = a.pos.x + sideX;
        const pz = a.pos.z + sideZ;
        playerPos.set(px, findGroundY(world, px, pz), pz);
        riddenIdRef.current = null;
        ridingState.active = false;
        ridingState.justExited = true;
        return 'dismounted';
      }
      let best: number | null = null;
      let bestDist = MOUNT_RANGE;
      for (const a of animals) {
        const d = Math.hypot(playerPos.x - a.pos.x, playerPos.z - a.pos.z);
        if (d < bestDist && Math.abs(playerPos.y - a.pos.y) < 4) {
          bestDist = d;
          best = a.id;
        }
      }
      if (best === null) return null;
      riddenIdRef.current = best;
      animals[best].rideVel = 0;
      ridingState.active = true;
      return 'mounted';
    };
    return () => {
      animalsRegistry.toggleRide = null;
    };
    // Registered once; world identity changes per render but its functions are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animals]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = performance.now() * 0.006;
    const riddenId = riddenIdRef.current;

    // "Press E to ride" proximity prompt (throttled)
    nearTimerRef.current -= dt;
    if (nearTimerRef.current <= 0) {
      nearTimerRef.current = 0.25;
      let near: AnimalKind | null = null;
      if (riddenId === null && !drivingState.active) {
        const p = playerPosRef.current;
        let bestDist = MOUNT_RANGE;
        for (const a of animals) {
          const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
          if (d < bestDist && Math.abs(p.y - a.pos.y) < 4) {
            bestDist = d;
            near = a.kind;
          }
        }
      }
      if (near !== lastNearRef.current) {
        lastNearRef.current = near;
        onNearAnimal(near);
      }
    }

    for (let i = 0; i < animals.length; i++) {
      const a = animals[i];
      const isRidden = riddenId === a.id;

      if (isRidden) {
        // Player steers the animal, car-style
        const spec = RIDE_SPECS[a.kind];
        const controls = getControls();
        let throttle = 0;
        let steer = 0;
        if (touchMode) {
          throttle = Math.abs(touchState.moveY) > 0.1 ? touchState.moveY : 0;
          steer = Math.abs(touchState.moveX) > 0.1 ? touchState.moveX : 0;
        } else {
          if (controls.forward) throttle = 1;
          else if (controls.back) throttle = -0.5;
          if (controls.left) steer = -1;
          else if (controls.right) steer = 1;
        }

        if (throttle !== 0) {
          a.rideVel += throttle * spec.maxSpeed * 2.5 * dt;
        } else {
          a.rideVel *= Math.max(0, 1 - 5 * dt);
          if (Math.abs(a.rideVel) < 0.05) a.rideVel = 0;
        }
        a.rideVel = Math.max(-spec.maxSpeed * 0.4, Math.min(spec.maxSpeed, a.rideVel));

        if (steer !== 0 && Math.abs(a.rideVel) > 0.3) {
          a.dir += steer * spec.turnRate * dt * Math.sign(a.rideVel);
        }

        if (a.rideVel !== 0) {
          const nx = a.pos.x + Math.cos(a.dir) * a.rideVel * dt;
          const nz = a.pos.z + Math.sin(a.dir) * a.rideVel * dt;
          const blocked = isSolid(world, nx, a.pos.y, nz) || isSolid(world, nx, a.pos.y + 0.5, nz);
          if (!blocked) {
            a.pos.x = nx;
            a.pos.z = nz;
          } else {
            a.rideVel = 0;
          }
        }
        a.pos.y = findGroundY(world, a.pos.x, a.pos.z);
        a.walking = Math.abs(a.rideVel) > 0.1;

        playerPosRef.current.set(a.pos.x, a.pos.y, a.pos.z);

        // Chase camera behind the animal
        const cx = a.pos.x - Math.cos(a.dir) * spec.camDist;
        const cz = a.pos.z - Math.sin(a.dir) * spec.camDist;
        const cy = a.pos.y + 3;
        camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 6));
        camera.lookAt(a.pos.x, a.pos.y + 1.0, a.pos.z);
      } else {
        // Ambient wander AI
        a.walkTimer -= dt;
        if (a.walkTimer <= 0) {
          const distFromHome = Math.hypot(a.pos.x - a.homeX, a.pos.z - a.homeZ);
          if (distFromHome > 12) {
            a.dir = Math.atan2(a.homeZ - a.pos.z, a.homeX - a.pos.x);
          } else {
            a.dir += (Math.random() - 0.5) * Math.PI;
          }
          a.walkTimer = 1.5 + Math.random() * 4;
          a.walking = Math.random() > 0.35;
        }

        if (a.walking) {
          const nx = a.pos.x + Math.cos(a.dir) * a.speed * dt;
          const nz = a.pos.z + Math.sin(a.dir) * a.speed * dt;
          const blocked = isSolid(world, nx, a.pos.y, nz) || isSolid(world, nx, a.pos.y + 0.5, nz);
          if (!blocked) {
            a.pos.x = nx;
            a.pos.z = nz;
          } else {
            a.dir += Math.PI / 2 + (Math.random() - 0.5) * 0.5;
          }
        }

        a.pos.y = findGroundY(world, a.pos.x, a.pos.z);
      }

      const g = groupRefs.current[i];
      if (g) {
        g.position.set(a.pos.x, a.pos.y, a.pos.z);
        g.rotation.y = -a.dir + Math.PI / 2;
      }

      // Rider avatar on the animal's back
      const rider = riderRefs.current[i];
      if (rider) {
        rider.visible = isRidden;
        if (isRidden) {
          const limbs = riderLimbsRef.current[i];
          // Riding pose: hips on the saddle, thighs angled forward-down and
          // splayed outward to straddle the animal's body; left arm holds on.
          // The right arm swings when the player attacks from the saddle.
          riderCombat.swingTimer = Math.max(0, riderCombat.swingTimer - dt);
          const punch = riderCombat.swingTimer > 0
            ? Math.sin(((0.32 - riderCombat.swingTimer) / 0.32) * Math.PI)
            : 0;
          if (limbs.leftLeg) {
            limbs.leftLeg.rotation.x = -0.7;
            limbs.leftLeg.rotation.z = -0.45;
          }
          if (limbs.rightLeg) {
            limbs.rightLeg.rotation.x = -0.7;
            limbs.rightLeg.rotation.z = 0.45;
          }
          if (limbs.leftArm) limbs.leftArm.rotation.x = -0.6;
          if (limbs.rightArm) limbs.rightArm.rotation.x = -0.6 - punch * 1.3;
          // Lean into the ride, more at speed, with a subtle trot bounce
          const lean = 0.06 + Math.min(0.3, Math.abs(a.rideVel) * 0.025);
          rider.rotation.x = lean;
          rider.position.y =
            RIDE_SPECS[a.kind].saddleY - HUMANOID_HIP_Y * (a.kind === 'chicken' ? 0.8 : 1) +
            (Math.abs(a.rideVel) > 0.5 ? Math.abs(Math.sin(t * (4 + Math.abs(a.rideVel) * 0.5))) * 0.05 : 0);
        }
      }

      const legs = legRefs.current[i];
      const swingSpeed = isRidden ? 5 + Math.abs(a.rideVel) * 0.6 : 5;
      const swing = a.walking ? Math.sin(t * swingSpeed + a.id * 2) * 0.5 : 0;
      if (legs.fl) legs.fl.rotation.x = swing;
      if (legs.fr) legs.fr.rotation.x = -swing;
      if (legs.bl) legs.bl.rotation.x = -swing;
      if (legs.br) legs.br.rotation.x = swing;
    }
  });

  return (
    <>
      {animals.map((a, i) => (
        <group
          key={a.id}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
        >
          {a.kind === 'pig' && <Pig legs={legRefs.current[i]} />}
          {a.kind === 'chicken' && <Chicken legs={legRefs.current[i]} />}
          {a.kind === 'deer' && <Deer legs={legRefs.current[i]} />}
          {/* Rider (the local player), shown while mounted. Positioned so
              the hips sit on the saddle (the humanoid's origin is at the
              feet), and scaled down a touch on the chicken. */}
          <group
            ref={(el) => {
              riderRefs.current[i] = el;
            }}
            visible={false}
            position={[
              0,
              RIDE_SPECS[a.kind].saddleY - HUMANOID_HIP_Y * (a.kind === 'chicken' ? 0.8 : 1),
              a.kind === 'chicken' ? -0.05 : -0.1,
            ]}
            scale={a.kind === 'chicken' ? 0.8 : 1}
          >
            <Humanoid skin="#ffd9b3" shirt="#ff8800" pants="#3a5a8c" limbs={riderLimbsRef.current[i]} />
          </group>
        </group>
      ))}
    </>
  );
}

function Leg({ side, x, y, z, len, w, color, refCb }: {
  side: number; x: number; y: number; z: number; len: number; w: number; color: string;
  refCb: (el: THREE.Group | null) => void;
}) {
  return (
    <group position={[x * side, y, z]} ref={refCb}>
      <mesh position={[0, -len / 2, 0]} castShadow>
        <boxGeometry args={[w, len, w]} />
        <meshLambertMaterial color={color} />
      </mesh>
    </group>
  );
}

function Pig({ legs }: { legs: LegRefs }) {
  const pink = '#e8a2ad';
  const dark = '#c97f8b';
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.6, 0.5, 0.95]} />
        <meshLambertMaterial color={pink} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.6, 0.6]} castShadow>
        <boxGeometry args={[0.45, 0.4, 0.35]} />
        <meshLambertMaterial color={pink} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 0.52, 0.8]}>
        <boxGeometry args={[0.2, 0.14, 0.08]} />
        <meshLambertMaterial color={dark} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.12, 0.68, 0.78]}>
        <boxGeometry args={[0.06, 0.06, 0.02]} />
        <meshBasicMaterial color="#1c1c1c" />
      </mesh>
      <mesh position={[0.12, 0.68, 0.78]}>
        <boxGeometry args={[0.06, 0.06, 0.02]} />
        <meshBasicMaterial color="#1c1c1c" />
      </mesh>
      {/* Ears */}
      <mesh position={[-0.16, 0.84, 0.55]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.1, 0.12, 0.04]} />
        <meshLambertMaterial color={dark} />
      </mesh>
      <mesh position={[0.16, 0.84, 0.55]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.1, 0.12, 0.04]} />
        <meshLambertMaterial color={dark} />
      </mesh>
      <Leg side={-1} x={0.2} y={0.35} z={0.32} len={0.32} w={0.14} color={pink} refCb={(el) => { legs.fl = el; }} />
      <Leg side={1} x={0.2} y={0.35} z={0.32} len={0.32} w={0.14} color={pink} refCb={(el) => { legs.fr = el; }} />
      <Leg side={-1} x={0.2} y={0.35} z={-0.32} len={0.32} w={0.14} color={pink} refCb={(el) => { legs.bl = el; }} />
      <Leg side={1} x={0.2} y={0.35} z={-0.32} len={0.32} w={0.14} color={pink} refCb={(el) => { legs.br = el; }} />
    </group>
  );
}

function Chicken({ legs }: { legs: LegRefs }) {
  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.32, 0.34, 0.45]} />
        <meshLambertMaterial color="#f4f0e6" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.72, 0.22]} castShadow>
        <boxGeometry args={[0.2, 0.26, 0.2]} />
        <meshLambertMaterial color="#f4f0e6" />
      </mesh>
      {/* Comb */}
      <mesh position={[0, 0.9, 0.22]}>
        <boxGeometry args={[0.08, 0.1, 0.14]} />
        <meshLambertMaterial color="#d0342c" />
      </mesh>
      {/* Beak */}
      <mesh position={[0, 0.7, 0.35]}>
        <boxGeometry args={[0.08, 0.06, 0.1]} />
        <meshLambertMaterial color="#e8a33d" />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.07, 0.76, 0.31]}>
        <boxGeometry args={[0.04, 0.04, 0.02]} />
        <meshBasicMaterial color="#1c1c1c" />
      </mesh>
      <mesh position={[0.07, 0.76, 0.31]}>
        <boxGeometry args={[0.04, 0.04, 0.02]} />
        <meshBasicMaterial color="#1c1c1c" />
      </mesh>
      {/* Wings */}
      <mesh position={[-0.19, 0.45, 0]}>
        <boxGeometry args={[0.06, 0.2, 0.3]} />
        <meshLambertMaterial color="#e4dfd2" />
      </mesh>
      <mesh position={[0.19, 0.45, 0]}>
        <boxGeometry args={[0.06, 0.2, 0.3]} />
        <meshLambertMaterial color="#e4dfd2" />
      </mesh>
      <Leg side={-1} x={0.08} y={0.26} z={0} len={0.24} w={0.06} color="#e8a33d" refCb={(el) => { legs.fl = el; }} />
      <Leg side={1} x={0.08} y={0.26} z={0} len={0.24} w={0.06} color="#e8a33d" refCb={(el) => { legs.fr = el; }} />
    </group>
  );
}

function Deer({ legs }: { legs: LegRefs }) {
  const tan = '#a5713f';
  const antler = '#d8c49a';
  return (
    <group>
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 1.0]} />
        <meshLambertMaterial color={tan} />
      </mesh>
      {/* Neck + head */}
      <mesh position={[0, 1.2, 0.5]} castShadow>
        <boxGeometry args={[0.22, 0.5, 0.22]} />
        <meshLambertMaterial color={tan} />
      </mesh>
      <mesh position={[0, 1.5, 0.62]} castShadow>
        <boxGeometry args={[0.28, 0.24, 0.4]} />
        <meshLambertMaterial color={tan} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.1, 1.55, 0.8]}>
        <boxGeometry args={[0.05, 0.05, 0.02]} />
        <meshBasicMaterial color="#1c1c1c" />
      </mesh>
      <mesh position={[0.1, 1.55, 0.8]}>
        <boxGeometry args={[0.05, 0.05, 0.02]} />
        <meshBasicMaterial color="#1c1c1c" />
      </mesh>
      {/* Antlers */}
      <mesh position={[-0.12, 1.72, 0.55]}>
        <boxGeometry args={[0.05, 0.24, 0.05]} />
        <meshLambertMaterial color={antler} />
      </mesh>
      <mesh position={[0.12, 1.72, 0.55]}>
        <boxGeometry args={[0.05, 0.24, 0.05]} />
        <meshLambertMaterial color={antler} />
      </mesh>
      <mesh position={[-0.18, 1.8, 0.55]}>
        <boxGeometry args={[0.14, 0.05, 0.05]} />
        <meshLambertMaterial color={antler} />
      </mesh>
      <mesh position={[0.18, 1.8, 0.55]}>
        <boxGeometry args={[0.14, 0.05, 0.05]} />
        <meshLambertMaterial color={antler} />
      </mesh>
      {/* Tail patch */}
      <mesh position={[0, 0.95, -0.52]}>
        <boxGeometry args={[0.16, 0.16, 0.06]} />
        <meshLambertMaterial color="#f0e6d4" />
      </mesh>
      <Leg side={-1} x={0.18} y={0.6} z={0.35} len={0.55} w={0.1} color={tan} refCb={(el) => { legs.fl = el; }} />
      <Leg side={1} x={0.18} y={0.6} z={0.35} len={0.55} w={0.1} color={tan} refCb={(el) => { legs.fr = el; }} />
      <Leg side={-1} x={0.18} y={0.6} z={-0.35} len={0.55} w={0.1} color={tan} refCb={(el) => { legs.bl = el; }} />
      <Leg side={1} x={0.18} y={0.6} z={-0.35} len={0.55} w={0.1} color={tan} refCb={(el) => { legs.br = el; }} />
    </group>
  );
}

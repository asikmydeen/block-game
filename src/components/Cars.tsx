import { useRef, useEffect, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { WorldState } from '../game/useWorld';
import { CAR_SPECS, type CarKind, type CarInfo, drivingState, carsRegistry } from '../game/cars';
import { touchState } from './TouchControls';
import { powerState } from '../game/powers';
import { getLightColor, distanceToStopLine } from '../game/traffic';

enum Controls {
  forward = 'forward',
  back = 'back',
  left = 'left',
  right = 'right',
  jump = 'jump',
}

interface VillagerDriver {
  shirt: string;
  skin: string;
}

interface CarData {
  id: number;
  kind: CarKind;
  color: string;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  health: number;
  crashFlash: number;
  villagerDriver: VillagerDriver | null;
  axis: 'x' | 'z';
  patrolMin: number;
  patrolMax: number;
  aiPause: number;
}

const ENTER_RANGE = 5;
const REPAIR_RANGE = 5;
const REPAIR_AMOUNT = 4;

const CAR_SPAWNS: Array<{
  x: number;
  z: number;
  heading: number;
  kind: CarKind;
  color: string;
  axis: 'x' | 'z';
  villager?: VillagerDriver;
}> = [
  { x: 12, z: -2, heading: Math.PI, kind: 'sedan', color: '#c0392b', axis: 'x' },
  { x: -20, z: -2, heading: 0, kind: 'sports', color: '#2980d9', axis: 'x', villager: { shirt: '#8e44ad', skin: '#f5cba7' } },
  { x: 35, z: -2, heading: Math.PI, kind: 'truck', color: '#d68a2e', axis: 'x' },
  { x: -2, z: 15, heading: Math.PI / 2, kind: 'sedan', color: '#27ae60', axis: 'z', villager: { shirt: '#d35400', skin: '#a47148' } },
  { x: -2, z: -30, heading: -Math.PI / 2, kind: 'sports', color: '#f1c40f', axis: 'z' },
  { x: -2, z: 45, heading: Math.PI / 2, kind: 'truck', color: '#7f8c8d', axis: 'z' },
];

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
  return 13;
}

// Ray-march through blocks to find the first solid hit distance (for occlusion)
function firstBlockT(world: WorldState, origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number {
  const step = 0.4;
  const p = new THREE.Vector3();
  for (let t = step; t <= maxDist; t += step) {
    p.copy(origin).addScaledVector(dir, t);
    if (isSolid(world, p.x, p.y, p.z)) return t;
  }
  return Infinity;
}

function createCars(): CarData[] {
  return CAR_SPAWNS.map((s, i) => ({
    id: i,
    kind: s.kind,
    color: s.color,
    pos: new THREE.Vector3(s.x, 13, s.z),
    heading: s.heading,
    speed: 0,
    health: CAR_SPECS[s.kind].maxHealth,
    crashFlash: 0,
    villagerDriver: s.villager ?? null,
    axis: s.axis,
    patrolMin: -62,
    patrolMax: 62,
    aiPause: 0,
  }));
}

interface CarsProps {
  world: WorldState;
  playerPosRef: MutableRefObject<THREE.Vector3>;
  touchMode: boolean;
  onDrivingChange: (info: CarInfo | null) => void;
  onCrash: (damage: number, broken: boolean) => void;
  onNearCar: (kind: CarKind | null) => void;
}

export function Cars({ world, playerPosRef, touchMode, onDrivingChange, onCrash, onNearCar }: CarsProps) {
  const { camera } = useThree();
  const [, getControls] = useKeyboardControls<Controls>();
  const carsRef = useRef<CarData[] | null>(null);
  if (carsRef.current === null) carsRef.current = createCars();
  const cars = carsRef.current;

  const drivingIdRef = useRef<number | null>(null);
  const groupRefs = useRef<(THREE.Group | null)[]>(cars.map(() => null));
  const smokeRefs = useRef<(THREE.Group | null)[]>(cars.map(() => null));
  const wheelRefs = useRef<THREE.Mesh[][]>(cars.map(() => []));
  const nearTimerRef = useRef(0);
  const lastNearRef = useRef<CarKind | null>(null);

  // Keep latest world/callbacks in refs so the registry effect registers once
  // and stays live across re-renders (world identity changes every render).
  const worldRef = useRef(world);
  worldRef.current = world;
  const onDrivingChangeRef = useRef(onDrivingChange);
  onDrivingChangeRef.current = onDrivingChange;

  const emitInfo = (car: CarData | null) => {
    if (!car) {
      onDrivingChangeRef.current(null);
      return;
    }
    const spec = CAR_SPECS[car.kind];
    onDrivingChangeRef.current({
      kind: car.kind,
      health: car.health,
      maxHealth: spec.maxHealth,
      speed: Math.abs(car.speed),
      broken: car.health <= 0,
    });
  };

  const applyDamage = (car: CarData, damage: number) => {
    const wasBroken = car.health <= 0;
    if (drivingIdRef.current === car.id && powerState.carDamageTakenMult < 1) {
      damage = Math.max(1, Math.ceil(damage * powerState.carDamageTakenMult));
    }
    car.health = Math.max(0, car.health - damage);
    car.crashFlash = 0.3;
    if (drivingIdRef.current === car.id) emitInfo(car);
    return !wasBroken && car.health <= 0;
  };

  useEffect(() => {
    carsRegistry.toggleDrive = (playerPos: THREE.Vector3) => {
      if (drivingIdRef.current !== null) {
        const car = cars[drivingIdRef.current];
        car.speed = 0;
        const side = new THREE.Vector3(-Math.sin(car.heading), 0, Math.cos(car.heading));
        const candidates = [
          car.pos.clone().addScaledVector(side, 2),
          car.pos.clone().addScaledVector(side, -2),
          car.pos.clone().add(new THREE.Vector3(0, 0, 2)),
          car.pos.clone().add(new THREE.Vector3(2, 0, 0)),
        ];
        let exit = candidates[0];
        for (const c of candidates) {
          if (!isSolid(worldRef.current, c.x, c.y, c.z) && !isSolid(worldRef.current, c.x, c.y + 1, c.z)) {
            exit = c;
            break;
          }
        }
        exit.y = findGroundY(worldRef.current, exit.x, exit.z);
        playerPosRef.current.copy(exit);
        drivingIdRef.current = null;
        drivingState.active = false;
        drivingState.justExited = true;
        emitInfo(null);
        return 'exited';
      }
      let bestId: number | null = null;
      let bestOccupied = false;
      let bestDist = ENTER_RANGE;
      for (const car of cars) {
        const d = Math.hypot(playerPos.x - car.pos.x, playerPos.z - car.pos.z);
        if (d < bestDist && Math.abs(playerPos.y - car.pos.y) < 4) {
          bestDist = d;
          bestId = car.id;
          bestOccupied = car.villagerDriver !== null;
        }
      }
      if (bestId === null) return null;
      if (bestOccupied) return 'occupied';
      drivingIdRef.current = bestId;
      drivingState.active = true;
      emitInfo(cars[bestId]);
      return 'entered';
    };

    carsRegistry.repairNear = (playerPos: THREE.Vector3) => {
      let best: CarData | null = null;
      let bestDist = REPAIR_RANGE;
      for (const car of cars) {
        const spec = CAR_SPECS[car.kind];
        if (car.health >= spec.maxHealth) continue;
        const d = Math.hypot(playerPos.x - car.pos.x, playerPos.z - car.pos.z);
        if (d < bestDist) {
          bestDist = d;
          best = car;
        }
      }
      if (!best) return null;
      const spec = CAR_SPECS[best.kind];
      const wasBroken = best.health <= 0;
      best.health = powerState.fullRepair
        ? spec.maxHealth
        : Math.min(spec.maxHealth, best.health + REPAIR_AMOUNT);
      if (drivingIdRef.current === best.id) emitInfo(best);
      return { kind: best.kind, health: best.health, maxHealth: spec.maxHealth, wasBroken };
    };

    carsRegistry.hitCar = (origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, damage: number) => {
      // Nearest ray-sphere intersection against car bodies
      let bestT = Infinity;
      let bestCar: CarData | null = null;
      const center = new THREE.Vector3();
      const toCar = new THREE.Vector3();
      for (const car of cars) {
        if (drivingIdRef.current === car.id) continue; // don't shoot the car you're in
        center.set(car.pos.x, car.pos.y + 0.9, car.pos.z);
        toCar.copy(center).sub(origin);
        const tProj = toCar.dot(dir);
        if (tProj < 0 || tProj > maxDist) continue;
        const distSq = toCar.lengthSq() - tProj * tProj;
        const radius = 1.9;
        if (distSq > radius * radius) continue;
        const t = tProj - Math.sqrt(radius * radius - distSq);
        if (t < bestT) {
          bestT = t;
          bestCar = car;
        }
      }
      if (!bestCar || bestT === Infinity) return null;
      // Blocked by a wall?
      if (firstBlockT(worldRef.current, origin, dir, bestT) < bestT - 0.5) return null;
      const becameBroken = applyDamage(bestCar, damage);
      if (becameBroken && bestCar.villagerDriver) {
        bestCar.speed = 0;
      }
      return origin.clone().addScaledVector(dir, Math.max(0.1, bestT));
    };

    return () => {
      carsRegistry.toggleDrive = null;
      carsRegistry.repairNear = null;
      carsRegistry.hitCar = null;
    };
    // Register once; cleanup only on unmount. Latest world/callbacks come via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const drivingId = drivingIdRef.current;

    // "Press E to drive" proximity prompt (throttled)
    nearTimerRef.current -= dt;
    if (nearTimerRef.current <= 0) {
      nearTimerRef.current = 0.25;
      let near: CarKind | null = null;
      if (drivingId === null) {
        const p = playerPosRef.current;
        let bestDist = ENTER_RANGE;
        for (const car of cars) {
          if (car.villagerDriver) continue;
          const d = Math.hypot(p.x - car.pos.x, p.z - car.pos.z);
          if (d < bestDist && Math.abs(p.y - car.pos.y) < 4) {
            bestDist = d;
            near = car.kind;
          }
        }
      }
      if (near !== lastNearRef.current) {
        lastNearRef.current = near;
        onNearCar(near);
      }
    }

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const spec = CAR_SPECS[car.kind];
      const isDriven = drivingId === car.id;
      car.crashFlash = Math.max(0, car.crashFlash - dt);
      const broken = car.health <= 0;

      if (isDriven) {
        const controls = getControls();
        let throttle = 0;
        let steer = 0;
        if (touchMode) {
          throttle = Math.abs(touchState.moveY) > 0.1 ? touchState.moveY : 0;
          steer = Math.abs(touchState.moveX) > 0.1 ? touchState.moveX : 0;
        } else {
          if (controls.forward) throttle = 1;
          else if (controls.back) throttle = -0.6;
          if (controls.left) steer = -1;
          else if (controls.right) steer = 1;
        }
        if (broken) throttle = 0;

        const topSpeed = spec.maxSpeed * powerState.carSpeedMult;
        const handbrake = !touchMode && controls.jump && Math.abs(car.speed) > 0.5;

        if (handbrake) {
          // Handbrake: hard decel; combined with steering it slides the tail
          car.speed *= Math.max(0, 1 - 4.5 * dt);
          if (Math.abs(car.speed) < 0.05) car.speed = 0;
        } else if (throttle > 0) {
          if (car.speed < -0.3) {
            // Rolling backwards: forward throttle acts as brake first
            car.speed = Math.min(0, car.speed + spec.accel * 2.2 * dt);
          } else {
            // Engine force tapers as speed approaches the top — punchy launch,
            // gradual crawl to max, like a real gearbox
            const headroom = Math.max(0, 1 - car.speed / topSpeed);
            car.speed += throttle * spec.accel * (0.35 + 0.65 * headroom) * dt;
          }
        } else if (throttle < 0) {
          if (car.speed > 0.3) {
            // Moving forward: reverse input is the brake pedal
            car.speed = Math.max(0, car.speed + throttle * spec.accel * 2.2 * dt);
          } else {
            // Nearly stopped: engage reverse
            car.speed += throttle * spec.accel * 0.6 * dt;
          }
        } else {
          // Coasting: rolling resistance plus speed-proportional drag
          const drag = 1.2 + 0.08 * Math.abs(car.speed);
          car.speed *= Math.max(0, 1 - drag * dt);
          if (Math.abs(car.speed) < 0.05) car.speed = 0;
        }
        car.speed = Math.max(-topSpeed * 0.4, Math.min(topSpeed, car.speed));

        if (steer !== 0 && Math.abs(car.speed) > 0.4) {
          // Steering authority ramps in at low speed, then tightens at high
          // speed so the car doesn't twitch at full throttle
          const lowSpeedRamp = Math.min(1, Math.abs(car.speed) / 5);
          const highSpeedGrip = 1 - 0.45 * Math.min(1, Math.abs(car.speed) / topSpeed);
          const driftBoost = handbrake ? 1.8 : 1;
          car.heading += steer * spec.turnRate * lowSpeedRamp * highSpeedGrip * driftBoost * dt * Math.sign(car.speed);
        }

        moveCar(car, dt, true);

        playerPosRef.current.set(car.pos.x, car.pos.y, car.pos.z);

        const camDist = 7;
        const cx = car.pos.x - Math.cos(car.heading) * camDist;
        const cz = car.pos.z - Math.sin(car.heading) * camDist;
        const cy = car.pos.y + 4;
        camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 6));
        camera.lookAt(car.pos.x, car.pos.y + 1.2, car.pos.z);
      } else if (car.villagerDriver && !broken) {
        // Villager AI: cruise back and forth along the car's road
        car.aiPause = Math.max(0, car.aiPause - dt);
        if (car.aiPause <= 0) {
          const coord = car.axis === 'x' ? car.pos.x : car.pos.z;
          const movingPositive = car.axis === 'x' ? Math.cos(car.heading) > 0 : Math.sin(car.heading) > 0;

          // Obey the intersection traffic light: brake to a stop at the stop
          // line on red/yellow; once past the line, clear the intersection.
          const light = getLightColor(car.axis);
          const distToStop = distanceToStopLine(coord, movingPositive);
          const mustStop = light !== 'green' && distToStop > 0 && distToStop < 12;

          if (mustStop && distToStop < 1.0) {
            car.speed = 0;
          } else {
            if (mustStop) {
              // Brake, harder the closer the line gets
              car.speed = Math.max(0, car.speed - spec.accel * 1.6 * dt);
              // Never coast past the line at speed
              const maxApproach = Math.max(1.2, distToStop * 1.2);
              car.speed = Math.min(car.speed, maxApproach);
            } else {
              const targetSpeed = spec.maxSpeed * 0.45;
              car.speed = Math.min(targetSpeed, car.speed + spec.accel * 0.6 * dt);
            }

            // Turn around at patrol ends
            if ((coord > car.patrolMax && movingPositive) || (coord < car.patrolMin && !movingPositive)) {
              car.heading += Math.PI;
              car.speed = 0;
              car.aiPause = 0.8;
            } else if (car.speed > 0) {
              moveCar(car, dt, false);
            }
          }
        } else {
          car.speed = 0;
        }
      } else if (car.villagerDriver && broken) {
        car.speed = 0;
      }

      const g = groupRefs.current[i];
      if (g) {
        g.position.copy(car.pos);
        g.rotation.y = -car.heading + Math.PI / 2;
        if (car.crashFlash > 0) {
          g.position.y += Math.sin(car.crashFlash * 60) * 0.05;
        }
      }

      const wheels = wheelRefs.current[i];
      for (const w of wheels) {
        if (w) w.rotation.x += car.speed * dt * 2.5;
      }

      const smoke = smokeRefs.current[i];
      if (smoke) {
        const damagedRatio = car.health / spec.maxHealth;
        const showSmoke = damagedRatio <= 0.35;
        smoke.visible = showSmoke;
        if (showSmoke) {
          const t = performance.now() * 0.002 + i;
          smoke.children.forEach((puff, j) => {
            const cycle = (t * (0.6 + j * 0.2)) % 1;
            puff.position.y = 1.2 + cycle * 1.6;
            puff.scale.setScalar(0.5 + cycle * 0.8);
            const mat = (puff as THREE.Mesh).material as THREE.MeshBasicMaterial;
            mat.opacity = 0.5 * (1 - cycle);
          });
        }
      }
    }

    // Speed-sensitive field of view while driving for a sense of velocity
    const persp = camera as THREE.PerspectiveCamera;
    const drivenCar = drivingId !== null ? cars[drivingId] : null;
    const targetFov = drivenCar
      ? 75 + 14 * Math.min(1, Math.abs(drivenCar.speed) / CAR_SPECS[drivenCar.kind].maxSpeed)
      : 75;
    if (Math.abs(persp.fov - targetFov) > 0.05) {
      persp.fov += (targetFov - persp.fov) * Math.min(1, dt * 5);
      persp.updateProjectionMatrix();
    }
  });

  function moveCar(car: CarData, dt: number, isPlayer: boolean) {
    if (car.speed === 0) return;
    const dirX = Math.cos(car.heading);
    const dirZ = Math.sin(car.heading);
    const nx = car.pos.x + dirX * car.speed * dt;
    const nz = car.pos.z + dirZ * car.speed * dt;
    const probeDist = 1.5 * Math.sign(car.speed);
    const px = nx + dirX * probeDist;
    const pz = nz + dirZ * probeDist;
    const blocked =
      isSolid(world, px, car.pos.y + 0.3, pz) ||
      isSolid(world, px, car.pos.y + 1.2, pz);

    // Car-vs-car collision: don't drive through other cars
    let hitOther: CarData | null = null;
    for (const other of cars) {
      if (other.id === car.id) continue;
      const d = Math.hypot(px - other.pos.x, pz - other.pos.z);
      if (d < 2.7 && Math.abs(car.pos.y - other.pos.y) < 2) {
        hitOther = other;
        break;
      }
    }

    if (blocked || hitOther) {
      const impact = Math.abs(car.speed);
      if (impact > 4) {
        const damage = Math.max(1, Math.round((impact - 3) / 2));
        const becameBroken = applyDamage(car, damage);
        if (hitOther) applyDamage(hitOther, damage);
        if (isPlayer) onCrash(damage, car.health <= 0);
        if (becameBroken) car.speed = 0;
      }
      if (isPlayer) {
        car.speed = -car.speed * 0.25;
      } else {
        // AI turns around after bumping into something
        car.speed = 0;
        car.heading += Math.PI;
        car.aiPause = 1.2;
      }
    } else {
      const groundY = findGroundY(world, nx, nz);
      if (Math.abs(groundY - car.pos.y) <= 1.2) {
        car.pos.x = nx;
        car.pos.z = nz;
        car.pos.y += (groundY - car.pos.y) * Math.min(1, dt * 10);
      } else {
        car.speed *= 0.5;
        if (!isPlayer) {
          car.heading += Math.PI;
          car.aiPause = 1.0;
        }
      }
    }
  }

  return (
    <>
      {cars.map((car, i) => {
        const isTruck = car.kind === 'truck';
        const isSports = car.kind === 'sports';
        const bodyLen = isTruck ? 3.4 : isSports ? 2.8 : 3.0;
        const bodyH = isTruck ? 1.0 : isSports ? 0.55 : 0.7;
        const bodyW = isTruck ? 1.5 : 1.3;
        const seatY = isTruck ? 1.75 : 0.55 + bodyH + 0.15;
        const seatZ = isTruck ? bodyLen / 2 - 0.7 : isSports ? -0.3 : 0;
        return (
          <group
            key={car.id}
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
          >
            {/* Body */}
            <mesh position={[0, 0.55 + bodyH / 2, 0]} castShadow>
              <boxGeometry args={[bodyW, bodyH, bodyLen]} />
              <meshLambertMaterial color={car.color} />
            </mesh>
            {/* Cabin */}
            {isTruck ? (
              <mesh position={[0, 1.55 + 0.35, bodyLen / 2 - 0.7]} castShadow>
                <boxGeometry args={[bodyW - 0.1, 0.7, 1.2]} />
                <meshLambertMaterial color="#aeb6bf" transparent opacity={0.75} />
              </mesh>
            ) : (
              <mesh position={[0, 0.55 + bodyH + 0.3, isSports ? -0.3 : 0]} castShadow>
                <boxGeometry args={[bodyW - 0.2, 0.6, bodyLen * 0.5]} />
                <meshLambertMaterial color="#aed6f1" transparent opacity={0.65} />
              </mesh>
            )}
            {/* Villager driver */}
            {car.villagerDriver && (
              <group position={[0, seatY - 0.35, seatZ]}>
                <mesh castShadow>
                  <boxGeometry args={[0.45, 0.55, 0.28]} />
                  <meshLambertMaterial color={car.villagerDriver.shirt} />
                </mesh>
                <mesh position={[0, 0.5, 0]} castShadow>
                  <boxGeometry args={[0.38, 0.38, 0.38]} />
                  <meshLambertMaterial color={car.villagerDriver.skin} />
                </mesh>
                <mesh position={[-0.09, 0.54, 0.2]}>
                  <boxGeometry args={[0.05, 0.05, 0.02]} />
                  <meshBasicMaterial color="#111" />
                </mesh>
                <mesh position={[0.09, 0.54, 0.2]}>
                  <boxGeometry args={[0.05, 0.05, 0.02]} />
                  <meshBasicMaterial color="#111" />
                </mesh>
              </group>
            )}
            {/* Truck cargo bed */}
            {isTruck && (
              <mesh position={[0, 1.55 + 0.2, -bodyLen / 2 + 1.0]} castShadow>
                <boxGeometry args={[bodyW - 0.1, 0.4, 1.8]} />
                <meshLambertMaterial color="#6e6e6e" />
              </mesh>
            )}
            {/* Headlights */}
            <mesh position={[-0.4, 0.75, bodyLen / 2 + 0.01]}>
              <boxGeometry args={[0.2, 0.15, 0.05]} />
              <meshBasicMaterial color="#fff8c0" />
            </mesh>
            <mesh position={[0.4, 0.75, bodyLen / 2 + 0.01]}>
              <boxGeometry args={[0.2, 0.15, 0.05]} />
              <meshBasicMaterial color="#fff8c0" />
            </mesh>
            {/* Tail lights */}
            <mesh position={[-0.4, 0.75, -bodyLen / 2 - 0.01]}>
              <boxGeometry args={[0.18, 0.12, 0.05]} />
              <meshBasicMaterial color="#ff3b30" />
            </mesh>
            <mesh position={[0.4, 0.75, -bodyLen / 2 - 0.01]}>
              <boxGeometry args={[0.18, 0.12, 0.05]} />
              <meshBasicMaterial color="#ff3b30" />
            </mesh>
            {/* Grille */}
            <mesh position={[0, 0.72, bodyLen / 2 + 0.005]}>
              <boxGeometry args={[0.45, 0.16, 0.04]} />
              <meshLambertMaterial color="#22262b" />
            </mesh>
            {/* Bumpers */}
            <mesh position={[0, 0.5, bodyLen / 2 + 0.03]}>
              <boxGeometry args={[bodyW - 0.05, 0.14, 0.12]} />
              <meshLambertMaterial color="#3a3f45" />
            </mesh>
            <mesh position={[0, 0.5, -bodyLen / 2 - 0.03]}>
              <boxGeometry args={[bodyW - 0.05, 0.14, 0.12]} />
              <meshLambertMaterial color="#3a3f45" />
            </mesh>
            {/* License plates */}
            <mesh position={[0, 0.5, bodyLen / 2 + 0.1]}>
              <boxGeometry args={[0.32, 0.1, 0.02]} />
              <meshBasicMaterial color="#e8e8dc" />
            </mesh>
            <mesh position={[0, 0.5, -bodyLen / 2 - 0.1]}>
              <boxGeometry args={[0.32, 0.1, 0.02]} />
              <meshBasicMaterial color="#e8e8dc" />
            </mesh>
            {/* Side mirrors */}
            <mesh position={[-bodyW / 2 - 0.08, 0.55 + bodyH + 0.1, seatZ + (isTruck ? 0.5 : 0.7)]}>
              <boxGeometry args={[0.14, 0.1, 0.06]} />
              <meshLambertMaterial color="#22262b" />
            </mesh>
            <mesh position={[bodyW / 2 + 0.08, 0.55 + bodyH + 0.1, seatZ + (isTruck ? 0.5 : 0.7)]}>
              <boxGeometry args={[0.14, 0.1, 0.06]} />
              <meshLambertMaterial color="#22262b" />
            </mesh>
            {/* Exhaust */}
            <mesh position={[isSports ? -0.35 : -0.4, 0.38, -bodyLen / 2 - 0.08]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 0.16, 8]} />
              <meshLambertMaterial color="#565d66" />
            </mesh>
            {isSports && (
              <mesh position={[0.35, 0.38, -bodyLen / 2 - 0.08]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.16, 8]} />
                <meshLambertMaterial color="#565d66" />
              </mesh>
            )}
            {/* Sports spoiler */}
            {isSports && (
              <group position={[0, 0.55 + bodyH + 0.25, -bodyLen / 2 + 0.25]}>
                <mesh>
                  <boxGeometry args={[bodyW - 0.15, 0.06, 0.35]} />
                  <meshLambertMaterial color="#22262b" />
                </mesh>
                <mesh position={[-0.4, -0.12, 0]}>
                  <boxGeometry args={[0.06, 0.2, 0.1]} />
                  <meshLambertMaterial color="#22262b" />
                </mesh>
                <mesh position={[0.4, -0.12, 0]}>
                  <boxGeometry args={[0.06, 0.2, 0.1]} />
                  <meshLambertMaterial color="#22262b" />
                </mesh>
              </group>
            )}
            {/* Wheels */}
            {[
              [-bodyW / 2 - 0.05, bodyLen / 2 - 0.6],
              [bodyW / 2 + 0.05, bodyLen / 2 - 0.6],
              [-bodyW / 2 - 0.05, -bodyLen / 2 + 0.6],
              [bodyW / 2 + 0.05, -bodyLen / 2 + 0.6],
            ].map(([wx, wz], wi) => (
              <mesh
                key={wi}
                position={[wx, 0.35, wz]}
                rotation={[0, 0, Math.PI / 2]}
                ref={(el) => {
                  if (el) wheelRefs.current[i][wi] = el;
                }}
                castShadow
              >
                <cylinderGeometry args={[0.35, 0.35, 0.25, 10]} />
                <meshLambertMaterial color="#1c1c1c" />
              </mesh>
            ))}
            {/* Smoke puffs (broken) */}
            <group
              ref={(el) => {
                smokeRefs.current[i] = el;
              }}
              position={[0, 0, bodyLen / 2 - 0.5]}
              visible={false}
            >
              {[0, 1, 2].map(j => (
                <mesh key={j} position={[(j - 1) * 0.15, 1.2, 0]}>
                  <boxGeometry args={[0.4, 0.4, 0.4]} />
                  <meshBasicMaterial color="#444" transparent opacity={0.5} depthWrite={false} />
                </mesh>
              ))}
            </group>
          </group>
        );
      })}
    </>
  );
}

import { useRef, useEffect, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WorldState } from '../game/useWorld';
import { powerState } from '../game/powers';
import { combatRegistry } from '../game/combat';
import { Humanoid, createLimbs, type HumanoidLimbs } from './Humanoid';
import { LAMP_LIGHT_SPOTS, LAMP_SAFE_RADIUS } from './StreetLamps';
import type { ZombieWave } from '../game/missions';

interface ZombieData {
  id: number;
  pos: THREE.Vector3;
  dir: number;
  walkTimer: number;
  attackCooldown: number;
  walking: boolean;
  speed: number;
  attacking: boolean;
  health: number;
  dead: boolean;
  respawnTimer: number;
  hitTimer: number;
}

const FLOOR_TOP_Y = 12;
// Zombies emerge from the forest ring surrounding the city (radius ~74-102,
// see decorations.ts), so their density rises as you approach the treeline.
// A few stragglers still roam the inner city.
const FOREST_SPAWN_R = 80;
const SPAWN_POINTS: Array<[number, number]> = [
  // Forest ring spawns (angles chosen to avoid the two road corridors)
  ...Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2 + 0.35;
    return [
      Math.round(Math.cos(angle) * FOREST_SPAWN_R),
      Math.round(Math.sin(angle) * FOREST_SPAWN_R),
    ] as [number, number];
  }),
  // Inner-city stragglers
  [40, 40],
  [-35, -35],
  [50, 0],
  [10, -55],
];

const DETECTION_RANGE = 22;
const ATTACK_RANGE = 1.6;
const ATTACK_COOLDOWN = 1.0;
const ATTACK_DAMAGE = 1;

function findGroundY(world: WorldState, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  for (let y = 30; y >= 0; y--) {
    const b = world.getBlock(ix, y, iz);
    if (b && b !== 'air' && b !== 'water') return y + 1;
  }
  return FLOOR_TOP_Y + 1;
}

function isSolid(world: WorldState, x: number, y: number, z: number): boolean {
  const b = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  return !!b && b !== 'air' && b !== 'water';
}

function createZombies(): ZombieData[] {
  return SPAWN_POINTS.map((p, i) => ({
    id: i,
    pos: new THREE.Vector3(p[0], FLOOR_TOP_Y + 1, p[1]),
    dir: Math.random() * Math.PI * 2,
    walkTimer: 1 + Math.random() * 2,
    attackCooldown: 0,
    walking: true,
    speed: 1.4 + Math.random() * 0.8,
    attacking: false,
    health: 5,
    dead: false,
    respawnTimer: 0,
    hitTimer: 0,
  }));
}

interface ZombiesProps {
  world: WorldState;
  playerPosRef: MutableRefObject<THREE.Vector3>;
  onDamagePlayer: (amount: number) => void;
  alive: boolean;
  night: boolean;
  wave?: ZombieWave | null;
}

export function Zombies({ world, playerPosRef, onDamagePlayer, alive, night, wave }: ZombiesProps) {
  const dataRef = useRef<ZombieData[] | null>(null);
  if (dataRef.current === null) {
    dataRef.current = createZombies();
  }
  const zombies = dataRef.current;
  const waveRef = useRef(wave);
  waveRef.current = wave;

  const groupRefs = useRef<(THREE.Group | null)[]>(zombies.map(() => null));
  const limbRefs = useRef<HumanoidLimbs[]>(zombies.map(() => createLimbs()));

  useEffect(() => {
    const firstBlockT = (origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number => {
      const step = 0.2;
      const p = new THREE.Vector3();
      for (let t = step; t <= maxDist; t += step) {
        p.copy(origin).addScaledVector(dir, t);
        if (isSolid(world, p.x, p.y, p.z)) return t;
      }
      return Infinity;
    };

    combatRegistry.hitZombies = (origin, dir, maxDist, damage) => {
      const look = dir.clone();
      if (look.lengthSq() < 1e-6) return null;
      look.normalize();
      const melee = maxDist <= 6;
      const fatRadius = melee ? 1.85 : 1.35;
      const minCos = melee ? 0.12 : 0.55; // melee ~83° cone, guns ~57°
      let best: { z: ZombieData; dist: number } | null = null;

      for (const z of zombies) {
        if (z.dead) continue;
        const center = new THREE.Vector3(z.pos.x, z.pos.y + 1.0, z.pos.z);
        const toC = center.clone().sub(origin);
        const dist = toC.length();
        if (dist > maxDist + 0.7) continue;
        const forward = toC.dot(look);
        if (forward < -0.35) continue; // behind the player
        const closest = origin.clone().addScaledVector(look, THREE.MathUtils.clamp(forward, 0, maxDist));
        const offRay = closest.distanceTo(center);
        const cos = dist > 0.001 ? forward / dist : 1;
        const veryClose = melee && dist <= Math.min(2.7, maxDist + 0.4);
        if (offRay > fatRadius && cos < minCos && !veryClose) continue;

        const toward = dist > 0.001 ? toC.clone().multiplyScalar(1 / dist) : look;
        if (!veryClose && firstBlockT(origin, toward, dist) < dist - 0.45) continue;

        if (!best || dist < best.dist) best = { z, dist };
      }
      if (!best) return null;
      const z = best.z;
      z.health -= damage;
      z.hitTimer = 0.28;
      const knock = look.clone();
      knock.y = 0;
      if (knock.lengthSq() > 0.01) knock.normalize();
      const kx = z.pos.x + knock.x * 0.7;
      const kz = z.pos.z + knock.z * 0.7;
      if (!isSolid(world, kx, z.pos.y, kz) && !isSolid(world, kx, z.pos.y + 1, kz)) {
        z.pos.x = kx;
        z.pos.z = kz;
      }
      if (z.health <= 0) {
        z.dead = true;
        z.respawnTimer = waveRef.current?.respawn ?? 8;
        combatRegistry.onZombieKilled?.(new THREE.Vector3(z.pos.x, z.pos.y, z.pos.z));
      }
      return new THREE.Vector3(z.pos.x, z.pos.y + 1.0, z.pos.z);
    };
    return () => {
      combatRegistry.hitZombies = null;
    };
  }, [zombies, world]);

  useFrame((_, delta) => {
    if (!playerPosRef?.current) return;
    const dt = Math.min(delta, 0.1);
    const t = performance.now() * 0.005;
    const player = playerPosRef.current;

    // At night, standing in a street lamp's pool of light keeps zombies at
    // bay: they lose interest, and nearby ones back away instead of biting.
    let playerInLight = false;
    if (night) {
      for (const s of LAMP_LIGHT_SPOTS) {
        const lx = player.x - s.x;
        const lz = player.z - s.z;
        if (lx * lx + lz * lz < LAMP_SAFE_RADIUS * LAMP_SAFE_RADIUS) {
          playerInLight = true;
          break;
        }
      }
    }

    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      const g0 = groupRefs.current[i];

      if (z.dead) {
        const respawnAt = waveRef.current?.respawn ?? 8;
        // Scale the fall-over window against the configured respawn.
        const fallFor = Math.min(1, respawnAt * 0.12);
        z.respawnTimer -= dt;
        if (g0) {
          // fall over then hide
          if (z.respawnTimer > respawnAt - fallFor) {
            g0.visible = true;
            g0.rotation.z = Math.min(Math.PI / 2, (respawnAt - z.respawnTimer) * 5);
          } else {
            g0.visible = false;
          }
        }
        if (z.respawnTimer <= 0) {
          const sp = SPAWN_POINTS[z.id % SPAWN_POINTS.length];
          z.pos.set(sp[0], FLOOR_TOP_Y + 1, sp[1]);
          z.health = waveRef.current?.health ?? 5;
          z.dead = false;
          z.hitTimer = 0;
          z.attackCooldown = 1;
        }
        continue;
      }
      if (g0 && !g0.visible) g0.visible = true;
      z.hitTimer = Math.max(0, z.hitTimer - dt);

      const dx = player.x - z.pos.x;
      const dz = player.z - z.pos.z;
      const distToPlayer = Math.hypot(dx, dz);

      const seesPlayer = alive && !playerInLight && distToPlayer < DETECTION_RANGE * powerState.zombieDetectMult;

      if (playerInLight && distToPlayer < 9) {
        // Recoil from the lamplight: turn away from the player and shuffle off
        z.dir = Math.atan2(-dz, -dx) + (Math.random() - 0.5) * 0.4;
        z.walking = true;
        z.walkTimer = Math.max(z.walkTimer, 0.8);
      } else if (seesPlayer) {
        z.dir = Math.atan2(dz, dx);
        z.walking = distToPlayer > ATTACK_RANGE;
      } else {
        z.walkTimer -= dt;
        if (z.walkTimer <= 0) {
          // Drift back toward the spawn point when it wanders too far, so
          // forest zombies keep haunting the treeline instead of dispersing.
          const sp = SPAWN_POINTS[z.id % SPAWN_POINTS.length];
          const distFromHome = Math.hypot(z.pos.x - sp[0], z.pos.z - sp[1]);
          if (distFromHome > 20) {
            z.dir = Math.atan2(sp[1] - z.pos.z, sp[0] - z.pos.x) + (Math.random() - 0.5) * 0.6;
          } else {
            z.dir += (Math.random() - 0.5) * Math.PI;
          }
          z.walkTimer = 2 + Math.random() * 3;
          z.walking = Math.random() > 0.3;
        }
      }

      if (z.walking) {
        const speed =
          (seesPlayer ? z.speed * 1.4 : z.speed * 0.8) *
          powerState.zombieSpeedMult *
          (waveRef.current?.speedMult ?? 1);
        const nx = z.pos.x + Math.cos(z.dir) * speed * dt;
        const nz = z.pos.z + Math.sin(z.dir) * speed * dt;
        const blocked =
          isSolid(world, nx, z.pos.y, nz) || isSolid(world, nx, z.pos.y + 0.5, nz);
        if (!blocked) {
          z.pos.x = nx;
          z.pos.z = nz;
        } else if (!seesPlayer) {
          z.dir += Math.PI / 2 + (Math.random() - 0.5) * 0.5;
        } else {
          z.dir += (Math.random() - 0.5) * 0.6;
        }
      }

      z.pos.y = findGroundY(world, z.pos.x, z.pos.z);

      z.attackCooldown -= dt;
      const verticalDelta = Math.abs(player.y - z.pos.y);
      z.attacking = false;
      if (
        seesPlayer &&
        distToPlayer < ATTACK_RANGE &&
        verticalDelta < 2.5 &&
        z.attackCooldown <= 0
      ) {
        onDamagePlayer(ATTACK_DAMAGE);
        z.attackCooldown = ATTACK_COOLDOWN;
        z.attacking = true;
      }

      const g = groupRefs.current[i];
      if (g) {
        g.position.set(z.pos.x, z.pos.y, z.pos.z);
        g.rotation.y = -z.dir + Math.PI / 2;
        g.rotation.z = z.hitTimer > 0 ? 0.25 : 0;
      }

      const limbs = limbRefs.current[i];
      const swing = z.walking ? Math.sin(t * 5 + z.id) * 0.7 : 0;
      const armForward = -Math.PI / 2.2;
      const attackPunch = z.attackCooldown > ATTACK_COOLDOWN - 0.25 ? 0.4 : 0;
      if (limbs.leftArm) limbs.leftArm.rotation.x = armForward + swing * 0.3 - attackPunch;
      if (limbs.rightArm) limbs.rightArm.rotation.x = armForward - swing * 0.3 - attackPunch;
      if (limbs.leftLeg) limbs.leftLeg.rotation.x = -swing;
      if (limbs.rightLeg) limbs.rightLeg.rotation.x = swing;
    }
  });

  const skin = '#6e8a3a';
  const skinDark = '#516b25';
  const shirt = '#4a4226';
  const pants = '#2c2418';

  return (
    <>
      {zombies.map((z, i) => (
        <group
          key={z.id}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
        >
          <Humanoid
            skin={skin}
            shirt={shirt}
            pants={pants}
            arms={skinDark}
            variant="zombie"
            limbs={limbRefs.current[i]}
          />
        </group>
      ))}
    </>
  );
}

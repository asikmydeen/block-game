import * as THREE from 'three';

export type WeaponType = 'hand' | 'sword' | 'axe' | 'katana' | 'blaster' | 'shotgun' | 'rifle';

export interface WeaponSpec {
  id: WeaponType;
  name: string;
  damage: number;
  range: number;
  // Attacks per second (used for the auto rifle and to pace melee swings)
  attackRate: number;
  ranged: boolean;
  // Hold left click to keep firing
  auto: boolean;
  // Shop price in points; 0 = owned from the start
  cost: number;
  desc: string;
}

export const WEAPONS: WeaponSpec[] = [
  { id: 'hand', name: 'Hand', damage: 1, range: 3, attackRate: 3, ranged: false, auto: false, cost: 0, desc: 'Trusty fists' },
  { id: 'sword', name: 'Sword', damage: 3, range: 3.5, attackRate: 2.5, ranged: false, auto: false, cost: 0, desc: 'Balanced blade' },
  { id: 'axe', name: 'Battle Axe', damage: 6, range: 3.5, attackRate: 1.2, ranged: false, auto: false, cost: 150, desc: 'Slow but savage' },
  { id: 'katana', name: 'Katana', damage: 4, range: 4, attackRate: 3.5, ranged: false, auto: false, cost: 300, desc: 'Lightning-fast slashes' },
  { id: 'blaster', name: 'Blaster', damage: 2, range: 50, attackRate: 2.5, ranged: true, auto: false, cost: 0, desc: 'Standard sidearm' },
  { id: 'shotgun', name: 'Shotgun', damage: 7, range: 14, attackRate: 1, ranged: true, auto: false, cost: 250, desc: 'Devastating up close' },
  { id: 'rifle', name: 'Auto Rifle', damage: 2, range: 60, attackRate: 7, ranged: true, auto: true, cost: 400, desc: 'Hold to spray' },
];

// Points awarded per zombie kill; spent in the weapon shop.
export const KILL_POINTS = 10;

export function getWeapon(id: WeaponType): WeaponSpec {
  return WEAPONS.find(w => w.id === id) ?? WEAPONS[0];
}

// The Zombies component registers a hit-test/damage function here so the
// Player can attack without prop-drilling through the scene graph.
export type ZombieHitFn = (
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number,
  damage: number
) => THREE.Vector3 | null;

export const combatRegistry: {
  hitZombies: ZombieHitFn | null;
  // Game registers this to react to zombie kills (score points).
  onZombieKilled: ((pos: THREE.Vector3) => void) | null;
} = {
  hitZombies: null,
  onZombieKilled: null,
};

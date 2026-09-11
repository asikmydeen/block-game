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

// ── Shared primary-fire cadence controller ─────────────────────────────────
//
// Both touch (held ATK button) and desktop (held left mouse / configured key)
// dispatch the SAME named "primary" command through one controller so weapon
// timing cannot diverge by input device (Requirement 7.13, 9.11). It is a pure
// state machine driven by an injected clock: `step(nowMs, held)` returns how
// many shots should fire on that frame.
//
//  - Rising edge (not held -> held) always fires one shot if the cooldown is
//    clear, for every weapon.
//  - Automatic weapons (`auto: true`) keep firing at `attackRate` shots/second
//    while held.
//  - Semi-auto weapons fire once per press and require a release before the
//    next shot.
//  - Any terminal — release, cancel, background, typing gate, or a closed input
//    gate — stops fire immediately even while the button is logically held, and
//    re-arms the rising edge so the next genuine press after the terminal fires
//    again.

export interface PrimaryFireController {
  setWeapon(w: WeaponSpec): void;
  step(nowMs: number, held: boolean): number;
  cancel(): void;
  setBackgrounded(bg: boolean): void;
  setTyping(typing: boolean): void;
  setInputOpen(open: boolean): void;
}

export function createPrimaryFireController(): PrimaryFireController {
  let weapon: WeaponSpec = WEAPONS[0];
  let wasHeld = false;
  let lastShot = -Infinity;
  let backgrounded = false;
  let typing = false;
  let inputOpen = true;
  let cancelled = false;

  function blocked(): boolean {
    return backgrounded || typing || !inputOpen || cancelled;
  }

  return {
    setWeapon(w) {
      weapon = w;
    },
    step(nowMs, held) {
      if (!held) {
        // Physical release clears a latched cancel and re-arms the edge.
        wasHeld = false;
        cancelled = false;
        return 0;
      }
      // A terminal condition forces neutral: no fire while it holds, and the
      // next press after it clears is a fresh rising edge.
      if (blocked()) {
        wasHeld = false;
        return 0;
      }
      const interval = 1000 / weapon.attackRate;
      const rising = !wasHeld;
      wasHeld = true;
      if (rising) {
        // Fire on the edge if the cooldown from the previous shot has elapsed.
        if (nowMs - lastShot >= interval) {
          lastShot = nowMs;
          return 1;
        }
        return 0;
      }
      // Held: only automatic weapons repeat, and only at cadence.
      if (weapon.auto && nowMs - lastShot >= interval) {
        lastShot = nowMs;
        return 1;
      }
      return 0;
    },
    cancel() {
      wasHeld = false;
      cancelled = true;
    },
    setBackgrounded(bg) {
      backgrounded = bg;
      if (bg) wasHeld = false;
    },
    setTyping(t) {
      typing = t;
      if (t) wasHeld = false;
    },
    setInputOpen(open) {
      inputOpen = open;
      if (!open) wasHeld = false;
    },
  };
}

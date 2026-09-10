// Campaign missions in the existing city. Sequential unlock; rewards are shop points.

export type MissionId =
  | 'park'
  | 'firstblood'
  | 'scavenger'
  | 'wheels'
  | 'nightwatch'
  | 'streets'
  | 'rooftop'
  | 'laststand';

export type MissionKind = 'goto' | 'kills' | 'chests' | 'drive' | 'survive' | 'wave';

export interface ZombieWave {
  health: number;
  speedMult: number;
  respawn: number;
}

export interface MissionTarget {
  x: number;
  y?: number;
  z: number;
  r: number;
  label: string;
}

export interface MissionDef {
  id: MissionId;
  title: string;
  blurb: string;
  hint: string;
  reward: number;
  kind: MissionKind;
  count?: number;
  duration?: number;
  night?: boolean;
  target?: MissionTarget;
  wave?: ZombieWave;
}

export const MISSIONS: MissionDef[] = [
  {
    id: 'park',
    title: 'Town Park',
    blurb: 'Find the pond in the town park.',
    hint: 'Head toward the trees and water just east of spawn.',
    reward: 20,
    kind: 'goto',
    target: { x: 14, z: 14, r: 6, label: 'Park' },
  },
  {
    id: 'firstblood',
    title: 'First Blood',
    blurb: 'Hunt 5 zombies around the city.',
    hint: 'They wander the forest ring. Follow the waypoint into the trees.',
    reward: 40,
    kind: 'kills',
    count: 5,
    target: { x: 50, z: 0, r: 18, label: 'Forest' },
  },
  {
    id: 'scavenger',
    title: 'Scavenger',
    blurb: 'Loot a chest inside a house.',
    hint: 'The cottage east of spawn has a chest against the wall. Look at it and interact.',
    reward: 30,
    kind: 'chests',
    count: 1,
    target: { x: 22, z: 6, r: 8, label: 'Cottage' },
  },
  {
    id: 'wheels',
    title: 'Wheels',
    blurb: 'Drive a car to the east skyscraper.',
    hint: 'Hop in a parked car (E / DRIVE) and follow the road toward the tall tower.',
    reward: 50,
    kind: 'drive',
    target: { x: 55, z: 10, r: 10, label: 'East Tower' },
  },
  {
    id: 'nightwatch',
    title: 'Night Watch',
    blurb: 'Survive 45 seconds after dark.',
    hint: 'Street lamps keep zombies back. Stay in the light if you get swarmed.',
    reward: 60,
    kind: 'survive',
    duration: 45,
    night: true,
  },
  {
    id: 'streets',
    title: 'Clear the Streets',
    blurb: 'Kill 12 zombies during the night.',
    hint: 'Night is locked on. Push out from the lamps and hunt.',
    reward: 80,
    kind: 'kills',
    count: 12,
    night: true,
    wave: { health: 5, speedMult: 1.15, respawn: 4 },
  },
  {
    id: 'rooftop',
    title: 'High Rise',
    blurb: 'Reach the apartment rooftop on the north-west block.',
    hint: 'Find the apartment at the treeline and climb the stairwell to the roof.',
    reward: 70,
    kind: 'goto',
    target: { x: -40, y: 24, z: 40, r: 10, label: 'Rooftop' },
  },
  {
    id: 'laststand',
    title: 'Last Stand',
    blurb: 'Hold the city for 60 seconds through a night wave.',
    hint: 'Faster, tougher zombies. Keep moving. Lamps still help.',
    reward: 120,
    kind: 'survive',
    duration: 60,
    night: true,
    wave: { health: 8, speedMult: 1.35, respawn: 3 },
  },
];

export const MISSION_ORDER: MissionId[] = MISSIONS.map((m) => m.id);

const MISSION_IDS = new Set<string>(MISSION_ORDER);

export function isMissionId(id: string): id is MissionId {
  return MISSION_IDS.has(id);
}

export function getMission(id: MissionId): MissionDef {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

export function isUnlocked(id: MissionId, completed: ReadonlySet<string>): boolean {
  const i = MISSION_ORDER.indexOf(id);
  if (i <= 0) return true;
  return completed.has(MISSION_ORDER[i - 1]);
}

export function nextMission(completed: ReadonlySet<string>): MissionId | null {
  return MISSION_ORDER.find((id) => !completed.has(id)) ?? null;
}

const LS_PREFIX = 'blockgame.missions.';

export function loadLocalMissions(accountId: string): MissionId[] {
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + accountId);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(isMissionId) : [];
  } catch {
    return [];
  }
}

export function saveLocalMissions(accountId: string, ids: Iterable<string>) {
  try {
    window.localStorage.setItem(
      LS_PREFIX + accountId,
      JSON.stringify([...ids].filter(isMissionId))
    );
  } catch {
    /* private mode */
  }
}

export function mergeMissions(...lists: Array<Iterable<string> | undefined | null>): Set<MissionId> {
  const s = new Set<MissionId>();
  for (const list of lists) {
    if (!list) continue;
    for (const id of list) if (isMissionId(id)) s.add(id);
  }
  return s;
}

export function raidZombieWave(wave: number): ZombieWave {
  if (wave >= 3) return { health: 9, speedMult: 1.35, respawn: 2 };
  if (wave >= 2) return { health: 7, speedMult: 1.2, respawn: 3 };
  return { health: 5, speedMult: 1.1, respawn: 4 };
}

export const RAID_BONUS = [0, 40, 70, 120];

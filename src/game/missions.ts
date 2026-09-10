// Timed levels in the existing city. Free play is roam-only.
// Solo: sequential unlock. Multiplayer: race the same clock.

export type MissionId =
  | 'l01' | 'l02' | 'l03' | 'l04' | 'l05'
  | 'l06' | 'l07' | 'l08' | 'l09' | 'l10'
  | 'l11' | 'l12' | 'l13' | 'l14' | 'l15'
  | 'l16' | 'l17' | 'l18' | 'l19' | 'l20'
  | 'l21' | 'l22' | 'l23' | 'l24' | 'l25';

export type MissionKind = 'goto' | 'kills' | 'chests' | 'drive' | 'survive';

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
  n: number;
  title: string;
  blurb: string;
  hint: string;
  reward: number;
  kind: MissionKind;
  timeLimit: number;
  count?: number;
  night?: boolean;
  target?: MissionTarget;
  wave?: ZombieWave;
}

const PARK = { x: 14, z: 14, r: 6, label: 'Park' };
const FOREST = { x: 50, z: 0, r: 18, label: 'Forest' };
const COTTAGE = { x: 22, z: 6, r: 8, label: 'Cottage' };
const CABIN = { x: -12, z: 18, r: 8, label: 'Cabin' };
const MODERN = { x: 8, z: -18, r: 8, label: 'Modern house' };
const EAST = { x: 55, z: 10, r: 10, label: 'East tower' };
const WEST = { x: -55, z: -10, r: 10, label: 'West tower' };
const SPIRE = { x: 28, z: -22, r: 8, label: 'Spire' };
const NORTH_APT = { x: -40, y: 24, z: 40, r: 10, label: 'Rooftop' };
const SOUTH_APT = { x: 40, z: -40, r: 10, label: 'South block' };

const mild: ZombieWave = { health: 5, speedMult: 1.12, respawn: 4 };
const hard: ZombieWave = { health: 7, speedMult: 1.25, respawn: 3 };
const brutal: ZombieWave = { health: 9, speedMult: 1.4, respawn: 2 };

function L(
  n: number,
  title: string,
  blurb: string,
  hint: string,
  kind: MissionKind,
  timeLimit: number,
  extra: Partial<MissionDef> = {}
): MissionDef {
  const id = `l${String(n).padStart(2, '0')}` as MissionId;
  return {
    id,
    n,
    title,
    blurb,
    hint,
    kind,
    timeLimit,
    reward: 12 + n * 6,
    ...extra,
  };
}

export const MISSIONS: MissionDef[] = [
  L(1, 'Park', 'Reach the town park pond.', 'Head east of spawn toward the trees and water.', 'goto', 60, { target: PARK }),
  L(2, 'First Blood', 'Kill 3 zombies.', 'They haunt the forest ring. Follow the waypoint.', 'kills', 75, { count: 3, target: FOREST }),
  L(3, 'Cottage Stash', 'Loot a chest in the cottage.', 'Cottage east of spawn. Look at the chest and interact.', 'chests', 90, { count: 1, target: COTTAGE }),
  L(4, 'East Walk', 'Reach the east skyscraper.', 'Follow the road east to the tall tower.', 'goto', 80, { target: EAST }),
  L(5, 'Hunter', 'Kill 8 zombies.', 'Push out to the treeline and hunt.', 'kills', 90, { count: 8, target: FOREST }),
  L(6, 'Joyride', 'Drive a car to the east tower.', 'Hop in a parked car and take the east road.', 'drive', 80, { target: EAST }),
  L(7, 'Cabin Call', 'Reach the north cabin.', 'Northwest of spawn, among the trees.', 'goto', 70, { target: CABIN }),
  L(8, 'Night Watch', 'Stay alive until dawn.', 'Lamps keep zombies back. Do not die.', 'survive', 40, { night: true }),
  L(9, 'Two Chests', 'Loot 2 chests.', 'Houses around town all have chests inside.', 'chests', 100, { count: 2, target: COTTAGE }),
  L(10, 'Treeline', 'Kill 12 zombies.', 'Harder respawns at the forest edge.', 'kills', 90, { count: 12, target: FOREST, wave: mild }),
  L(11, 'High Rise', 'Reach the north apartment roof.', 'Climb the stairwell. Ground floor does not count.', 'goto', 110, { target: NORTH_APT }),
  L(12, 'Night Streets', 'Kill 10 zombies at night.', 'Night is locked. Hunt under the lamps.', 'kills', 90, { count: 10, night: true, wave: mild }),
  L(13, 'West Tower', 'Reach the west skyscraper.', 'Take the west road out of town.', 'goto', 90, { target: WEST }),
  L(14, 'Cross Town', 'Drive to the west tower.', 'Steal a car and cut across the city.', 'drive', 85, { target: WEST }),
  L(15, 'Blackout', 'Survive the night.', 'Tougher zombies. Keep moving.', 'survive', 50, { night: true, wave: hard }),
  L(16, 'Modern Haul', 'Loot a chest in the modern house.', 'South of spawn, glass and concrete.', 'chests', 80, { count: 1, target: MODERN }),
  L(17, 'Culling', 'Kill 15 zombies.', 'Clear a path through the forest ring.', 'kills', 100, { count: 15, target: FOREST, wave: hard }),
  L(18, 'South Block', 'Reach the south apartment.', 'Southeast treeline, the long housing block.', 'goto', 90, { target: SOUTH_APT }),
  L(19, 'Park Circuit', 'Drive back to the park.', 'Find a car and return to the pond.', 'drive', 70, { target: PARK }),
  L(20, 'Midnight Hunt', 'Kill 18 zombies at night.', 'Fast respawns. Do not get surrounded.', 'kills', 110, { count: 18, night: true, wave: hard }),
  L(21, 'The Spire', 'Reach the south tower.', 'The tall house south-east of spawn.', 'goto', 100, { target: SPIRE }),
  L(22, 'Treasure Run', 'Loot 3 chests.', 'Hit three different houses before time runs out.', 'chests', 120, { count: 3, target: COTTAGE }),
  L(23, 'Hold Fast', 'Survive a hard night.', 'Brutal wave. Lamps still help.', 'survive', 60, { night: true, wave: brutal }),
  L(24, 'Onslaught', 'Kill 25 zombies.', 'Keep the pressure on. They come back fast.', 'kills', 120, { count: 25, target: FOREST, wave: brutal }),
  L(25, 'Last Light', 'Kill 30 zombies before the clock hits zero.', 'Final hunt. Night, brutal wave, no mercy.', 'kills', 90, { count: 30, night: true, wave: brutal, target: FOREST }),
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

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
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

/** Seconds per level — keep in sync with MISSIONS (used by the MP server copy). */
export const LEVEL_TIME: Record<MissionId, number> = Object.fromEntries(
  MISSIONS.map((m) => [m.id, m.timeLimit])
) as Record<MissionId, number>;

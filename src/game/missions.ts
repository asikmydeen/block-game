// Timed levels. Free play is roam-only. Objectives are things you DO:
// place blocks, finish a building, kill, ride, drive, survive.

import type { PlanId } from './buildings';

export type MissionId =
  | 'l01' | 'l02' | 'l03' | 'l04' | 'l05'
  | 'l06' | 'l07' | 'l08' | 'l09' | 'l10'
  | 'l11' | 'l12' | 'l13' | 'l14' | 'l15'
  | 'l16' | 'l17' | 'l18' | 'l19' | 'l20'
  | 'l21' | 'l22' | 'l23' | 'l24' | 'l25';

export type MissionKind = 'place' | 'build' | 'kills' | 'ride' | 'drive' | 'survive';

export interface ZombieWave {
  health: number;
  speedMult: number;
  respawn: number;
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
  plan?: PlanId;
  wave?: ZombieWave;
}

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
  L(1, 'Starter', 'Place 12 blocks.', 'Switch to Build, pick a block, tap Place against the ground.', 'place', 90, { count: 12 }),
  L(2, 'First Blood', 'Kill 3 zombies.', 'Switch to Fight and attack anything that shambles.', 'kills', 75, { count: 3 }),
  L(3, 'Saddle Up', 'Ride an animal once.', 'Walk up to a pig, chicken, or deer and tap Ride.', 'ride', 80, { count: 1 }),
  L(4, 'Foundation', 'Build a Pad and name it.', 'Build mode → Plans → Pad. Place it on open ground, then name it.', 'build', 90, { count: 1, plan: 'pad' }),
  L(5, 'Hunter', 'Kill 8 zombies.', 'Keep swinging. They come from the treeline.', 'kills', 90, { count: 8 }),
  L(6, 'Keys', 'Get in a car once.', 'Walk up to a parked car and tap Drive.', 'drive', 70, { count: 1 }),
  L(7, 'Mason', 'Place 30 blocks.', 'Walls, floors, anything. Just place thirty.', 'place', 100, { count: 30 }),
  L(8, 'Night Watch', 'Stay alive until the clock runs out.', 'Night is on. Lamps keep zombies back.', 'survive', 40, { night: true }),
  L(9, 'Roundup', 'Ride 2 animals.', 'Mount, hop off, mount another — or the same one twice.', 'ride', 90, { count: 2 }),
  L(10, 'Treeline', 'Kill 12 zombies.', 'They respawn faster now.', 'kills', 90, { count: 12, wave: mild }),
  L(11, 'Shed', 'Build a Hut and name it.', 'Plans → Hut. Needs a clear patch of ground.', 'build', 120, { count: 1, plan: 'hut' }),
  L(12, 'Night Streets', 'Kill 10 zombies at night.', 'Fight after dark. Keep near lamps if you get swarmed.', 'kills', 90, { count: 10, night: true, wave: mild }),
  L(13, 'Brickwork', 'Place 50 blocks.', 'A small house worth of blocks. Any type counts.', 'place', 110, { count: 50 }),
  L(14, 'Taxi', 'Get in 2 cars.', 'Enter, exit, enter again — wrecks still count if you can get in.', 'drive', 90, { count: 2 }),
  L(15, 'Blackout', 'Survive the night.', 'Tougher zombies. Keep moving.', 'survive', 50, { night: true, wave: hard }),
  L(16, 'Barricade', 'Build a Wall and name it.', 'Plans → Wall. Drop it as a stone barricade.', 'build', 100, { count: 1, plan: 'wall' }),
  L(17, 'Culling', 'Kill 15 zombies.', 'Harder wave. Do not get surrounded.', 'kills', 100, { count: 15, wave: hard }),
  L(18, 'Wrangler', 'Ride 3 animals.', 'Pig, chicken, deer — any mix.', 'ride', 100, { count: 3 }),
  L(19, 'Lookout', 'Build a Tower and name it.', 'Plans → Tower. Needs vertical clearance.', 'build', 120, { count: 1, plan: 'tower' }),
  L(20, 'Midnight Hunt', 'Kill 18 zombies at night.', 'Fast respawns after dark.', 'kills', 110, { count: 18, night: true, wave: hard }),
  L(21, 'Workshop', 'Build a Garage and name it.', 'Plans → Garage. Open front, metal roof.', 'build', 120, { count: 1, plan: 'garage' }),
  L(22, 'Foreman', 'Place 80 blocks.', 'Go big. Any blocks count.', 'place', 120, { count: 80 }),
  L(23, 'Hold Fast', 'Survive a hard night.', 'Brutal wave. Lamps still help.', 'survive', 60, { night: true, wave: brutal }),
  L(24, 'Onslaught', 'Kill 25 zombies.', 'They come back fast.', 'kills', 120, { count: 25, wave: brutal }),
  L(25, 'Last Light', 'Kill 30 zombies at night.', 'Final hunt. Night, brutal wave.', 'kills', 90, { count: 30, night: true, wave: brutal }),
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

export const LEVEL_TIME: Record<MissionId, number> = Object.fromEntries(
  MISSIONS.map((m) => [m.id, m.timeLimit])
) as Record<MissionId, number>;

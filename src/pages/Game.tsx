import { useState, useCallback, useEffect, useMemo, useRef, Suspense, type MutableRefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls, Sky, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { useWorld } from '../game/useWorld';
import { World } from '../components/World';
import { Player, type CameraMode } from '../components/Player';
import { GameUI, type NearCar } from '../components/GameUI';
import { TouchControls, isTouchDevice, type PlayStance } from '../components/TouchControls';
import { WaypointMarker } from '../components/WaypointMarker';
import { Villagers } from '../components/Villagers';
import { Zombies } from '../components/Zombies';
import { BlockType } from '../game/terrain';
import { PLACEABLE_BLOCKS } from '../game/blockColors';
import { generateHouseUpdates } from '../game/houses';
import { ChestUI, Toast, LootItem, generateLoot } from '../components/InteractionUI';
import { WEAPONS, type WeaponType, getWeapon, combatRegistry, KILL_POINTS } from '../game/combat';
import { Cars } from '../components/Cars';
import { TrafficLights } from '../components/TrafficLights';
import { generateRoadUpdates } from '../game/roads';
import { generateForestUpdates, generateParkUpdates } from '../game/decorations';
import { StreetLamps } from '../components/StreetLamps';
import { Animals } from '../components/Animals';
import { animalsRegistry, ridingState, type RideableKind } from '../game/animals';
import { getToken, saveProgress, type Account } from '../game/account';
import { CAR_SPECS, type CarInfo, carsRegistry, drivingState } from '../game/cars';
import { powerState } from '../game/powers';
import { RemotePlayers } from '../components/RemotePlayers';
import {
  MISSIONS,
  RAID_BONUS,
  getMission,
  isUnlocked,
  loadLocalMissions,
  mergeMissions,
  nextMission,
  raidZombieWave,
  saveLocalMissions,
  type MissionId,
  type ZombieWave,
} from '../game/missions';
import { mpBridge, RAID_IDLE, type MpPlayerInfo, type PingEvent, type RaidState } from '../game/mpBridge';

export type GameMode = 'free' | 'multi';

enum Controls {
  forward = 'forward',
  back = 'back',
  left = 'left',
  right = 'right',
  jump = 'jump',
}

const keyMap = [
  { name: Controls.forward, keys: ['ArrowUp', 'KeyW'] },
  { name: Controls.back, keys: ['ArrowDown', 'KeyS'] },
  { name: Controls.left, keys: ['ArrowLeft', 'KeyA'] },
  { name: Controls.right, keys: ['ArrowRight', 'KeyD'] },
  { name: Controls.jump, keys: ['Space'] },
];

function GameScene({
  world,
  selectedBlock,
  onBlockInteract,
  onInteract,
  onPositionChange,
  touchMode,
  playerPosRef,
  respawnSignal,
  onDamagePlayer,
  alive,
  weapon,
  onDrivingChange,
  onCrash,
  onNearCar,
  onNearAnimal,
  cameraMode,
  night,
  wave,
  waypoints,
}: {
  world: ReturnType<typeof useWorld>;
  selectedBlock: BlockType;
  onBlockInteract: (type: 'break' | 'place', wx: number, wy: number, wz: number, blockType?: BlockType) => void;
  onInteract: (wx: number, wy: number, wz: number) => void;
  onPositionChange: (pos: THREE.Vector3) => void;
  touchMode: boolean;
  playerPosRef: MutableRefObject<THREE.Vector3>;
  respawnSignal: number;
  onDamagePlayer: (amount: number) => void;
  alive: boolean;
  weapon: WeaponType;
  onDrivingChange: (info: CarInfo | null) => void;
  onCrash: (damage: number, broken: boolean) => void;
  onNearCar: (info: NearCar) => void;
  onNearAnimal: (kind: RideableKind | null) => void;
  cameraMode: CameraMode;
  night: boolean;
  wave?: ZombieWave | null;
  waypoints?: Array<{ x: number; y: number; z: number; label: string; color?: string }>;
}) {
  const bgColor = night ? '#0a1024' : '#87CEEB';
  const fogArgs: [string, number, number] = night
    ? ['#0a1226', 40, 140]
    : ['#c8e8ff', 60, 180];

  return (
    <>
      <color attach="background" args={[bgColor]} />
      <fog attach="fog" args={fogArgs} />

      <ambientLight intensity={night ? 0.12 : 0.4} />
      {/* Sun by day, moonlight by night */}
      <directionalLight
        position={[100, 150, 100]}
        intensity={night ? 0.18 : 1.2}
        color={night ? '#8fb0ff' : '#ffffff'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={300}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
      <hemisphereLight
        color={night ? '#1a2340' : '#87CEEB'}
        groundColor={night ? '#0d1520' : '#4a6741'}
        intensity={night ? 0.1 : 0.3}
      />

      {!night && <Sky sunPosition={[100, 50, 100]} />}
      {night && (
        <mesh position={[90, 100, -70]}>
          <sphereGeometry args={[6, 16, 16]} />
          <meshBasicMaterial color="#e8ecf4" />
        </mesh>
      )}
      <Stars radius={300} depth={50} count={3000} factor={4} />

      <World world={world} />
      <TrafficLights />
      <StreetLamps night={night} />
      <Animals
        world={world}
        playerPosRef={playerPosRef}
        touchMode={touchMode}
        onNearAnimal={onNearAnimal}
      />
      <Villagers world={world} />
      <Cars
        world={world}
        playerPosRef={playerPosRef}
        touchMode={touchMode}
        onDrivingChange={onDrivingChange}
        onCrash={onCrash}
        onNearCar={onNearCar}
      />
      <Zombies
        world={world}
        playerPosRef={playerPosRef}
        onDamagePlayer={onDamagePlayer}
        alive={alive}
        night={night}
        wave={wave}
      />
      {waypoints?.map((w) => (
        <WaypointMarker
          key={`${w.label}-${w.x}-${w.z}`}
          x={w.x}
          y={w.y}
          z={w.z}
          label={w.label}
          color={w.color}
        />
      ))}
      <Player
        world={world}
        onBlockInteract={onBlockInteract}
        onInteract={onInteract}
        selectedBlock={selectedBlock}
        onPositionChange={onPositionChange}
        touchMode={touchMode}
        playerPosRef={playerPosRef}
        respawnSignal={respawnSignal}
        weapon={weapon}
        cameraMode={cameraMode}
      />
    </>
  );
}

export default function Game({
  mode,
  account,
  onAccountChange,
  onMenu,
}: {
  mode: GameMode;
  account: Account;
  onAccountChange?: (a: Account) => void;
  onMenu?: () => void;
}) {
  const world = useWorld();
  const [mpStatus, setMpStatus] = useState<{ status: 'connecting' | 'online' | 'offline'; count: number }>({ status: 'connecting', count: 0 });
  const [selectedBlock, setSelectedBlock] = useState<BlockType>('dirt');
  const [weapon, setWeapon] = useState<WeaponType>('hand');
  const [playerPos, setPlayerPos] = useState(() => new THREE.Vector3(8, 18, 8));
  const [isLocked, setIsLocked] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [touchMode, setTouchMode] = useState(() => isTouchDevice());
  const [started, setStarted] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('first');
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const [health, setHealth] = useState(10);
  const [respawnSignal, setRespawnSignal] = useState(0);
  const [showDeath, setShowDeath] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [chestOpen, setChestOpen] = useState(false);
  const [chestLoot, setChestLoot] = useState<LootItem[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [carInfo, setCarInfo] = useState<CarInfo | null>(null);
  const [nearCar, setNearCar] = useState<NearCar>(null);
  const [nearAnimal, setNearAnimal] = useState<RideableKind | null>(null);
  const [riding, setRiding] = useState(false);
  const [paused, setPaused] = useState(false);
  const [playStance, setPlayStance] = useState<PlayStance>('fight');
  const [completedMissions, setCompletedMissions] = useState<Set<MissionId>>(() =>
    mergeMissions(account.missionsCompleted, loadLocalMissions(account.id))
  );
  const [activeMission, setActiveMission] = useState<MissionId | null>(null);
  const [missionCount, setMissionCount] = useState(0);
  const [missionStartedAt, setMissionStartedAt] = useState(0);
  const [campaignDismissed, setCampaignDismissed] = useState(
    () => mergeMissions(account.missionsCompleted, loadLocalMissions(account.id)).size > 0
  );
  const [raid, setRaid] = useState<RaidState>(RAID_IDLE);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pingMark, setPingMark] = useState<{ x: number; y: number; z: number; from: string; until: number } | null>(null);
  const [mpPlayers, setMpPlayers] = useState<MpPlayerInfo[]>([]);
  const awardedRaidWaveRef = useRef(0);
  // Score and unlocked weapons are restored from the signed-in account.
  const [score, setScore] = useState(() => account.score ?? 0);
  const [ownedWeapons, setOwnedWeapons] = useState<ReadonlySet<WeaponType>>(
    () => new Set<WeaponType>((account.ownedWeapons as WeaponType[]) ?? ['hand', 'sword', 'blaster'])
  );
  const [zombieKills, setZombieKills] = useState(() => account.zombieKills ?? 0);
  const [deathCount, setDeathCount] = useState(() => account.deaths ?? 0);
  const [shopOpen, setShopOpen] = useState(false);
  const [night, setNight] = useState(false);
  const scoreRef = useRef(0);
  const ownedRef = useRef<ReadonlySet<WeaponType>>(new Set());
  const shopOpenRef = useRef(false);
  const playerPosRef = useRef(new THREE.Vector3(8, 18, 8));
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthRef = useRef(10);
  const aliveRef = useRef(true);

  useEffect(() => {
    world.setBlocks([
      ...generateHouseUpdates(),
      ...generateRoadUpdates(),
      ...generateForestUpdates(),
      ...generateParkUpdates(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    healthRef.current = health;
  }, [health]);

  useEffect(() => {
    aliveRef.current = !showDeath;
  }, [showDeath]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    ownedRef.current = ownedWeapons;
  }, [ownedWeapons]);

  useEffect(() => {
    shopOpenRef.current = shopOpen;
  }, [shopOpen]);

  // ── Progress autosave ───────────────────────────────────────────────────
  // Debounced so a fast kill streak doesn't spam the API. The server keeps
  // monotonic maxima, so a dropped save is recovered by the next one.
  const progressRef = useRef({ score, zombieKills, deathCount, ownedWeapons, completedMissions });
  progressRef.current = { score, zombieKills, deathCount, ownedWeapons, completedMissions };
  const raidRef = useRef(raid);
  raidRef.current = raid;
  const activeMissionRef = useRef(activeMission);
  activeMissionRef.current = activeMission;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const touchModeRef = useRef(touchMode);
  touchModeRef.current = touchMode;
  const sessionStartRef = useRef(Date.now());

  useEffect(() => {
    const t = setTimeout(() => {
      const p = progressRef.current;
      saveLocalMissions(account.id, p.completedMissions);
      saveProgress({
        score: p.score,
        zombieKills: p.zombieKills,
        deaths: p.deathCount,
        ownedWeapons: [...p.ownedWeapons],
        missionsCompleted: [...p.completedMissions],
        playSeconds:
          (account.playSeconds ?? 0) + Math.floor((Date.now() - sessionStartRef.current) / 1000),
      }).then(updated => {
        if (updated) onAccountChange?.(updated);
      });
    }, 2000);
    return () => clearTimeout(t);
  }, [score, zombieKills, deathCount, ownedWeapons, completedMissions, account.playSeconds, account.id, onAccountChange]);

  // Best-effort final save when leaving the page.
  useEffect(() => {
    const flush = () => {
      const p = progressRef.current;
      const token = getToken();
      if (!token || !navigator.sendBeacon) return;
      navigator.sendBeacon(
        '/api/profile/progress',
        new Blob(
          [
            JSON.stringify({
              score: p.score,
              zombieKills: p.zombieKills,
              deaths: p.deathCount,
              ownedWeapons: [...p.ownedWeapons],
              missionsCompleted: [...p.completedMissions],
              token,
            }),
          ],
          { type: 'application/json' }
        )
      );
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  // Zombie kills award shop points and feed missions / raids.
  useEffect(() => {
    combatRegistry.onZombieKilled = () => {
      if (!aliveRef.current) return;
      setScore(s => s + KILL_POINTS);
      setZombieKills(k => k + 1);
      const mid = activeMissionRef.current;
      if (mid && getMission(mid).kind === 'kills') {
        setMissionCount(c => c + 1);
      }
      if (raidRef.current.phase === 'active') mpBridge.raidKill();
    };
    return () => {
      combatRegistry.onZombieKilled = null;
    };
  }, []);

  const handleDamagePlayer = useCallback((amount: number) => {
    if (!aliveRef.current || healthRef.current <= 0) return;
    const reduced = Math.max(1, Math.ceil(amount * powerState.damageTakenMult));
    const next = Math.max(0, healthRef.current - reduced);
    if (next === healthRef.current) return;
    healthRef.current = next;
    setHealth(next);
    setIsFlashing(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setIsFlashing(false), 250);
    if (next <= 0) {
      aliveRef.current = false;
      setShowDeath(true);
      setPaused(false);
      setDeathCount(d => d + 1);
      // Force out of any car/animal so respawn isn't overridden by ride sync
      if (drivingState.active) {
        carsRegistry.toggleDrive?.(playerPosRef.current);
      }
      if (ridingState.active) {
        animalsRegistry.toggleRide?.(playerPosRef.current);
        setRiding(false);
      }
      const mid = activeMissionRef.current;
      if (mid) {
        const def = getMission(mid);
        if (def.kind === 'survive') {
          setActiveMission(null);
          setMissionCount(0);
          if (def.night) setNight(false);
          showToastRef.current?.(`${def.title} failed. Retry from Missions.`);
        }
      }
    }
  }, []);

  const handleRespawnGuard = useCallback(() => {
    if (drivingState.active) {
      carsRegistry.toggleDrive?.(playerPosRef.current);
    }
    if (ridingState.active) {
      animalsRegistry.toggleRide?.(playerPosRef.current);
      setRiding(false);
    }
  }, []);

  const handleRespawn = useCallback(() => {
    handleRespawnGuard();
    playerPosRef.current.set(8, 18, 8);
    drivingState.justExited = true;
    healthRef.current = powerState.maxHealth;
    aliveRef.current = true;
    setHealth(powerState.maxHealth);
    setShowDeath(false);
    setRespawnSignal(s => s + 1);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const startMission = useCallback((id: MissionId) => {
    const def = getMission(id);
    activeMissionRef.current = id;
    setActiveMission(id);
    setMissionCount(0);
    setMissionStartedAt(Date.now());
    setPaused(false);
    setCampaignDismissed(true);
    if (def.night) setNight(true);
    if (!touchModeRef.current) canvasElRef.current?.requestPointerLock();
    showToast(`${def.title} — ${def.blurb}`);
  }, [showToast]);

  const abandonMission = useCallback(() => {
    const id = activeMissionRef.current;
    if (id && getMission(id).night) setNight(false);
    setActiveMission(null);
    setMissionCount(0);
    showToast('Mission abandoned.');
  }, [showToast]);

  const completeMission = useCallback((id: MissionId) => {
    if (activeMissionRef.current !== id) return;
    activeMissionRef.current = null;
    const def = getMission(id);
    setCompletedMissions(prev => {
      const next = new Set(prev);
      next.add(id);
      saveLocalMissions(account.id, next);
      return next;
    });
    setScore(s => s + def.reward);
    setActiveMission(null);
    setMissionCount(0);
    if (def.night) setNight(false);
    showToast(`${def.title} complete! +${def.reward} ⭐`);
    const done = mergeMissions(completedMissions, [id]);
    const nxt = nextMission(done);
    if (nxt) {
      window.setTimeout(() => {
        if (activeMissionRef.current) return;
        startMission(nxt);
      }, 2500);
    } else {
      window.setTimeout(() => showToast('Campaign complete. You held the city.'), 2600);
    }
  }, [account.id, completedMissions, showToast, startMission]);

  const handleInteract = useCallback((wx: number, wy: number, wz: number) => {
    const bt = world.getBlock(wx, wy, wz);
    if (bt === 'door') {
      world.setBlock(wx, wy, wz, 'air');
      const above = world.getBlock(wx, wy + 1, wz);
      const below = world.getBlock(wx, wy - 1, wz);
      if (above === 'door') world.setBlock(wx, wy + 1, wz, 'air');
      if (below === 'door') world.setBlock(wx, wy - 1, wz, 'air');
    } else if (bt === 'chest') {
      setChestLoot(generateLoot(powerState.lootLuck));
      setChestOpen(true);
      if (document.pointerLockElement) document.exitPointerLock();
      const mid = activeMissionRef.current;
      if (mid && getMission(mid).kind === 'chests') setMissionCount(c => c + 1);
    } else if (bt === 'bed') {
      healthRef.current = powerState.maxHealth;
      setHealth(powerState.maxHealth);
      showToast('You slept soundly. Full health restored.');
    }
  }, [world, showToast]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (health >= powerState.maxHealth || health <= 0) return;
    const t = setInterval(() => {
      setHealth(h => (h < powerState.maxHealth && h > 0 ? h + 1 : h));
    }, powerState.fastRegen ? 1200 : 4000);
    return () => clearInterval(t);
  }, [health]);

  useEffect(() => {
    const handleLockChange = () => {
      setIsLocked(!!document.pointerLockElement);
    };
    document.addEventListener('pointerlockchange', handleLockChange);
    return () => document.removeEventListener('pointerlockchange', handleLockChange);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (shopOpenRef.current) {
          setShopOpen(false);
          return;
        }
        setPaused(p => {
          if (p) {
            if (!touchModeRef.current) canvasElRef.current?.requestPointerLock();
            return false;
          }
          document.exitPointerLock?.();
          return true;
        });
        return;
      }
      if (pausedRef.current) return;
      if (e.key === 'b' || e.key === 'B') {
        if (e.repeat) return;
        setShopOpen(open => {
          if (!open && document.pointerLockElement) document.exitPointerLock();
          return !open;
        });
        return;
      }
      if (shopOpenRef.current) {
        return;
      }
      const num = parseInt(e.key);
      if (num >= 1 && num <= PLACEABLE_BLOCKS.length) {
        setSelectedBlock(PLACEABLE_BLOCKS[num - 1]);
      }
      if (e.key === 'q' || e.key === 'Q') {
        if (drivingState.active) return;
        // Cycle through owned weapons only
        setWeapon(w => {
          const owned = WEAPONS.filter(spec => ownedRef.current.has(spec.id));
          if (owned.length === 0) return w;
          const idx = owned.findIndex(spec => spec.id === w);
          return owned[(idx + 1) % owned.length].id;
        });
      }
      if (e.key === 'v' || e.key === 'V') {
        if (e.repeat) return;
        setCameraMode(m => (m === 'first' ? 'third' : 'first'));
      }
      if (e.key === 'n' || e.key === 'N') {
        if (e.repeat) return;
        const mid = activeMissionRef.current;
        if ((mid && getMission(mid).night) || raidRef.current.phase === 'active') return;
        setNight(n => !n);
      }
      if (e.key === 'e' || e.key === 'E') {
        if (e.repeat) return;
        // Riding an animal? E dismounts. Otherwise prefer a nearby car,
        // then fall back to mounting a nearby animal.
        if (ridingState.active) {
          toggleRideRef.current?.();
          return;
        }
        const res = carsRegistry.toggleDrive?.(playerPosRef.current);
        if (res === 'occupied') {
          showToastRef.current?.('That car already has a driver!');
        } else if (!res) {
          toggleRideRef.current?.();
        }
      }
      if (e.key === 'r' || e.key === 'R') {
        if (drivingState.active) return;
        const res = carsRegistry.repairNear?.(playerPosRef.current);
        if (res) {
          const name = CAR_SPECS[res.kind].name;
          if (res.wasBroken && res.health > 0) {
            showToastRef.current?.(`${name} engine restarted! (${res.health}/${res.maxHealth})`);
          } else if (res.health >= res.maxHealth) {
            showToastRef.current?.(`${name} fully repaired!`);
          } else {
            showToastRef.current?.(`Repairing ${name}... (${res.health}/${res.maxHealth})`);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const showToastRef = useRef<((msg: string) => void) | null>(null);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const toggleRideRef = useRef<(() => 'mounted' | 'dismounted' | null) | null>(null);

  const handleCrash = useCallback((damage: number, broken: boolean) => {
    if (broken) {
      showToast('Car wrecked! Get out (E) and press R to repair it.');
    } else {
      showToast(`Crash! Car took ${damage} damage.`);
    }
  }, [showToast]);

  const toggleRide = useCallback(() => {
    const res = animalsRegistry.toggleRide?.(playerPosRef.current);
    if (res === 'mounted') setRiding(true);
    else if (res === 'dismounted') setRiding(false);
    return res ?? null;
  }, []);

  useEffect(() => {
    toggleRideRef.current = toggleRide;
  }, [toggleRide]);

  const handleCarButton = useCallback(() => {
    const res = carsRegistry.toggleDrive?.(playerPosRef.current);
    if (res === 'occupied') {
      showToast('That car already has a driver!');
    }
  }, [showToast]);

  const buyWeapon = useCallback((id: WeaponType) => {
    const spec = getWeapon(id);
    if (ownedRef.current.has(id)) {
      setWeapon(id);
      setShopOpen(false);
      return;
    }
    if (scoreRef.current < spec.cost) {
      showToastRef.current?.(`Need ${spec.cost - scoreRef.current} more points for the ${spec.name}!`);
      return;
    }
    setScore(s => s - spec.cost);
    setOwnedWeapons(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setWeapon(id);
    showToastRef.current?.(`🎉 ${spec.name} unlocked and equipped!`);
  }, []);

  const openShop = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    setPaused(false);
    setShopOpen(true);
  }, []);

  const handleTogglePause = useCallback(() => {
    setPaused(p => {
      if (p) {
        if (!touchModeRef.current) canvasElRef.current?.requestPointerLock();
        return false;
      }
      document.exitPointerLock?.();
      return true;
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const id = activeMission;
    if (!id) return;
    const def = getMission(id);
    const pos = playerPosRef.current;
    if (def.kind === 'goto' && def.target) {
      const dist = Math.hypot(pos.x - def.target.x, pos.z - def.target.z);
      const yOk = def.target.y == null || pos.y >= def.target.y - 2;
      if (dist <= def.target.r && yOk) completeMission(id);
    }
    if (def.kind === 'drive' && def.target && drivingState.active) {
      const dist = Math.hypot(pos.x - def.target.x, pos.z - def.target.z);
      if (dist <= def.target.r) completeMission(id);
    }
    if (def.kind === 'kills' && missionCount >= (def.count ?? 1)) completeMission(id);
    if (def.kind === 'chests' && missionCount >= (def.count ?? 1)) completeMission(id);
    if (def.kind === 'survive' && missionStartedAt > 0) {
      const elapsed = (nowMs - missionStartedAt) / 1000;
      if (elapsed >= (def.duration ?? 0)) completeMission(id);
    }
  }, [nowMs, activeMission, missionCount, missionStartedAt, completeMission]);

  const lastRaidNote = useRef('');
  useEffect(() => {
    const key = `${raid.phase}-${raid.wave}`;
    if (raid.phase === 'active') setNight(true);
    else if (raid.phase === 'rest' || raid.phase === 'won') {
      if (!(activeMissionRef.current && getMission(activeMissionRef.current).night)) {
        setNight(false);
      }
    }
    if (lastRaidNote.current === key) return;
    lastRaidNote.current = key;
    if ((raid.phase === 'rest' || raid.phase === 'won') && raid.wave > 0) {
      if (awardedRaidWaveRef.current !== raid.wave) {
        awardedRaidWaveRef.current = raid.wave;
        const bonus = RAID_BONUS[raid.wave] ?? 40;
        setScore(s => s + bonus);
        showToast(
          raid.phase === 'won'
            ? `Night Raid won! +${bonus} ⭐`
            : `Wave ${raid.wave} cleared! +${bonus} ⭐`
        );
      }
    }
    if (raid.phase === 'idle') awardedRaidWaveRef.current = 0;
    if (raid.phase === 'failed') showToast('The horde overran the city.');
  }, [raid.phase, raid.wave, showToast]);

  useEffect(() => {
    if (pingMark && pingMark.until <= nowMs) setPingMark(null);
  }, [nowMs, pingMark]);

  const handleRepairButton = useCallback(() => {
    if (drivingState.active) return;
    const res = carsRegistry.repairNear?.(playerPosRef.current);
    if (res) {
      const name = CAR_SPECS[res.kind].name;
      showToast(res.health >= res.maxHealth ? `${name} fully repaired!` : `Repairing ${name}... (${res.health}/${res.maxHealth})`);
    }
  }, [showToast]);

  const handleBlockInteract = useCallback((
    type: 'break' | 'place',
    wx: number,
    wy: number,
    wz: number,
    blockType?: BlockType
  ) => {
    if (type === 'break') {
      world.setBlock(wx, wy, wz, 'air');
    } else if (type === 'place' && blockType) {
      world.setBlock(wx, wy, wz, blockType);
    }
  }, [world]);

  const handlePositionChange = useCallback((pos: THREE.Vector3) => {
    setPlayerPos(pos.clone());
  }, []);

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    if (!gl.getContext()) {
      setWebglError(true);
    }
    canvasElRef.current = gl.domElement;
  }, []);

  const handleStart = useCallback(() => {
    setStarted(true);
    setPaused(false);
    // On desktop the overlay covers the canvas, so the canvas click handler
    // can never fire; request pointer lock directly from the overlay click.
    if (!touchMode) {
      canvasElRef.current?.requestPointerLock();
    }
  }, [touchMode]);

  const nightLocked =
    !!(activeMission && getMission(activeMission).night) || raid.phase === 'active';

  const zombieWave = useMemo(() => {
    if (raid.phase === 'active') return raidZombieWave(raid.wave);
    if (activeMission) return getMission(activeMission).wave ?? null;
    return null;
  }, [raid.phase, raid.wave, activeMission]);

  const waypoints = useMemo(() => {
    const list: Array<{ x: number; y: number; z: number; label: string; color?: string }> = [];
    if (pingMark && pingMark.until > nowMs) {
      list.push({ x: pingMark.x, y: pingMark.y, z: pingMark.z, label: pingMark.from, color: '#5ad1ff' });
    }
    if (activeMission) {
      const t = getMission(activeMission).target;
      if (t) list.push({ x: t.x, y: t.y ?? 13, z: t.z, label: t.label });
    }
    return list;
  }, [pingMark, nowMs, activeMission]);

  const objective = useMemo(() => {
    if (raid.phase === 'active') {
      const remain = Math.max(0, Math.ceil((raid.endsAt - nowMs) / 1000));
      return {
        title: `Night Raid · wave ${raid.wave}`,
        detail: `${raid.kills}/${raid.goal} kills · ${remain}s`,
      };
    }
    if (raid.phase === 'rest') {
      const remain = Math.max(0, Math.ceil((raid.endsAt - nowMs) / 1000));
      return { title: 'Night Raid', detail: `Rest · next wave in ${remain}s` };
    }
    if (!activeMission) return null;
    const def = getMission(activeMission);
    let detail = def.blurb;
    if (def.kind === 'kills') detail = `${missionCount}/${def.count ?? 0} kills`;
    if (def.kind === 'chests') detail = 'Loot a chest';
    if (def.kind === 'survive' && missionStartedAt) {
      const remain = Math.max(0, Math.ceil(def.duration! - (nowMs - missionStartedAt) / 1000));
      detail = `Survive ${remain}s`;
    }
    if (def.kind === 'goto' && def.target) detail = `Go to ${def.target.label}`;
    if (def.kind === 'drive' && def.target) detail = `Drive to ${def.target.label}`;
    return { title: def.title, detail };
  }, [raid, nowMs, activeMission, missionCount, missionStartedAt]);

  const missionItems = useMemo(
    () =>
      MISSIONS.map((m) => ({
        id: m.id,
        title: m.title,
        blurb: m.blurb,
        hint: m.hint,
        reward: m.reward,
        status: (completedMissions.has(m.id)
          ? 'done'
          : activeMission === m.id
            ? 'active'
            : isUnlocked(m.id, completedMissions)
              ? 'available'
              : 'locked') as 'locked' | 'available' | 'active' | 'done',
      })),
    [completedMissions, activeMission]
  );

  const nearbyPlayers = useMemo(() => {
    const p = playerPos;
    return mpPlayers.map((o) => ({
      name: o.name,
      dist: Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z),
    }));
  }, [mpPlayers, playerPos]);

  const handlePing = useCallback(() => {
    const p = playerPosRef.current;
    mpBridge.ping(p.x, p.y, p.z);
  }, []);

  const handleRaidStart = useCallback(() => {
    mpBridge.raidStart();
    setPaused(false);
    if (!touchModeRef.current) canvasElRef.current?.requestPointerLock();
  }, []);

  const handleAcceptCampaign = useCallback(() => {
    const nxt = nextMission(completedMissions) ?? 'park';
    startMission(nxt);
  }, [completedMissions, startMission]);

  if (webglError) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a2e',
        color: 'white',
        fontFamily: 'monospace',
        textAlign: 'center',
        padding: 32,
      }}>
        <div>
          <div style={{ fontSize: 24, marginBottom: 16, color: '#ff6b6b' }}>WebGL Not Available</div>
          <div style={{ color: '#aaa', maxWidth: 400 }}>
            This game requires WebGL to run. Please open the app in a modern browser window.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#87CEEB' }}>
      <KeyboardControls map={keyMap}>
        <Canvas
          gl={{
            antialias: true,
            failIfMajorPerformanceCaveat: false,
          }}
          onCreated={handleCreated}
          camera={{ fov: 75, near: 0.05, far: 500, position: [8, 18, 8] }}
          shadows
          style={{ position: 'absolute', inset: 0 }}
        >
          <Suspense fallback={null}>
            <GameScene
              world={world}
              selectedBlock={selectedBlock}
              onBlockInteract={handleBlockInteract}
              onInteract={handleInteract}
              onPositionChange={handlePositionChange}
              touchMode={touchMode}
              playerPosRef={playerPosRef}
              respawnSignal={respawnSignal}
              onDamagePlayer={handleDamagePlayer}
              alive={!showDeath}
              weapon={weapon}
              onDrivingChange={setCarInfo}
              onCrash={handleCrash}
              onNearCar={setNearCar}
              onNearAnimal={setNearAnimal}
              cameraMode={cameraMode}
              night={night}
              wave={zombieWave}
              waypoints={waypoints}
            />
            {mode === 'multi' && (
              <RemotePlayers
                playerPosRef={playerPosRef}
                onStatusChange={(status, count) => setMpStatus({ status, count })}
                onRaid={setRaid}
                onPlayers={setMpPlayers}
                onPing={(ev: PingEvent) => {
                  setPingMark({ ...ev, until: Date.now() + 8000 });
                  showToastRef.current?.(`${ev.from} pinged a location`);
                }}
              />
            )}
          </Suspense>
        </Canvas>
      </KeyboardControls>

      <GameUI
        selectedBlock={selectedBlock}
        onSelectBlock={setSelectedBlock}
        position={playerPos}
        started={started}
        isLocked={isLocked}
        touchMode={touchMode}
        onToggleTouchMode={() => setTouchMode(t => !t)}
        onStart={handleStart}
        cameraMode={cameraMode}
        onToggleCamera={() => setCameraMode(m => (m === 'first' ? 'third' : 'first'))}
        health={health}
        maxHealth={powerState.maxHealth}
        weapon={weapon}
        onSelectWeapon={setWeapon}
        score={score}
        ownedWeapons={ownedWeapons}
        onOpenShop={openShop}
        night={night}
        onToggleNight={() => {
          if (!nightLocked) setNight(n => !n);
        }}
        nearAnimal={nearAnimal}
        riding={riding}
        onRideButton={toggleRide}
        carInfo={carInfo}
        nearCar={nearCar}
        onCarButton={handleCarButton}
        onRepairButton={handleRepairButton}
        onMenu={onMenu}
        paused={paused}
        onTogglePause={handleTogglePause}
        playStance={playStance}
        onPlayStance={setPlayStance}
        nightLocked={nightLocked}
        objective={objective}
        missions={missionItems}
        onStartMission={startMission}
        onAbandonMission={abandonMission}
        showCampaignPrompt={started && !campaignDismissed && !paused && !showDeath}
        onAcceptCampaign={handleAcceptCampaign}
        onDismissCampaign={() => setCampaignDismissed(true)}
        mode={mode}
        raid={mode === 'multi' ? raid : null}
        nowMs={nowMs}
        onStartRaid={handleRaidStart}
        onPing={handlePing}
        nearbyPlayers={nearbyPlayers}
        mpStatus={mode === 'multi' ? mpStatus : undefined}
      />

      {isFlashing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(220, 30, 30, 0.25)',
            pointerEvents: 'none',
            zIndex: 150,
          }}
        />
      )}

      {showDeath && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300,
            color: 'white',
            fontFamily: 'monospace',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ fontSize: 40, fontWeight: 'bold', color: '#ff4d4d' }}>YOU DIED</div>
          <div style={{ color: '#bbb' }}>The zombies got you.</div>
          <button
            onClick={handleRespawn}
            style={{
              marginTop: 12,
              background: '#7CFC00',
              color: '#102',
              border: 'none',
              borderRadius: 8,
              padding: '12px 28px',
              fontSize: 16,
              fontWeight: 'bold',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            Respawn
          </button>
        </div>
      )}

      <TouchControls
        enabled={touchMode && started && !showDeath && !paused && !shopOpen}
        stance={playStance}
        driving={!!carInfo}
      />

      {shopOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 250,
            fontFamily: 'monospace',
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setShopOpen(false);
          }}
        >
          <div
            style={{
              background: '#12161f',
              border: '2px solid #c9a53d',
              borderRadius: 12,
              padding: '20px 24px',
              color: 'white',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minWidth: 340,
              maxWidth: 420,
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#ffd76a' }}>🔫 Weapon Shop</div>
              <div style={{ fontSize: 14, color: '#8affc1' }}>⭐ {score} pts</div>
            </div>
            <div style={{ fontSize: 11, color: '#8a94a5' }}>
              Kill zombies to earn points ({KILL_POINTS} per kill). Press B or Esc to close.
            </div>
            {WEAPONS.map(w => {
              const owned = ownedWeapons.has(w.id);
              const affordable = score >= w.cost;
              return (
                <div
                  key={w.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: weapon === w.id ? 'rgba(201,165,61,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${weapon === w.id ? '#c9a53d' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                      {w.name}
                      {w.auto && <span style={{ color: '#5ad1ff', fontSize: 10, marginLeft: 6 }}>AUTO</span>}
                      {!w.ranged && <span style={{ color: '#b9a389', fontSize: 10, marginLeft: 6 }}>MELEE</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#8a94a5' }}>
                      {w.desc} · dmg {w.damage} · {w.attackRate}/s
                    </div>
                  </div>
                  <button
                    onClick={() => buyWeapon(w.id)}
                    style={{
                      background: owned ? 'rgba(255,255,255,0.12)' : affordable ? '#2e8b57' : 'rgba(255,255,255,0.06)',
                      color: owned ? '#8affc1' : affordable ? 'white' : '#777',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 12px',
                      fontSize: 12,
                      fontWeight: 'bold',
                      cursor: owned || affordable ? 'pointer' : 'not-allowed',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {owned ? (weapon === w.id ? 'Equipped' : 'Equip') : `⭐ ${w.cost}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {chestOpen && (
        <ChestUI
          loot={chestLoot}
          onClose={() => setChestOpen(false)}
        />
      )}

      {toastMsg && <Toast message={toastMsg} />}
    </div>
  );
}

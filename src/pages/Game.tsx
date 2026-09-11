import { useState, useCallback, useEffect, useMemo, useRef, Suspense, Profiler, type MutableRefObject } from 'react';
import { isCommitProbeEnabled, recordCommit } from '../game/commitProbe';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls, Sky, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useWorld } from '../game/useWorld';
import { World } from '../components/World';
import { Player, type CameraMode } from '../components/Player';
import { GameUI, type NearCar } from '../components/GameUI';
import { TouchControls, isTouchDevice, type PlayStance } from '../components/TouchControls';
import { WaypointMarker } from '../components/WaypointMarker';
import { BuildingGhost, NamedBuildingLabels } from '../components/BuildingsView';
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
import { selectRenderProfile, type RenderProfile } from '../game/renderQuality';
import { createHudSampler, type HudSampler } from '../game/hudSampler';
import { Animals } from '../components/Animals';
import { animalsRegistry, ridingState, type RideableKind } from '../game/animals';
import { getAccountApiClient, getToken, saveProgress, type Account } from '../game/account';
import { getEndpointConfig } from '../game/apiClient';
import { EMOTES, reportKill, sendEmote, createStoreSink } from '../game/multiplayer';
import { createMultiplayerClient, type MultiplayerClient } from '../game/multiplayerClient';
import { ChatPanel, EmoteBar, EventFeed, PlayersPanel } from '../components/SocialUI';
import { CAR_SPECS, type CarInfo, type CarKind, carsRegistry, drivingState } from '../game/cars';
import { powerState } from '../game/powers';
import { RemotePlayers } from '../components/RemotePlayers';
import {
  MISSIONS,
  formatClock,
  getMission,
  isMissionId,
  isUnlocked,
  loadLocalMissions,
  mergeMissions,
  saveLocalMissions,
  type MissionId,
  type ZombieWave,
} from '../game/missions';
import { mpBridge, RACE_IDLE, type MpPlayerInfo, type PingEvent, type RaceState } from '../game/mpBridge';
import { LevelSelect, type LevelBox } from '../components/LevelSelect';
import {
  BUILDING_PLANS,
  getPlan,
  loadBuildings,
  saveBuildings,
  stampPlan,
  type NamedBuilding,
  type PlanId,
} from '../game/buildings';

export type GameMode = 'free' | 'levels' | 'multi';

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
  planId,
  namedBuildings,
  profile,
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
  planId?: PlanId | null;
  namedBuildings?: NamedBuilding[];
  profile: RenderProfile;
}) {
  const bgColor = night ? '#0a1024' : '#87CEEB';
  const fogArgs: [string, number, number] = night
    ? ['#0a1226', 40, 140]
    : ['#c8e8ff', 60, 180];

  return (
    <>
      <color attach="background" args={[bgColor]} />
      <fog attach="fog" args={fogArgs} />

      {/* Ambient is deliberately low: the chunk mesher bakes ambient occlusion
          into vertex colours, so flooding the scene with fill light would wash
          that contact shading straight out. */}
      <ambientLight intensity={night ? 0.1 : 0.34} />
      {/* Sun by day, moonlight by night */}
      <directionalLight
        position={[100, 150, 100]}
        intensity={night ? 0.18 : 1.35}
        color={night ? '#8fb0ff' : '#fff6e6'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={300}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        // Bias pair kills shadow acne on flat voxel faces without introducing
        // visible peter-panning.
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
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
      <Stars radius={300} depth={50} count={profile.starCount} factor={4} />

      <World world={world} night={night} />

      {/* Bloom makes the street lamps, neon and sun glints actually glow;
          it is dialled up at night where the light sources carry the scene.
          On mobile the profile scales the intensity down (or disables it). */}
      {profile.bloomEnabled ? (
        <EffectComposer enableNormalPass={false}>
          <Bloom
            intensity={(night ? 1.15 : 0.32) * profile.bloomIntensityScale}
            luminanceThreshold={night ? 0.28 : 0.72}
            luminanceSmoothing={0.22}
            mipmapBlur
          />
          <Vignette offset={0.28} darkness={night ? 0.62 : 0.32} />
        </EffectComposer>
      ) : (
        <EffectComposer enableNormalPass={false}>
          <Vignette offset={0.28} darkness={night ? 0.62 : 0.32} />
        </EffectComposer>
      )}
      <TrafficLights />
      <StreetLamps night={night} lightLimit={profile.decorativeLightLimit} playerPosRef={playerPosRef} />
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
      <BuildingGhost world={world} planId={planId ?? null} />
      {namedBuildings && namedBuildings.length > 0 && (
        <NamedBuildingLabels buildings={namedBuildings} />
      )}
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
  const [cameraMode, setCameraMode] = useState<CameraMode>(() => (isTouchDevice() ? 'third' : 'first'));
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
  const [levelEndsAt, setLevelEndsAt] = useState(0);
  const [showLevelSelect, setShowLevelSelect] = useState(() => mode !== 'free');
  const [race, setRace] = useState<RaceState>(RACE_IDLE);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pingMark, setPingMark] = useState<{ x: number; y: number; z: number; from: string; until: number } | null>(null);
  const [mpPlayers, setMpPlayers] = useState<MpPlayerInfo[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [namedBuildings, setNamedBuildings] = useState<NamedBuilding[]>(() => loadBuildings(account.id));
  const [pendingBuild, setPendingBuild] = useState<{ plan: PlanId; x: number; y: number; z: number } | null>(null);
  const [buildName, setBuildName] = useState('');
  const selectedPlanRef = useRef<PlanId | null>(null);
  selectedPlanRef.current = selectedPlan;
  // Score and unlocked weapons are restored from the signed-in account.
  const [score, setScore] = useState(() => account.score ?? 0);
  const [ownedWeapons, setOwnedWeapons] = useState<ReadonlySet<WeaponType>>(
    () => new Set<WeaponType>((account.ownedWeapons as WeaponType[]) ?? ['hand', 'sword', 'blaster'])
  );
  const [zombieKills, setZombieKills] = useState(() => account.zombieKills ?? 0);
  const [deathCount, setDeathCount] = useState(() => account.deaths ?? 0);
  const [shopOpen, setShopOpen] = useState(false);
  const [night, setNight] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const scoreRef = useRef(0);
  const ownedRef = useRef<ReadonlySet<WeaponType>>(new Set());
  const shopOpenRef = useRef(false);
  const playerPosRef = useRef(new THREE.Vector3(8, 18, 8));
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthRef = useRef(10);
  const aliveRef = useRef(true);
  // Camera-facing yaw for the position publisher. RemotePlayers updates it each
  // frame (it has the camera); the transport client reads it. It is a plain
  // ref, not transport state.
  const mpYawRef = useRef(0);

  // The render profile is selected ONCE, before the Canvas is created, from an
  // injected capability snapshot. It is immutable for the session and feeds the
  // renderer (gl/dpr/shadows/tone mapping), star count, bloom, and the
  // decorative-light budget. Never rebuilt — quality does not change mid-session.
  const profile = useMemo(() => selectRenderProfile({ isNative: isTouchDevice() }), []);

  // Test-only: whether to instrument the root game commit rate (task 14.7).
  // Off in every normal session; a Playwright spec opts in before the app boots.
  const commitProbe = useMemo(() => isCommitProbeEnabled(), []);

  // The HUD position sampler is the ONLY path from the per-frame position into
  // React. Player writes continuous position into playerPosRef every frame and
  // calls handlePositionChange; the sampler forwards rounded coordinates to the
  // HUD at <= 5 Hz with equality suppression, replacing the old per-frame
  // setPlayerPos commit. Discrete UI events stay immediate.
  const hudSamplerRef = useRef<HudSampler | null>(null);
  if (!hudSamplerRef.current) {
    hudSamplerRef.current = createHudSampler({
      precision: 1,
      publish: (c) => setPlayerPos(new THREE.Vector3(c.x, c.y, c.z)),
    });
  }

  // The multiplayer transport, created ONCE and owned here (not by any R3F
  // component). It reads the live position/score/yaw through refs and pushes
  // decoded protocol events into the shared store via the sink adapter, which
  // preserves every existing message shape and store mutation. RemotePlayers
  // merely starts/stops it.
  const mpClientRef = useRef<MultiplayerClient | null>(null);
  if (mode === 'multi' && !mpClientRef.current) {
    mpClientRef.current = createMultiplayerClient({
      url: getEndpointConfig().webSocketUrl.toString(),
      socketFactory: (url) => new WebSocket(url),
      getToken: () => getToken(),
      clearAuth: () => {
        // A server auth rejection is terminal; surface it and stop dialing.
        setMpStatus({ status: 'offline', count: 0 });
      },
      getPosition: () => {
        const p = playerPosRef.current;
        return { x: p.x, y: p.y, z: p.z, yaw: mpYawRef.current, score: scoreRef.current };
      },
      sink: createStoreSink({
        self: () => {},
        status: (status, count) => setMpStatus({ status, count }),
        race: (r) => setRace(r as RaceState),
        ping: (ev) => {
          const e = ev as PingEvent;
          setPingMark({ ...e, until: Date.now() + 8000 });
          showToastRef.current?.(`${e.from} pinged a location`);
        },
        players: (list) => setMpPlayers(list as MpPlayerInfo[]),
      }),
    });
  }

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

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const isMulti = mode === 'multi';
  // The keydown effect registers once, so it reads the mode through a ref.
  const isMultiRef = useRef(isMulti);
  isMultiRef.current = isMulti;

  // ── Progress autosave ───────────────────────────────────────────────────
  // Debounced so a fast kill streak doesn't spam the API. The server keeps
  // monotonic maxima, so a dropped save is recovered by the next one.
  const progressRef = useRef({ score, zombieKills, deathCount, ownedWeapons, completedMissions });
  progressRef.current = { score, zombieKills, deathCount, ownedWeapons, completedMissions };
  const raceRef = useRef(race);
  raceRef.current = race;
  const activeMissionRef = useRef(activeMission);
  activeMissionRef.current = activeMission;
  const levelEndsAtRef = useRef(levelEndsAt);
  levelEndsAtRef.current = levelEndsAt;
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
      if (!token) return;
      // Absolute-URL beacon through the resolved API base. The server still
      // accepts the token in the body for this final web save; the client
      // never places it in the URL.
      getAccountApiClient().beacon('/api/profile/progress', {
        score: p.score,
        zombieKills: p.zombieKills,
        deaths: p.deathCount,
        ownedWeapons: [...p.ownedWeapons],
        missionsCompleted: [...p.completedMissions],
        token,
      });
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  // Suspend HUD sampling while backgrounded; resume when foregrounded. This
  // keeps the sampler from publishing stale positions during a tab/app hide and
  // matches the lifecycle suspend ordering used elsewhere.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) hudSamplerRef.current?.suspend();
      else hudSamplerRef.current?.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      hudSamplerRef.current?.stop();
    };
  }, []);

  // Zombie kills award shop points and feed kill-count levels.
  useEffect(() => {
    combatRegistry.onZombieKilled = () => {
      if (!aliveRef.current) return;
      setScore(s => s + KILL_POINTS);
      setZombieKills(k => k + 1);
      const mid = activeMissionRef.current;
      if (mid && getMission(mid).kind === 'kills') {
        setMissionCount(c => c + 1);
      }
      // timed kill-levels increment above; MP race completion is sent when the count hits the goal
      // Cosmetic kill feed for anyone else in the world.
      if (isMultiRef.current) reportKill();
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
        activeMissionRef.current = null;
        setActiveMission(null);
        setMissionCount(0);
        if (def.night) setNight(false);
        setShowLevelSelect(true);
        showToastRef.current?.(`Level ${def.n} failed. You died.`);
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

  const failLevel = useCallback((reason: string) => {
    const id = activeMissionRef.current;
    if (!id) return;
    const def = getMission(id);
    activeMissionRef.current = null;
    setActiveMission(null);
    setMissionCount(0);
    setLevelEndsAt(0);
    if (def.night) setNight(false);
    setShowLevelSelect(true);
    showToast(reason);
  }, [showToast]);

  const startLevel = useCallback((id: MissionId, opts?: { endsAt?: number; fromServer?: boolean }) => {
    if (mode === 'multi' && !opts?.fromServer) {
      mpBridge.levelStart(id);
      return;
    }
    if (mode === 'levels' && !isUnlocked(id, completedMissions) && !opts?.fromServer) return;
    const def = getMission(id);
    activeMissionRef.current = id;
    setActiveMission(id);
    setMissionCount(0);
    const ends = opts?.endsAt ?? Date.now() + def.timeLimit * 1000;
    setLevelEndsAt(ends);
    levelEndsAtRef.current = ends;
    setShowLevelSelect(false);
    setPaused(false);
    setNight(!!def.night);
    if (def.kind === 'place' || def.kind === 'build') setPlayStance('build');
    if (def.kind === 'build' && def.plan) setSelectedPlan(def.plan);
    playerPosRef.current.set(8, 18, 8);
    setRespawnSignal((s) => s + 1);
    healthRef.current = powerState.maxHealth;
    setHealth(powerState.maxHealth);
    if (!touchModeRef.current) canvasElRef.current?.requestPointerLock();
    showToast(`Level ${def.n} · ${def.title} · ${formatClock(def.timeLimit)}`);
  }, [mode, completedMissions, showToast]);

  const abandonMission = useCallback(() => {
    failLevel('Level abandoned.');
  }, [failLevel]);

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
    setLevelEndsAt(0);
    if (def.night) setNight(false);
    setShowLevelSelect(true);
    if (mode === 'multi') mpBridge.levelComplete(id);
    showToast(`Level ${def.n} clear! +${def.reward} pts`);
  }, [account.id, mode, showToast]);

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
      // While the chat box has focus, every keystroke belongs to the message.
      if (chatOpenRef.current) return;

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

      // ── Multiplayer social bindings ───────────────────────────────────
      if (isMultiRef.current) {
        if (e.key === 't' || e.key === 'T') {
          if (e.repeat) return;
          if (document.pointerLockElement) document.exitPointerLock();
          setChatOpen(true);
          return;
        }
        if (e.key === 'p' || e.key === 'P') {
          if (e.repeat) return;
          setPlayersOpen(o => !o);
          return;
        }
        const emote = EMOTES.find(em => em.key.toLowerCase() === e.key.toLowerCase());
        if (emote) {
          if (e.repeat) return;
          sendEmote(emote.name);
          return;
        }
      }

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
        if (mid && getMission(mid).night) return;
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
        } else if (res === 'entered') {
          const mid = activeMissionRef.current;
          if (mid && getMission(mid).kind === 'drive') setMissionCount((c) => c + 1);
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
    if (res === 'mounted') {
      setRiding(true);
      const mid = activeMissionRef.current;
      if (mid && getMission(mid).kind === 'ride') setMissionCount((c) => c + 1);
    } else if (res === 'dismounted') setRiding(false);
    return res ?? null;
  }, []);

  useEffect(() => {
    toggleRideRef.current = toggleRide;
  }, [toggleRide]);

  const handleCarButton = useCallback(() => {
    const res = carsRegistry.toggleDrive?.(playerPosRef.current);
    if (res === 'occupied') {
      showToast('That car already has a driver!');
    } else if (res === 'entered') {
      const mid = activeMissionRef.current;
      if (mid && getMission(mid).kind === 'drive') setMissionCount((c) => c + 1);
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
    const remain = (levelEndsAt - nowMs) / 1000;
    if (remain <= 0) {
      if (def.kind === 'survive' && aliveRef.current) completeMission(id);
      else failLevel('Time is up.');
      return;
    }
    if (
      (def.kind === 'kills' ||
        def.kind === 'place' ||
        def.kind === 'build' ||
        def.kind === 'ride' ||
        def.kind === 'drive') &&
      missionCount >= (def.count ?? 1)
    ) {
      completeMission(id);
    }
  }, [nowMs, activeMission, missionCount, levelEndsAt, completeMission, failLevel]);

  const lastRaceKey = useRef('');
  useEffect(() => {
    if (mode !== 'multi') return;
    const key = `${race.phase}:${race.levelId}:${race.endsAt}:${race.winner ?? ''}`;
    if (lastRaceKey.current === key) return;
    lastRaceKey.current = key;
    if (race.phase === 'active' && isMissionId(race.levelId ?? '')) {
      if (activeMissionRef.current !== race.levelId) {
        startLevel(race.levelId as MissionId, { endsAt: race.endsAt, fromServer: true });
      }
    } else if (race.phase === 'won' && race.winner) {
      if (race.winner !== account.username && activeMissionRef.current) {
        failLevel(`${race.winner} finished first.`);
      }
    } else if (race.phase === 'failed' && activeMissionRef.current) {
      failLevel('Time is up.');
    }
  }, [mode, race, account.username, startLevel, failLevel, showToast]);

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
      return;
    }
    if (type !== 'place') return;
    const planId = selectedPlanRef.current;
    if (planId) {
      const stamped = stampPlan(world, getPlan(planId), wx, wy, wz);
      if (!stamped) {
        showToast('Need a clear patch of ground for that plan.');
        return;
      }
      setBuildName(getPlan(planId).name);
      setPendingBuild({ plan: planId, x: stamped.x, y: stamped.y, z: stamped.z });
      document.exitPointerLock?.();
      const mid = activeMissionRef.current;
      if (mid) {
        const def = getMission(mid);
        if (def.kind === 'place') setMissionCount((c) => c + stamped.count);
      }
      return;
    }
    if (blockType) {
      world.setBlock(wx, wy, wz, blockType);
      const mid = activeMissionRef.current;
      if (mid && getMission(mid).kind === 'place') setMissionCount((c) => c + 1);
    }
  }, [world, showToast]);

  const handlePositionChange = useCallback((pos: THREE.Vector3) => {
    // Per-frame path: continuous position already lives in playerPosRef (Player
    // copies into it each frame). Do NOT setState here — feed the sampler, which
    // publishes to the HUD at most 5x/sec with display-precision suppression.
    hudSamplerRef.current?.sample(performance.now(), { x: pos.x, y: pos.y, z: pos.z });
  }, []);

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    if (!gl.getContext()) {
      setWebglError(true);
    }
    canvasElRef.current = gl.domElement;
    // Filmic tone mapping keeps bright sky and lamp glare from clipping to
    // flat white, and soft shadows suit the chunky geometry. Both tiers keep
    // ACES tone mapping (meshes/glow stay visible); only the shadow map type
    // and enablement follow the profile.
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = profile.toneMappingExposure;
    gl.shadowMap.type =
      profile.shadowMapType === 'pcfsoft' ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
  }, [profile]);

  const handleStart = useCallback(() => {
    setStarted(true);
    setPaused(false);
    // On desktop the overlay covers the canvas, so the canvas click handler
    // can never fire; request pointer lock directly from the overlay click.
    if (!touchMode) {
      canvasElRef.current?.requestPointerLock();
    }
  }, [touchMode]);

  const nightLocked = !!(activeMission && getMission(activeMission).night);

  const zombieWave = useMemo((): ZombieWave | null => {
    if (activeMission) return getMission(activeMission).wave ?? null;
    return null;
  }, [activeMission]);

  const waypoints = useMemo(() => {
    const list: Array<{ x: number; y: number; z: number; label: string; color?: string }> = [];
    if (pingMark && pingMark.until > nowMs) {
      list.push({ x: pingMark.x, y: pingMark.y, z: pingMark.z, label: pingMark.from, color: '#5ad1ff' });
    }
    return list;
  }, [pingMark, nowMs]);

  const objective = useMemo(() => {
    if (!activeMission) return null;
    const def = getMission(activeMission);
    const remain = formatClock((levelEndsAt - nowMs) / 1000);
    let detail = def.blurb;
    if (def.kind === 'kills') detail = `${missionCount}/${def.count ?? 0} kills`;
    if (def.kind === 'place') detail = `${missionCount}/${def.count ?? 0} blocks`;
    if (def.kind === 'build') detail = `Build a ${getPlan(def.plan ?? 'pad').name} · ${missionCount}/${def.count ?? 1}`;
    if (def.kind === 'ride') detail = `${missionCount}/${def.count ?? 1} rides`;
    if (def.kind === 'drive') detail = `${missionCount}/${def.count ?? 1} cars`;
    if (def.kind === 'survive') detail = 'Stay alive';
    const raceNote =
      mode === 'multi' && race.winner
        ? ` · ${race.winner} wins`
        : mode === 'multi'
          ? ' · race'
          : '';
    return {
      title: `Lv ${def.n} · ${def.title} · ${remain}`,
      detail: `${detail}${raceNote}`,
    };
  }, [nowMs, activeMission, missionCount, levelEndsAt, mode, race.winner]);

  const levelItems: LevelBox[] = useMemo(
    () =>
      MISSIONS.map((m) => ({
        id: m.id,
        n: m.n,
        title: m.title,
        blurb: m.blurb,
        timeLimit: m.timeLimit,
        status: (completedMissions.has(m.id)
          ? 'done'
          : activeMission === m.id
            ? 'active'
            : mode === 'multi' || isUnlocked(m.id, completedMissions)
              ? 'open'
              : 'locked') as LevelBox['status'],
      })),
    [completedMissions, activeMission, mode]
  );

  const nearbyPlayers = useMemo(() => {
    const p = playerPosRef.current;
    return mpPlayers.map((o) => ({
      name: o.name,
      dist: Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z),
    }));
  }, [mpPlayers]);

  const handlePing = useCallback(() => {
    const p = playerPosRef.current;
    mpBridge.ping(p.x, p.y, p.z);
  }, []);

  const handlePickLevel = useCallback(
    (id: MissionId) => {
      startLevel(id);
    },
    [startLevel]
  );

  const confirmBuildingName = useCallback(() => {
    if (!pendingBuild) return;
    const name = buildName.trim() || getPlan(pendingBuild.plan).name;
    const rec: NamedBuilding = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      plan: pendingBuild.plan,
      x: pendingBuild.x,
      y: pendingBuild.y,
      z: pendingBuild.z,
    };
    setNamedBuildings((prev) => {
      const next = [...prev, rec];
      saveBuildings(account.id, next);
      return next;
    });
    const mid = activeMissionRef.current;
    if (mid) {
      const def = getMission(mid);
      if (def.kind === 'build' && (!def.plan || def.plan === pendingBuild.plan)) {
        setMissionCount((c) => c + 1);
      }
    }
    setPendingBuild(null);
    showToast(`${name} complete.`);
    if (!touchMode) canvasElRef.current?.requestPointerLock();
  }, [pendingBuild, buildName, account.id, showToast, touchMode]);

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

  const gameTree = (
    <div
      data-testid="game-root"
      style={{ width: '100vw', height: '100vh', position: 'relative', background: '#87CEEB' }}
    >
      <KeyboardControls map={keyMap}>
        {/* The root-commit-rate gate (task 14.7, <=10 root game commits/sec
            during steady movement) is exercised by the Playwright e2e suite in
            tests/e2e/, which wraps this tree in a React Profiler via the
            test-only commit probe below. The HUD sampler unit/property tests
            (Properties 15/16) remain the deterministic in-process coverage. */}
        <Canvas
          gl={{
            antialias: profile.antialias,
            failIfMajorPerformanceCaveat: false,
          }}
          dpr={profile.dpr ?? undefined}
          onCreated={handleCreated}
          camera={{ fov: 75, near: 0.05, far: 500, position: [8, 18, 8] }}
          shadows={profile.shadows}
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
              planId={playStance === 'build' ? selectedPlan : null}
              namedBuildings={namedBuildings}
              profile={profile}
            />
            {mode === 'multi' && mpClientRef.current && (
              <RemotePlayers client={mpClientRef.current} yawRef={mpYawRef} />
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
        onAbandonMission={abandonMission}
        onOpenLevels={mode === 'free' ? undefined : () => setShowLevelSelect(true)}
        mode={mode}
        onPing={handlePing}
        nearbyPlayers={nearbyPlayers}
        mpStatus={mode === 'multi' ? mpStatus : undefined}
        dead={showDeath}
        selectedPlan={selectedPlan}
        onSelectPlan={setSelectedPlan}
      />

      {started && !showDeath && !paused && showLevelSelect && mode !== 'free' && (
        <LevelSelect
          items={levelItems}
          subtitle={
            mode === 'multi'
              ? 'Pick a box. Everyone races the same clock — first to finish wins.'
              : 'Pick a numbered box. Finish the objective before time runs out.'
          }
          onPick={handlePickLevel}
          onClose={activeMission ? () => setShowLevelSelect(false) : onMenu}
        />
      )}

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

      <TouchControls
        enabled={touchMode && started && !showDeath && !paused && !shopOpen && !showLevelSelect && !pendingBuild}
        stance={playStance}
        driving={!!carInfo}
      />

      {isMulti && (
        <>
          <EventFeed />
          <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} myUsername={account.username} />
          <PlayersPanel open={playersOpen} myUsername={account.username} myScore={score} />
          {started && !showDeath && <EmoteBar touchMode={touchMode} />}
        </>
      )}

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
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#ffd76a' }}>Weapon Shop</div>
              <div style={{ fontSize: 14, color: '#8affc1' }}>{score} pts</div>
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
                    {owned ? (weapon === w.id ? 'Equipped' : 'Equip') : `${w.cost}`}
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

      {pendingBuild && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 480,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            fontFamily: 'monospace',
          }}
        >
          <div
            style={{
              background: '#12161f',
              border: '2px solid rgba(255,215,106,0.4)',
              borderRadius: 14,
              padding: 18,
              width: 'min(360px, 94vw)',
              color: 'white',
            }}
          >
            <div style={{ fontWeight: 'bold', color: '#ffd76a', marginBottom: 8 }}>Name this building</div>
            <div style={{ fontSize: 12, color: '#8a94a5', marginBottom: 10 }}>
              {getPlan(pendingBuild.plan).name} is up. Give it a name.
            </div>
            <input
              autoFocus
              value={buildName}
              maxLength={24}
              onChange={(e) => setBuildName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmBuildingName();
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)',
                background: '#0c1016',
                color: 'white',
                fontFamily: 'monospace',
                fontSize: 16,
                marginBottom: 12,
              }}
            />
            <button
              type="button"
              onClick={confirmBuildingName}
              style={{
                width: '100%',
                background: '#2e8b57',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '12px 14px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showDeath && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 500,
            color: 'white',
            fontFamily: 'monospace',
            flexDirection: 'column',
            gap: 16,
            pointerEvents: 'auto',
            touchAction: 'manipulation',
          }}
        >
          <div style={{ fontSize: 40, fontWeight: 'bold', color: '#ff4d4d' }}>YOU DIED</div>
          <div style={{ color: '#bbb' }}>The zombies got you.</div>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRespawn();
            }}
            style={{
              marginTop: 12,
              background: '#7CFC00',
              color: '#102',
              border: 'none',
              borderRadius: 8,
              padding: '14px 32px',
              fontSize: 18,
              fontWeight: 'bold',
              cursor: 'pointer',
              fontFamily: 'monospace',
              touchAction: 'manipulation',
              pointerEvents: 'auto',
            }}
          >
            Respawn
          </button>
        </div>
      )}
    </div>
  );

  if (commitProbe) {
    return (
      <Profiler id="game-root" onRender={recordCommit}>
        {gameTree}
      </Profiler>
    );
  }
  return gameTree;
}

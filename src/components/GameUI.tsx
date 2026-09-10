import { useState, type CSSProperties, type ReactNode } from 'react';
import { BlockType } from '../game/terrain';
import { BLOCK_COLORS, BLOCK_NAMES, PLACEABLE_BLOCKS } from '../game/blockColors';
import { WEAPONS, type WeaponType } from '../game/combat';
import { CAR_SPECS, type CarInfo, type CarKind } from '../game/cars';
import { RIDE_SPECS, type RideableKind } from '../game/animals';
import type { PlayStance } from './TouchControls';
import { BlockCube, HudIcon, HudRoundButton, WEAPON_GLYPH } from './HudIcons';
import * as THREE from 'three';

const Z = 200;

const chromeBtn: CSSProperties = {
  background: 'rgba(0,0,0,0.55)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: 13,
  touchAction: 'none',
};

export interface ObjectiveInfo {
  title: string;
  detail: string;
}

export interface NearbyPlayer {
  name: string;
  dist: number;
}

export type NearCar = { kind: CarKind; broken: boolean } | null;

interface GameUIProps {
  selectedBlock: BlockType;
  onSelectBlock: (b: BlockType) => void;
  position: THREE.Vector3;
  started: boolean;
  isLocked: boolean;
  touchMode: boolean;
  onToggleTouchMode: () => void;
  onStart: () => void;
  health: number;
  maxHealth: number;
  weapon: WeaponType;
  onSelectWeapon: (w: WeaponType) => void;
  carInfo: CarInfo | null;
  nearCar: NearCar;
  onCarButton: () => void;
  onRepairButton: () => void;
  onMenu?: () => void;
  cameraMode: 'first' | 'third';
  onToggleCamera: () => void;
  score: number;
  ownedWeapons: ReadonlySet<WeaponType>;
  onOpenShop: () => void;
  night: boolean;
  onToggleNight: () => void;
  nearAnimal: RideableKind | null;
  riding: boolean;
  onRideButton: () => void;
  paused: boolean;
  onTogglePause: () => void;
  playStance: PlayStance;
  onPlayStance: (s: PlayStance) => void;
  nightLocked: boolean;
  objective: ObjectiveInfo | null;
  onAbandonMission: () => void;
  onOpenLevels?: () => void;
  mode: 'free' | 'levels' | 'multi';
  onPing: () => void;
  nearbyPlayers: NearbyPlayer[];
  mpStatus?: { status: 'connecting' | 'online' | 'offline'; count: number };
  dead?: boolean;
}

function Heart({ state, size = 18 }: { state: 'full' | 'half' | 'empty'; size?: number }) {
  const fill = state === 'empty' ? '#3a0a0a' : '#ff2a2a';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: 'drop-shadow(1px 1px 0 #000)' }}>
      <path
        d="M12 21s-7-4.5-9.5-9C.5 8 3 4 6.5 4c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 3.5 0 6 4 4 8-2.5 4.5-9.5 9-9.5 9z"
        fill={fill}
        stroke="#1a0000"
        strokeWidth="1.5"
      />
      {state === 'half' && (
        <path
          d="M12 21V7c-2-2-3.5-3-5.5-3C3 4 .5 8 2.5 12 5 16.5 12 21 12 21z"
          fill="#3a0a0a"
        />
      )}
    </svg>
  );
}

function Hearts({ health, maxHealth, size = 18 }: { health: number; maxHealth: number; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      {Array.from({ length: Math.ceil(maxHealth / 2) }).map((_, i) => {
        const slotMax = (i + 1) * 2;
        const state: 'full' | 'half' | 'empty' =
          health >= slotMax ? 'full' : health >= slotMax - 1 ? 'half' : 'empty';
        return <Heart key={i} state={state} size={size} />;
      })}
    </div>
  );
}

function SheetScrim({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 260,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
      }}
    >
      {children}
    </div>
  );
}

export function GameUI({
  selectedBlock,
  onSelectBlock,
  position,
  started,
  isLocked,
  touchMode,
  onToggleTouchMode,
  onStart,
  health,
  maxHealth,
  weapon,
  onSelectWeapon,
  carInfo,
  nearCar,
  onCarButton,
  onRepairButton,
  onMenu,
  cameraMode,
  onToggleCamera,
  score,
  ownedWeapons,
  onOpenShop,
  night,
  onToggleNight,
  nearAnimal,
  riding,
  onRideButton,
  paused,
  onTogglePause,
  playStance,
  onPlayStance,
  nightLocked,
  objective,
  onAbandonMission,
  onOpenLevels,
  mode,
  onPing,
  nearbyPlayers,
  mpStatus,
  dead,
}: GameUIProps) {
  const [pausePanel, setPausePanel] = useState<'root' | 'help'>('root');
  const [sheet, setSheet] = useState<null | 'block' | 'weapon'>(null);

  const playing = started && !dead && (touchMode || isLocked || paused);
  const driving = !!carInfo;

  let context: { title: string; glyph: 'exit' | 'car' | 'mount' | 'wrench'; color: string; action: () => void } | null = null;
  if (carInfo) {
    context = { title: 'Exit vehicle', glyph: 'exit', color: 'rgba(160,40,40,0.9)', action: onCarButton };
  } else if (riding) {
    context = { title: 'Dismount', glyph: 'exit', color: 'rgba(160,40,40,0.9)', action: onRideButton };
  } else if (nearCar && !nearCar.broken) {
    context = { title: `Drive ${CAR_SPECS[nearCar.kind].name}`, glyph: 'car', color: 'rgba(36,90,160,0.9)', action: onCarButton };
  } else if (nearAnimal) {
    context = { title: `Ride ${RIDE_SPECS[nearAnimal].name}`, glyph: 'mount', color: 'rgba(46,120,70,0.9)', action: onRideButton };
  } else if (nearCar?.broken) {
    context = { title: `Repair ${CAR_SPECS[nearCar.kind].name}`, glyph: 'wrench', color: 'rgba(160,120,30,0.9)', action: onRepairButton };
  }

  const openPause = () => {
    setPausePanel('root');
    setSheet(null);
    if (!paused) onTogglePause();
  };

  const closePause = () => {
    setPausePanel('root');
    if (paused) onTogglePause();
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 22,
          height: 22,
          pointerEvents: 'none',
          zIndex: 100,
        }}
      >
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.9)', transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.9)', transform: 'translateX(-50%)' }} />
      </div>

      {playing && (
        <div
          style={{
            position: 'fixed',
            top: 'calc(10px + env(safe-area-inset-top))',
            left: 'max(10px, env(safe-area-inset-left))',
            zIndex: Z,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(0,0,0,0.45)',
              padding: '5px 10px',
              borderRadius: 8,
            }}
          >
            <Hearts health={health} maxHealth={maxHealth} size={touchMode ? 16 : 20} />
            <div style={{ color: '#ffd76a', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 14, textShadow: '1px 1px 2px #000', display: 'flex', alignItems: 'center', gap: 4 }}>
              <HudIcon name="star" size={14} color="#ffd76a" />
              {score}
            </div>
          </div>
          {objective && (
            <div
              style={{
                background: 'rgba(8,16,10,0.72)',
                color: '#d8ffe0',
                fontFamily: 'monospace',
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid rgba(124,252,0,0.35)',
                maxWidth: 'min(280px, 70vw)',
                lineHeight: 1.4,
              }}
            >
              <div style={{ color: '#7CFC00', fontWeight: 'bold' }}>{objective.title}</div>
              <div>{objective.detail}</div>
            </div>
          )}
        </div>
      )}

      {playing && (
        <div
          style={{
            position: 'fixed',
            top: 'calc(10px + env(safe-area-inset-top))',
            right: 'max(10px, env(safe-area-inset-right))',
            zIndex: 300,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {mode === 'multi' && mpStatus && (
            <div
              style={{
                background: 'rgba(0,0,0,0.5)',
                color: mpStatus.status === 'online' ? '#8affc1' : mpStatus.status === 'connecting' ? '#ffd24d' : '#ff8a8a',
                padding: '6px 8px',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 12,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <HudIcon name="players" size={14} color="currentColor" />
              {mpStatus.status === 'online' ? mpStatus.count : mpStatus.status === 'connecting' ? '…' : 'off'}
            </div>
          )}
          <HudRoundButton glyph="shop" title="Shop" onPress={onOpenShop} size={42} accent="rgba(90,70,20,0.85)" glyphColor="#ffd76a" />
          <HudRoundButton glyph="pause" title="Pause" onPress={openPause} size={42} />
        </div>
      )}

      {playing && !touchMode && (
        <div
          style={{
            position: 'fixed',
            top: 'calc(10px + env(safe-area-inset-top))',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.55)',
            fontSize: 11,
            fontFamily: 'monospace',
            textShadow: '1px 1px 2px black',
            zIndex: Z,
            pointerEvents: 'none',
          }}
        >
          {position.x.toFixed(0)} {position.y.toFixed(0)} {position.z.toFixed(0)}
        </div>
      )}

      {carInfo && playing && (
        <div
          style={{
            position: 'fixed',
            top: 'calc(52px + env(safe-area-inset-top))',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            padding: '8px 14px',
            borderRadius: 8,
            zIndex: Z,
            fontFamily: 'monospace',
            fontSize: 13,
            border: '1px solid rgba(255,255,255,0.2)',
            textAlign: 'center',
            minWidth: 180,
            pointerEvents: 'none',
          }}
        >
          <div style={{ marginBottom: 4, color: '#ffd24d', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <HudIcon name="car" size={16} color="#ffd24d" />
            {CAR_SPECS[carInfo.kind].name}{carInfo.broken ? ' — BROKEN' : ''}
          </div>
          <div style={{ width: '100%', height: 8, background: '#3a0a0a', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(carInfo.health / carInfo.maxHealth) * 100}%`,
                height: '100%',
                background: carInfo.broken ? '#777' : carInfo.health / carInfo.maxHealth > 0.4 ? '#3ddc5a' : '#ff9f2a',
              }}
            />
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#bbb' }}>
            {carInfo.broken
              ? 'Exit and repair it'
              : touchMode
                ? 'Joystick to drive · BRAKE · EXIT'
                : 'WASD to drive · Space brake · E exit'}
          </div>
        </div>
      )}

      {!carInfo && nearCar && playing && !touchMode && (
        <Prompt>
          {nearCar.broken
            ? `Press R to repair the ${CAR_SPECS[nearCar.kind].name}`
            : `Press E to drive the ${CAR_SPECS[nearCar.kind].name}`}
        </Prompt>
      )}
      {!carInfo && !riding && !nearCar && nearAnimal && playing && !touchMode && (
        <Prompt>Press E to ride the {RIDE_SPECS[nearAnimal].name}</Prompt>
      )}

      {playing && touchMode && (
        <div
          style={{
            position: 'fixed',
            right: 'max(14px, env(safe-area-inset-right))',
            top: 'calc(62px + env(safe-area-inset-top))',
            zIndex: 220,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {!driving && (
            <HudRoundButton
              glyph={playStance === 'build' ? 'cube' : 'sword'}
              title={playStance === 'build' ? 'Build mode' : 'Fight mode'}
              onPress={() => {
                onPlayStance(playStance === 'fight' ? 'build' : 'fight');
                setSheet(null);
              }}
              size={50}
              active
              accent={playStance === 'build' ? 'rgba(40,90,50,0.9)' : 'rgba(90,40,40,0.9)'}
            />
          )}
          {!driving && (
            <HudRoundButton
              title={playStance === 'build' ? BLOCK_NAMES[selectedBlock] : (WEAPONS.find((w) => w.id === weapon)?.name ?? 'Weapon')}
              onPress={() => setSheet(playStance === 'build' ? 'block' : 'weapon')}
              size={54}
              active
            >
              {playStance === 'build' ? (
                <BlockCube color={BLOCK_COLORS[selectedBlock]} size={28} />
              ) : (
                <HudIcon name={WEAPON_GLYPH[weapon]} size={26} />
              )}
            </HudRoundButton>
          )}
          {context && (
            <HudRoundButton
              glyph={context.glyph}
              title={context.title}
              onPress={context.action}
              size={50}
              accent={context.color}
            />
          )}
        </div>
      )}

      {playing && !touchMode && (
        <>
          <div
            style={{
              position: 'fixed',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 4,
              background: 'rgba(0,0,0,0.5)',
              padding: '6px 8px',
              borderRadius: 8,
              zIndex: Z,
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {PLACEABLE_BLOCKS.map((block, i) => (
              <div
                key={block}
                onClick={() => onSelectBlock(block)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 6,
                  border: selectedBlock === block ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
                  background: BLOCK_COLORS[block],
                  cursor: 'pointer',
                  position: 'relative',
                  transform: selectedBlock === block ? 'scale(1.1)' : 'scale(1)',
                }}
                title={BLOCK_NAMES[block]}
              >
                <span style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              position: 'fixed',
              bottom: 20,
              right: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              zIndex: Z,
              background: 'rgba(0,0,0,0.5)',
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.15)',
              alignItems: 'center',
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'monospace' }}>[Q] Weapon</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {WEAPONS.map((w) => {
                const owned = ownedWeapons.has(w.id);
                return (
                  <div
                    key={w.id}
                    onClick={() => (owned ? onSelectWeapon(w.id) : onOpenShop())}
                    title={owned ? w.name : `${w.name} — ${w.cost} in the shop`}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 6,
                      border: weapon === w.id ? '2px solid #ffd24d' : '2px solid rgba(255,255,255,0.25)',
                      background: weapon === w.id ? 'rgba(255,210,77,0.15)' : 'rgba(255,255,255,0.06)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: weapon === w.id ? 'scale(1.1)' : 'scale(1)',
                      opacity: owned ? 1 : 0.55,
                    }}
                  >
                    {owned ? (
                      <HudIcon name={WEAPON_GLYPH[w.id]} size={22} />
                    ) : (
                      <>
                        <HudIcon name="lock" size={16} color="#8a94a5" />
                        <span style={{ fontSize: 8, color: '#ffd24d', fontFamily: 'monospace' }}>{w.cost}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {sheet === 'block' && (
        <SheetScrim onClose={() => setSheet(null)}>
          <div
            style={{
              background: 'rgba(12,14,18,0.95)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 12,
              padding: 10,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              maxWidth: '94vw',
              justifyContent: 'center',
            }}
          >
            {PLACEABLE_BLOCKS.map((block) => (
              <div
                key={block}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onSelectBlock(block);
                  setSheet(null);
                }}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 6,
                  border: selectedBlock === block ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
                  background: 'rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title={BLOCK_NAMES[block]}
              >
                <BlockCube color={BLOCK_COLORS[block]} size={30} />
              </div>
            ))}
          </div>
        </SheetScrim>
      )}

      {sheet === 'weapon' && (
        <SheetScrim onClose={() => setSheet(null)}>
          <div
            style={{
              background: 'rgba(12,14,18,0.95)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 12,
              padding: 10,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              maxWidth: '94vw',
              justifyContent: 'center',
            }}
          >
            {WEAPONS.map((w) => {
              const owned = ownedWeapons.has(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (owned) {
                      onSelectWeapon(w.id);
                      setSheet(null);
                    } else {
                      setSheet(null);
                      onOpenShop();
                    }
                  }}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    border: weapon === w.id ? '2px solid #ffd24d' : '2px solid rgba(255,255,255,0.2)',
                    background: owned ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.35)',
                    color: 'white',
                    fontSize: owned ? 24 : 14,
                    opacity: owned ? 1 : 0.6,
                    cursor: 'pointer',
                  }}
                  title={owned ? w.name : `${w.name} — shop`}
                >
                  {owned ? (
                    <HudIcon name={WEAPON_GLYPH[w.id]} size={26} />
                  ) : (
                    <HudIcon name="lock" size={22} color="#8a94a5" />
                  )}
                </button>
              );
            })}
          </div>
        </SheetScrim>
      )}

      {paused && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.62)',
            zIndex: 280,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            fontFamily: 'monospace',
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) closePause();
          }}
        >
          <div
            style={{
              background: '#12161f',
              border: '2px solid rgba(255,255,255,0.16)',
              borderRadius: 14,
              padding: '18px 18px 16px',
              color: 'white',
              width: 'min(380px, 94vw)',
              maxHeight: '86vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {pausePanel === 'root' && (
              <>
                <div style={{ fontSize: 18, fontWeight: 'bold', color: '#7CFC00' }}>Paused</div>
                {!touchMode && (
                  <div style={{ fontSize: 11, color: '#8a94a5' }}>
                    {position.x.toFixed(1)}, {position.y.toFixed(1)}, {position.z.toFixed(1)}
                  </div>
                )}
                {touchMode && (
                  <div style={{ fontSize: 11, color: '#8a94a5' }}>
                    X {position.x.toFixed(1)} · Y {position.y.toFixed(1)} · Z {position.z.toFixed(1)}
                  </div>
                )}
                <PauseBtn onClick={closePause} primary>Resume</PauseBtn>
                {onOpenLevels && (
                  <PauseBtn
                    onClick={() => {
                      closePause();
                      onOpenLevels();
                    }}
                  >
                    Levels
                  </PauseBtn>
                )}
                {objective && <PauseBtn onClick={onAbandonMission}>Forfeit level</PauseBtn>}
                {mode === 'multi' && (
                  <>
                    <PauseBtn onClick={onPing}>Ping here</PauseBtn>
                    <div style={{ fontSize: 12, color: '#8affc1', marginTop: 4 }}>Players</div>
                    {nearbyPlayers.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#8a94a5' }}>
                        {mpStatus?.status === 'online' ? 'No one else is here yet.' : 'Connecting…'}
                      </div>
                    ) : (
                      nearbyPlayers.map((p) => (
                        <div key={p.name} style={{ fontSize: 12, color: '#c8d4e0', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{p.name}</span>
                          <span style={{ color: '#8a94a5' }}>{p.dist < 1 ? '<1' : p.dist.toFixed(0)}m</span>
                        </div>
                      ))
                    )}
                  </>
                )}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
                <PauseBtn onClick={onToggleCamera}>
                  Camera · {cameraMode === 'first' ? '1st person' : '3rd person'}
                </PauseBtn>
                <PauseBtn onClick={onToggleNight} disabled={nightLocked}>
                  {night ? 'Night' : 'Day'}
                  {nightLocked ? ' · locked' : ''}
                </PauseBtn>
                <PauseBtn onClick={onToggleTouchMode}>
                  Controls · {touchMode ? 'Touch' : 'Mouse'}
                </PauseBtn>
                <PauseBtn onClick={() => setPausePanel('help')}>Help</PauseBtn>
                {onMenu && <PauseBtn onClick={onMenu}>Back to menu</PauseBtn>}
              </>
            )}
            {pausePanel === 'help' && (
              <>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#aef' }}>Controls</div>
                <HelpList touchMode={touchMode} />
                <PauseBtn onClick={() => setPausePanel('root')}>← Back</PauseBtn>
              </>
            )}
          </div>
        </div>
      )}

      {!started && (
        <div
          onClick={onStart}
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            zIndex: 200,
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              background: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '24px 40px',
              borderRadius: 12,
              textAlign: 'center',
              fontFamily: 'monospace',
              border: '2px solid rgba(255,255,255,0.2)',
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 8, color: '#7CFC00' }}>CRAFTWORLD</div>
            <div style={{ fontSize: 14, color: '#aaa', marginBottom: 16 }}>A Minecraft-like exploration game</div>
            <div style={{ fontSize: 16, color: '#fff' }}>{touchMode ? 'Tap to play' : 'Click to play'}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
              {touchMode
                ? 'Joystick to move • Drag to look • Pause for missions & settings'
                : 'WASD to move • Space to jump • Click to build • Esc for settings'}
            </div>
            {onMenu && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMenu();
                }}
                style={{
                  marginTop: 16,
                  background: 'rgba(255,255,255,0.12)',
                  color: '#ccc',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 8,
                  padding: '8px 20px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                }}
              >
                ← Back to menu
              </button>
            )}
          </div>
        </div>
      )}

      {started && !touchMode && !isLocked && !paused && (
        <div
          onClick={onStart}
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.28)',
            zIndex: 200,
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              background: 'rgba(0,0,0,0.75)',
              color: 'white',
              padding: '16px 28px',
              borderRadius: 10,
              fontFamily: 'monospace',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            Click to continue
          </div>
        </div>
      )}
    </>
  );
}

function Prompt({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '28%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.65)',
        color: '#ffd24d',
        padding: '8px 16px',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 14,
        border: '1px solid rgba(255,210,77,0.4)',
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      {children}
    </div>
  );
}

function PauseBtn({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...chromeBtn,
        width: '100%',
        textAlign: 'left',
        background: primary ? '#2e8b57' : 'rgba(255,255,255,0.06)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function HelpList({ touchMode }: { touchMode: boolean }) {
  const line: CSSProperties = { fontSize: 13, lineHeight: 1.8, color: '#d0d8e0' };
  if (touchMode) {
    return (
      <div style={line}>
        <div>Joystick — Move</div>
        <div>Drag empty screen — Look</div>
        <div>Jump / Attack / Place — actions</div>
        <div>Sword or cube on the right — Fight or Build</div>
        <div>Tap the item — switch block / weapon</div>
        <div>Car / mount / wrench — when nearby</div>
        <div>Pause — levels, camera, day/night</div>
        <div style={{ color: '#8affc1' }}>Kill zombies — earn points</div>
      </div>
    );
  }
  return (
    <div style={line}>
      <div>WASD — Move</div>
      <div>Space — Jump · handbrake in car</div>
      <div>Mouse — Look · Left click break/attack</div>
      <div>Right click — Place · 1–9 blocks · Q weapon</div>
      <div>B — Shop · E car/animal · R repair</div>
      <div>Esc — Pause (camera, day/night, levels)</div>
      <div style={{ color: '#8affc1' }}>Kill zombies — earn points</div>
      <div style={{ color: '#ffe9a8' }}>Lamplight repels zombies at night</div>
    </div>
  );
}

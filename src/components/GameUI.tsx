import { useState, type CSSProperties, type ReactNode } from 'react';
import { BlockType } from '../game/terrain';
import { BLOCK_COLORS, BLOCK_NAMES, PLACEABLE_BLOCKS } from '../game/blockColors';
import { WEAPONS, type WeaponType } from '../game/combat';
import { CAR_SPECS, type CarInfo, type CarKind } from '../game/cars';
import { RIDE_SPECS, type RideableKind } from '../game/animals';
import type { PlayStance } from './TouchControls';
import type { MissionId } from '../game/missions';
import type { RaidState } from '../game/mpBridge';
import * as THREE from 'three';

const WEAPON_ICONS: Record<WeaponType, string> = {
  hand: '✊',
  sword: '🗡️',
  axe: '🪓',
  katana: '⚔️',
  blaster: '🔫',
  shotgun: '💥',
  rifle: '🎯',
};

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

export interface MissionBoardItem {
  id: MissionId;
  title: string;
  blurb: string;
  hint: string;
  reward: number;
  status: 'locked' | 'available' | 'active' | 'done';
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
  missions: MissionBoardItem[];
  onStartMission: (id: MissionId) => void;
  onAbandonMission: () => void;
  showCampaignPrompt: boolean;
  onAcceptCampaign: () => void;
  onDismissCampaign: () => void;
  mode: 'free' | 'multi';
  raid: RaidState | null;
  nowMs: number;
  onStartRaid: () => void;
  onPing: () => void;
  nearbyPlayers: NearbyPlayer[];
  mpStatus?: { status: 'connecting' | 'online' | 'offline'; count: number };
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

function Chip({
  children,
  onClick,
  active,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 44,
        height: 44,
        borderRadius: 8,
        border: active ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
        background: 'rgba(0,0,0,0.45)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontFamily: 'monospace',
        padding: 0,
        touchAction: 'none',
        transform: active ? 'scale(1.06)' : 'scale(1)',
      }}
    >
      {children}
    </button>
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
  missions,
  onStartMission,
  onAbandonMission,
  showCampaignPrompt,
  onAcceptCampaign,
  onDismissCampaign,
  mode,
  raid,
  nowMs,
  onStartRaid,
  onPing,
  nearbyPlayers,
  mpStatus,
}: GameUIProps) {
  const [pausePanel, setPausePanel] = useState<'root' | 'missions' | 'help'>('root');
  const [sheet, setSheet] = useState<null | 'block' | 'weapon'>(null);

  const playing = started && (touchMode || isLocked || paused);
  const driving = !!carInfo;

  let context: { label: string; color: string; action: () => void } | null = null;
  if (carInfo) {
    context = { label: 'EXIT 🚗', color: 'rgba(200,60,60,0.82)', action: onCarButton };
  } else if (riding) {
    context = { label: 'OFF 🐾', color: 'rgba(200,60,60,0.82)', action: onRideButton };
  } else if (nearCar && !nearCar.broken) {
    context = { label: `DRIVE 🚗`, color: 'rgba(50,110,190,0.82)', action: onCarButton };
  } else if (nearAnimal) {
    context = { label: 'RIDE 🐾', color: 'rgba(80,160,80,0.82)', action: onRideButton };
  } else if (nearCar?.broken) {
    context = { label: 'FIX 🔧', color: 'rgba(190,150,40,0.82)', action: onRepairButton };
  }

  const raidActive = raid && raid.phase !== 'idle';
  const raidRemain = raid && (raid.phase === 'active' || raid.phase === 'rest')
    ? Math.max(0, Math.ceil((raid.endsAt - nowMs) / 1000))
    : 0;

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
            <div style={{ color: '#ffd76a', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 14, textShadow: '1px 1px 2px #000' }}>
              ⭐ {score}
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
                padding: '6px 10px',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 12,
                pointerEvents: 'none',
              }}
            >
              {mpStatus.status === 'online' ? `🌐 ${mpStatus.count}` : mpStatus.status === 'connecting' ? '🌐 …' : '🌐 off'}
            </div>
          )}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenShop();
            }}
            style={{ ...chromeBtn, background: 'rgba(201,165,61,0.4)', borderColor: 'rgba(255,215,106,0.5)' }}
          >
            🛒
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openPause();
            }}
            style={chromeBtn}
          >
            ☰
          </button>
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
          <div style={{ marginBottom: 4, color: '#ffd24d' }}>
            🚗 {CAR_SPECS[carInfo.kind].name}{carInfo.broken ? ' — BROKEN' : ''}
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

      {playing && touchMode && context && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            context!.action();
          }}
          style={{
            position: 'fixed',
            right: 'max(16px, env(safe-area-inset-right))',
            bottom: 'calc(176px + env(safe-area-inset-bottom))',
            zIndex: 220,
            background: context.color,
            color: 'white',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: 12,
            padding: '12px 16px',
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: 'pointer',
            touchAction: 'none',
            minWidth: 92,
          }}
        >
          {context.label}
        </button>
      )}

      {playing && touchMode && !driving && (
        <div
          style={{
            position: 'fixed',
            left: 'max(12px, env(safe-area-inset-left))',
            bottom: 'calc(10px + env(safe-area-inset-bottom))',
            zIndex: Z,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.18)',
              overflow: 'hidden',
            }}
          >
            {(['fight', 'build'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPlayStance(s);
                  setSheet(null);
                }}
                style={{
                  background: playStance === s ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: playStance === s ? '#fff' : '#9aa',
                  border: 'none',
                  padding: '8px 10px',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  touchAction: 'none',
                }}
              >
                {s === 'fight' ? '⚔️' : '🧱'}
              </button>
            ))}
          </div>
          {playStance === 'build' ? (
            <Chip title={BLOCK_NAMES[selectedBlock]} active onClick={() => setSheet('block')}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  background: BLOCK_COLORS[selectedBlock],
                  display: 'block',
                  border: '1px solid rgba(255,255,255,0.35)',
                }}
              />
            </Chip>
          ) : (
            <Chip
              title={WEAPONS.find((w) => w.id === weapon)?.name}
              active
              onClick={() => setSheet('weapon')}
            >
              <span style={{ fontSize: 22 }}>{WEAPON_ICONS[weapon]}</span>
            </Chip>
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
                    title={owned ? w.name : `${w.name} — ⭐ ${w.cost} in the shop`}
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
                      fontSize: owned ? 22 : 15,
                      transform: weapon === w.id ? 'scale(1.1)' : 'scale(1)',
                      opacity: owned ? 1 : 0.55,
                    }}
                  >
                    {owned ? WEAPON_ICONS[w.id] : (
                      <>
                        <span style={{ fontSize: 14 }}>🔒</span>
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
                  background: BLOCK_COLORS[block],
                }}
                title={BLOCK_NAMES[block]}
              />
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
                  {owned ? WEAPON_ICONS[w.id] : '🔒'}
                </button>
              );
            })}
          </div>
        </SheetScrim>
      )}

      {playing && showCampaignPrompt && !paused && (
        <div
          style={{
            position: 'fixed',
            top: '30%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 240,
            background: 'rgba(10,14,20,0.92)',
            border: '2px solid #7CFC00',
            borderRadius: 12,
            padding: '16px 18px',
            color: 'white',
            fontFamily: 'monospace',
            width: 'min(340px, 90vw)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#7CFC00', marginBottom: 8 }}>Start the campaign?</div>
          <div style={{ fontSize: 12, color: '#c8d4e0', lineHeight: 1.5, marginBottom: 12 }}>
            Eight missions in this city — park, zombies, a chest, a car, and a night stand.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button type="button" onClick={onAcceptCampaign} style={{ ...chromeBtn, background: '#2e8b57' }}>Start</button>
            <button type="button" onClick={onDismissCampaign} style={chromeBtn}>Later</button>
          </div>
        </div>
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
                <PauseBtn onClick={() => setPausePanel('missions')}>📜 Missions</PauseBtn>
                {mode === 'multi' && (
                  <>
                    <PauseBtn
                      onClick={onStartRaid}
                      disabled={!!raidActive && raid?.phase !== 'won' && raid?.phase !== 'failed'}
                    >
                      {raid?.phase === 'active'
                        ? `🌙 Raid wave ${raid.wave} · ${raid.kills}/${raid.goal} · ${raidRemain}s`
                        : raid?.phase === 'rest'
                          ? `🌙 Next wave in ${raidRemain}s`
                          : raid?.phase === 'won'
                            ? '🌙 Raid won'
                            : raid?.phase === 'failed'
                              ? '🌙 Raid failed — start again'
                              : '🌙 Start Night Raid'}
                    </PauseBtn>
                    <PauseBtn onClick={onPing}>📍 Ping here</PauseBtn>
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
                  {night ? '🌙 Night' : '☀️ Day'}
                  {nightLocked ? ' · locked' : ''}
                </PauseBtn>
                <PauseBtn onClick={onToggleTouchMode}>
                  Controls · {touchMode ? 'Touch' : 'Mouse'}
                </PauseBtn>
                <PauseBtn onClick={() => setPausePanel('help')}>? Help</PauseBtn>
                {onMenu && <PauseBtn onClick={onMenu}>🏠 Back to menu</PauseBtn>}
              </>
            )}
            {pausePanel === 'missions' && (
              <MissionBoard
                items={missions}
                onStart={onStartMission}
                onAbandon={onAbandonMission}
                onBack={() => setPausePanel('root')}
              />
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
                ? 'Joystick to move • Drag to look • ☰ for missions & settings'
                : 'WASD to move • Space to jump • Click to build • ☰ for settings'}
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

function MissionBoard({
  items,
  onStart,
  onAbandon,
  onBack,
}: {
  items: MissionBoardItem[];
  onStart: (id: MissionId) => void;
  onAbandon: () => void;
  onBack: () => void;
}) {
  const done = items.filter((i) => i.status === 'done').length;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#ffd76a' }}>Missions</div>
        <div style={{ fontSize: 12, color: '#8a94a5' }}>{done}/{items.length}</div>
      </div>
      {items.map((m) => (
        <div
          key={m.id}
          style={{
            background: m.status === 'active' ? 'rgba(124,252,0,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${m.status === 'active' ? '#7CFC00' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 8,
            padding: '8px 10px',
            opacity: m.status === 'locked' ? 0.45 : 1,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontWeight: 'bold', fontSize: 13 }}>
              {m.status === 'done' ? '✓ ' : m.status === 'locked' ? '🔒 ' : ''}
              {m.title}
            </div>
            <div style={{ color: '#ffd76a', fontSize: 11 }}>⭐ {m.reward}</div>
          </div>
          <div style={{ fontSize: 11, color: '#b8c4d0', marginTop: 4, lineHeight: 1.4 }}>{m.blurb}</div>
          {(m.status === 'available' || m.status === 'active') && (
            <div style={{ fontSize: 11, color: '#8affc1', marginTop: 4 }}>{m.hint}</div>
          )}
          {m.status === 'available' && (
            <button
              type="button"
              onClick={() => onStart(m.id)}
              style={{ ...chromeBtn, marginTop: 8, background: '#2e8b57', padding: '6px 10px', fontSize: 12 }}
            >
              Start
            </button>
          )}
          {m.status === 'active' && (
            <button
              type="button"
              onClick={onAbandon}
              style={{ ...chromeBtn, marginTop: 8, padding: '6px 10px', fontSize: 12 }}
            >
              Abandon
            </button>
          )}
        </div>
      ))}
      <PauseBtn onClick={onBack}>← Back</PauseBtn>
    </>
  );
}

function HelpList({ touchMode }: { touchMode: boolean }) {
  const line: CSSProperties = { fontSize: 13, lineHeight: 1.8, color: '#d0d8e0' };
  if (touchMode) {
    return (
      <div style={line}>
        <div>Joystick — Move</div>
        <div>Drag empty screen — Look</div>
        <div>JUMP / ATK / PLACE — actions</div>
        <div>⚔️ / 🧱 — Fight or Build</div>
        <div>Tap chip — switch block / weapon</div>
        <div>DRIVE / RIDE / FIX — when nearby</div>
        <div>☰ — Missions, camera, day/night</div>
        <div style={{ color: '#8affc1' }}>Kill zombies — earn ⭐ points</div>
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
      <div>Esc / ☰ — Pause (camera, day/night, missions)</div>
      <div style={{ color: '#8affc1' }}>Kill zombies — earn ⭐ points</div>
      <div style={{ color: '#ffe9a8' }}>Lamplight repels zombies at night</div>
    </div>
  );
}

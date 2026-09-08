import { useState } from 'react';
import { BlockType } from '../game/terrain';
import { BLOCK_COLORS, BLOCK_NAMES, PLACEABLE_BLOCKS } from '../game/blockColors';
import { WEAPONS, type WeaponType } from '../game/combat';
import { CAR_SPECS, type CarInfo, type CarKind } from '../game/cars';
import { RIDE_SPECS, type RideableKind } from '../game/animals';
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

interface GameUIProps {
  selectedBlock: BlockType;
  onSelectBlock: (b: BlockType) => void;
  position: THREE.Vector3;
  isLocked: boolean;
  touchMode: boolean;
  onToggleTouchMode: () => void;
  onStart: () => void;
  health: number;
  maxHealth: number;
  weapon: WeaponType;
  onSelectWeapon: (w: WeaponType) => void;
  carInfo: CarInfo | null;
  nearCar: CarKind | null;
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
}

function Heart({ state }: { state: 'full' | 'half' | 'empty' }) {
  const fill = state === 'empty' ? '#3a0a0a' : '#ff2a2a';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={{ filter: 'drop-shadow(1px 1px 0 #000)' }}>
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

export function GameUI({ selectedBlock, onSelectBlock, position, isLocked, touchMode, onToggleTouchMode, onStart, health, maxHealth, weapon, onSelectWeapon, carInfo, nearCar, onCarButton, onRepairButton, onMenu, cameraMode, onToggleCamera, score, ownedWeapons, onOpenShop, night, onToggleNight, nearAnimal, riding, onRideButton }: GameUIProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      {/* Crosshair */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 24,
        height: 24,
        pointerEvents: 'none',
        zIndex: 100,
      }}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: 2,
          background: 'rgba(255,255,255,0.9)',
          transform: 'translateY(-50%)',
        }} />
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 2,
          background: 'rgba(255,255,255,0.9)',
          transform: 'translateX(-50%)',
        }} />
      </div>

      {/* Health hearts */}
      <div style={{
        position: 'fixed',
        bottom: 100,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 2,
        zIndex: 100,
        background: 'rgba(0,0,0,0.35)',
        padding: '4px 8px',
        borderRadius: 6,
      }}>
        {Array.from({ length: Math.ceil(maxHealth / 2) }).map((_, i) => {
          const slotMax = (i + 1) * 2;
          const state: 'full' | 'half' | 'empty' =
            health >= slotMax ? 'full' : health >= slotMax - 1 ? 'half' : 'empty';
          return <Heart key={i} state={state} />;
        })}
      </div>

      {/* Hotbar */}
      <div style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        background: 'rgba(0,0,0,0.5)',
        padding: '6px 8px',
        borderRadius: 8,
        zIndex: 100,
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255,255,255,0.15)',
      }}>
        {PLACEABLE_BLOCKS.map((block, i) => (
          <div
            key={block}
            onClick={() => onSelectBlock(block)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 6,
              border: selectedBlock === block
                ? '2px solid #fff'
                : '2px solid rgba(255,255,255,0.25)',
              background: BLOCK_COLORS[block],
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              transition: 'transform 0.1s',
              transform: selectedBlock === block ? 'scale(1.1)' : 'scale(1)',
            }}
            title={BLOCK_NAMES[block]}
          >
            <span style={{
              position: 'absolute',
              bottom: 2,
              right: 4,
              fontSize: 10,
              color: 'rgba(255,255,255,0.7)',
              fontFamily: 'monospace',
            }}>{i + 1}</span>
          </div>
        ))}
      </div>

      {/* Weapon selector */}
      <div style={{
        position: 'fixed',
        bottom: 20,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        padding: '6px 8px',
        borderRadius: 8,
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255,255,255,0.15)',
        alignItems: 'center',
      }}>
        <div style={{
          color: 'rgba(255,255,255,0.7)',
          fontSize: 10,
          fontFamily: 'monospace',
        }}>
          [Q] Weapon
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {WEAPONS.map(w => {
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
                  border: weapon === w.id
                    ? '2px solid #ffd24d'
                    : '2px solid rgba(255,255,255,0.25)',
                  background: weapon === w.id ? 'rgba(255,210,77,0.15)' : 'rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: owned ? 22 : 15,
                  transition: 'transform 0.1s',
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
        <div style={{
          color: '#ffd24d',
          fontSize: 11,
          fontFamily: 'monospace',
        }}>
          {WEAPONS.find(w => w.id === weapon)?.name}
        </div>
      </div>

      {/* Car HUD (while driving) */}
      {carInfo && (
        <div style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          padding: '8px 14px',
          borderRadius: 8,
          zIndex: 100,
          fontFamily: 'monospace',
          fontSize: 13,
          border: '1px solid rgba(255,255,255,0.2)',
          textAlign: 'center',
          minWidth: 180,
        }}>
          <div style={{ marginBottom: 4, color: '#ffd24d' }}>
            🚗 {CAR_SPECS[carInfo.kind].name}{carInfo.broken ? ' — BROKEN' : ''}
          </div>
          <div style={{
            width: '100%',
            height: 8,
            background: '#3a0a0a',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${(carInfo.health / carInfo.maxHealth) * 100}%`,
              height: '100%',
              background: carInfo.broken ? '#777' : carInfo.health / carInfo.maxHealth > 0.4 ? '#3ddc5a' : '#ff9f2a',
              transition: 'width 0.2s',
            }} />
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#bbb' }}>
            {carInfo.broken ? 'Exit (E) and press R to repair' : touchMode ? 'Joystick to drive · CAR to exit' : 'WASD to drive · E to exit'}
          </div>
        </div>
      )}

      {/* Press E to drive prompt */}
      {!carInfo && nearCar && isLocked && (
        <div style={{
          position: 'fixed',
          bottom: '30%',
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
        }}>
          {touchMode ? `Tap CAR to drive the ${CAR_SPECS[nearCar].name}` : `Press E to drive the ${CAR_SPECS[nearCar].name}`}
        </div>
      )}

      {/* Press E to ride prompt */}
      {!carInfo && !riding && !nearCar && nearAnimal && isLocked && (
        <div style={{
          position: 'fixed',
          bottom: 150,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.6)',
          color: '#ffd76a',
          padding: '6px 14px',
          borderRadius: 8,
          fontFamily: 'monospace',
          fontSize: 13,
          zIndex: 30,
        }}>
          {touchMode ? `Tap RIDE to mount the ${RIDE_SPECS[nearAnimal].name}` : `Press E to ride the ${RIDE_SPECS[nearAnimal].name}`}
        </div>
      )}

      {/* Touch car buttons */}
      {touchMode && isLocked && (
        <div style={{
          position: 'fixed',
          right: 16,
          bottom: 300,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCarButton();
            }}
            style={{
              background: carInfo ? 'rgba(200,60,60,0.75)' : 'rgba(50,110,190,0.75)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 10,
              padding: '10px 14px',
              fontFamily: 'monospace',
              fontSize: 13,
              cursor: 'pointer',
              touchAction: 'none',
            }}
          >
            {carInfo ? 'EXIT 🚗' : 'CAR 🚗'}
          </button>
          {!carInfo && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRepairButton();
              }}
              style={{
                background: 'rgba(190,150,40,0.75)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 10,
                padding: '10px 14px',
                fontFamily: 'monospace',
                fontSize: 13,
                cursor: 'pointer',
                touchAction: 'none',
              }}
            >
              FIX 🔧
            </button>
          )}
          {!carInfo && (riding || nearAnimal) && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRideButton();
              }}
              style={{
                background: riding ? 'rgba(200,60,60,0.75)' : 'rgba(80,160,80,0.75)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 10,
                padding: '10px 14px',
                fontFamily: 'monospace',
                fontSize: 13,
                cursor: 'pointer',
                touchAction: 'none',
              }}
            >
              {riding ? 'OFF 🐾' : 'RIDE 🐾'}
            </button>
          )}
        </div>
      )}

      {/* Selected block label */}
      <div style={{
        position: 'fixed',
        bottom: 78,
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'white',
        fontSize: 12,
        fontFamily: 'monospace',
        textShadow: '1px 1px 2px black',
        background: 'rgba(0,0,0,0.3)',
        padding: '2px 8px',
        borderRadius: 4,
        zIndex: 100,
      }}>
        {BLOCK_NAMES[selectedBlock]}
      </div>

      {/* Coordinates */}
      <div style={{
        position: 'fixed',
        top: 16,
        left: 16,
        color: 'white',
        fontSize: 13,
        fontFamily: 'monospace',
        textShadow: '1px 1px 2px black',
        background: 'rgba(0,0,0,0.45)',
        padding: '6px 10px',
        borderRadius: 6,
        zIndex: 100,
        lineHeight: 1.6,
      }}>
        <div>X: {position.x.toFixed(1)}</div>
        <div>Y: {position.y.toFixed(1)}</div>
        <div>Z: {position.z.toFixed(1)}</div>
      </div>

      {/* Score */}
      <div style={{
        position: 'fixed',
        top: 96,
        left: 16,
        color: '#ffd76a',
        fontSize: 15,
        fontWeight: 'bold',
        fontFamily: 'monospace',
        textShadow: '1px 1px 2px black',
        background: 'rgba(0,0,0,0.45)',
        padding: '6px 10px',
        borderRadius: 6,
        zIndex: 100,
      }}>
        ⭐ {score}
      </div>

      {/* Top-right buttons */}
      <div style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 300,
        display: 'flex',
        gap: 8,
      }}>
        {onMenu && (
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMenu();
            }}
            style={{
              background: 'rgba(0,0,0,0.5)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              padding: '4px 12px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 13,
              touchAction: 'none',
            }}
          >
            🏠 Menu
          </button>
        )}
        <button
          onClick={onToggleTouchMode}
          style={{
            background: touchMode ? 'rgba(70,130,180,0.7)' : 'rgba(0,0,0,0.5)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
        >
          {touchMode ? '📱 Touch' : '🖱️ Mouse'}
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleCamera();
          }}
          style={{
            touchAction: 'none',
            background: 'rgba(0,0,0,0.5)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
        >
          {cameraMode === 'first' ? '👁️ 1st' : '🎥 3rd'}
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleNight();
          }}
          style={{
            touchAction: 'none',
            background: night ? 'rgba(40,50,90,0.7)' : 'rgba(0,0,0,0.5)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
        >
          {night ? '🌙 Night' : '☀️ Day'}
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenShop();
          }}
          style={{
            touchAction: 'none',
            background: 'rgba(201,165,61,0.35)',
            color: 'white',
            border: '1px solid rgba(255,215,106,0.5)',
            borderRadius: 6,
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
        >
          🛒 Shop
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowHelp(h => !h);
          }}
          style={{
            touchAction: 'none',
            background: 'rgba(0,0,0,0.5)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
        >
          {showHelp ? 'Close' : '? Help'}
        </button>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div style={{
          position: 'fixed',
          top: 52,
          right: 16,
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: 8,
          zIndex: 300,
          fontFamily: 'monospace',
          fontSize: 13,
          lineHeight: 2,
          border: '1px solid rgba(255,255,255,0.15)',
          minWidth: 200,
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#aef' }}>Controls</div>
          {touchMode ? (
            <>
              <div>Joystick — Move</div>
              <div>Drag right — Look</div>
              <div>JUMP button — Jump</div>
              <div>BREAK — Mine / Attack</div>
              <div>PLACE — Place block</div>
              <div>Tap hotbar — Select</div>
              <div>Tap weapon — Equip</div>
              <div>CAR — Enter/exit car</div>
              <div>FIX — Repair car</div>
              <div>👁️/🎥 — Change camera view</div>
              <div>🛒 — Weapon shop</div>
              <div style={{ color: '#8affc1' }}>Kill zombies — earn ⭐ points</div>
            </>
          ) : (
            <>
              <div>WASD — Move</div>
              <div>Space — Jump</div>
              <div>Mouse — Look around</div>
              <div>Left Click — Break / Attack</div>
              <div>Right Click — Place block</div>
              <div>1–9 — Select block</div>
              <div>Q — Switch weapon</div>
              <div>B — Weapon shop</div>
              <div>Hold Click — Auto rifle fire</div>
              <div>V — Change camera view</div>
              <div>N — Toggle day/night</div>
              <div>E — Enter/exit car · ride animal</div>
              <div>R — Repair car</div>
              <div>Space — Handbrake (in car)</div>
              <div style={{ color: '#8affc1' }}>Kill zombies — earn ⭐ points</div>
              <div style={{ color: '#ffe9a8' }}>Lamplight repels zombies at night</div>
              <div style={{ color: '#ffb86b' }}>You can fight from animal-back</div>
              <div>Click game — Lock mouse</div>
              <div>Esc — Unlock mouse</div>
            </>
          )}
        </div>
      )}

      {/* Click to play overlay */}
      {!isLocked && (
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
          <div style={{
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '24px 40px',
            borderRadius: 12,
            textAlign: 'center',
            fontFamily: 'monospace',
            border: '2px solid rgba(255,255,255,0.2)',
          }}>
            <div style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 8, color: '#7CFC00' }}>
              CRAFTWORLD
            </div>
            <div style={{ fontSize: 14, color: '#aaa', marginBottom: 16 }}>
              A Minecraft-like exploration game
            </div>
            <div style={{ fontSize: 16, color: '#fff' }}>
              {touchMode ? 'Tap to play' : 'Click to play'}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
              {touchMode
                ? 'Joystick to move • Drag to look • Tap buttons to build'
                : 'WASD to move • Space to jump • Click to build • V to change view'}
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
    </>
  );
}

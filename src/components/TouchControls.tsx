import { useEffect, useRef, useState } from 'react';
import { HudIcon, type HudGlyph } from './HudIcons';
import { createTouchController, type TouchController } from '../game/touchInput';

export type PlayStance = 'fight' | 'build';

export interface TouchState {
  moveX: number;
  moveY: number;
  lookDX: number;
  lookDY: number;
  jump: boolean;
  break: boolean;
  place: boolean;
}

// The single source of touch input truth. TouchControls' handlers drive this
// controller; Player/Cars/Animals read it (through the compatibility `touchState`
// view below) once per frame. Continuous state and action latches live in the
// controller — never in React state — so a held control never forces a commit.
export const touchController: TouchController = createTouchController();

// Backwards-compatible view: existing consumers read `touchState.moveX` etc.
// Every getter pulls a fresh NON-consuming snapshot from the controller, so
// there is no second store to drift and no read accidentally clears the
// look-delta accumulator (that is done only by consumeLookDelta).
export const touchState: TouchState = {
  get moveX() {
    return touchController.peek().moveX;
  },
  get moveY() {
    return touchController.peek().moveY;
  },
  get lookDX() {
    return touchController.peek().lookDX;
  },
  get lookDY() {
    return touchController.peek().lookDY;
  },
  get jump() {
    return touchController.peek().jump;
  },
  get break() {
    return touchController.peek().primary;
  },
  get place() {
    return touchController.peek().place;
  },
  // Writes are ignored: the controller is authoritative. Kept so the type and
  // any stray assignment stay valid without reintroducing a second store.
  set moveX(_v: number) {},
  set moveY(_v: number) {},
  set lookDX(_v: number) {},
  set lookDY(_v: number) {},
  set jump(_v: boolean) {},
  set break(_v: boolean) {},
  set place(_v: boolean) {},
} as unknown as TouchState;

export function consumeLookDelta(): { dx: number; dy: number } {
  const f = touchController.readFrame();
  return { dx: f.lookDX, dy: f.lookDY };
}

export function consumeBreak(): boolean {
  return touchController.consumeEdge('primary');
}

export function consumePlace(): boolean {
  return touchController.consumeEdge('place');
}

interface JoystickProps {
  onChange: (x: number, y: number) => void;
}

function Joystick({ onChange }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState({ x: 0, y: 0, active: false });
  const touchIdRef = useRef<number | null>(null);
  const RADIUS = 50;

  useEffect(() => {
    const handleMove = (e: TouchEvent) => {
      if (touchIdRef.current === null) return;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier === touchIdRef.current) {
          const base = baseRef.current;
          if (!base) return;
          const rect = base.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          let dx = t.clientX - cx;
          let dy = t.clientY - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > RADIUS) {
            dx = (dx / dist) * RADIUS;
            dy = (dy / dist) * RADIUS;
          }
          setStick({ x: dx, y: dy, active: true });
          onChange(dx / RADIUS, -dy / RADIUS);
          e.preventDefault();
          return;
        }
      }
    };

    const handleEnd = (e: TouchEvent) => {
      if (touchIdRef.current === null) return;
      let stillThere = false;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchIdRef.current) {
          stillThere = true;
          break;
        }
      }
      if (!stillThere) {
        touchIdRef.current = null;
        setStick({ x: 0, y: 0, active: false });
        onChange(0, 0);
      }
    };

    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [onChange]);

  const handleStart = (e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return;
    const t = e.changedTouches[0];
    touchIdRef.current = t.identifier;
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    setStick({ x: dx, y: dy, active: true });
    onChange(dx / RADIUS, -dy / RADIUS);
  };

  return (
    <div
      ref={baseRef}
      onTouchStart={handleStart}
      style={{
        position: 'fixed',
        left: 'max(12px, env(safe-area-inset-left))',
        bottom: 'calc(18px + env(safe-area-inset-bottom))',
        width: 112,
        height: 112,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.28)',
        border: '2px solid rgba(255,255,255,0.22)',
        zIndex: 210,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 52,
          height: 52,
          marginLeft: -26,
          marginTop: -26,
          borderRadius: '50%',
          background: stick.active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)',
          border: '2px solid rgba(255,255,255,0.7)',
          transform: `translate(${stick.x}px, ${stick.y}px)`,
          transition: stick.active ? 'none' : 'transform 0.15s',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function LookPad() {
  const padRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;

    const handleStart = (e: TouchEvent) => {
      if (touchRef.current !== null) return;
      const t = e.changedTouches[0];
      touchRef.current = { id: t.identifier, x: t.clientX, y: t.clientY };
      touchController.lookStart({ pointerId: t.identifier, clientX: t.clientX, clientY: t.clientY });
      e.preventDefault();
    };

    const handleMove = (e: TouchEvent) => {
      if (!touchRef.current) return;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier === touchRef.current.id) {
          touchController.lookPointer({ pointerId: t.identifier, clientX: t.clientX, clientY: t.clientY });
          touchRef.current.x = t.clientX;
          touchRef.current.y = t.clientY;
          e.preventDefault();
          return;
        }
      }
    };

    const handleEnd = (e: TouchEvent) => {
      if (!touchRef.current) return;
      let stillThere = false;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchRef.current.id) {
          stillThere = true;
          break;
        }
      }
      if (!stillThere) {
        touchController.lookEnd(touchRef.current.id);
        touchRef.current = null;
      }
    };

    pad.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
    return () => {
      pad.removeEventListener('touchstart', handleStart);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, []);

  return (
    <div
      ref={padRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        touchAction: 'none',
      }}
    />
  );
}

interface ActionButtonProps {
  glyph: HudGlyph;
  label: string;
  bottom: string;
  right: string;
  size?: number;
  color?: string;
  onPress: () => void;
  onRelease?: () => void;
}

function ActionButton({
  glyph,
  label,
  bottom,
  right,
  size = 64,
  color = 'rgba(0,0,0,0.4)',
  onPress,
  onRelease,
}: ActionButtonProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <div
      role="button"
      aria-label={label}
      onTouchStart={(e) => {
        e.preventDefault();
        setPressed(true);
        onPress();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        setPressed(false);
        onRelease?.();
      }}
      onTouchCancel={() => {
        setPressed(false);
        onRelease?.();
      }}
      style={{
        position: 'fixed',
        right,
        bottom,
        width: size,
        height: size,
        borderRadius: '50%',
        background: pressed ? 'rgba(255,255,255,0.45)' : color,
        border: '2px solid rgba(255,255,255,0.45)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 210,
        touchAction: 'none',
        userSelect: 'none',
        boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
      }}
    >
      <HudIcon name={glyph} size={Math.round(size * 0.42)} />
    </div>
  );
}

const SAFE_RIGHT = 'calc(16px + env(safe-area-inset-right))';
const SAFE_RIGHT_OFFSET = 'calc(88px + env(safe-area-inset-right))';
const SAFE_BOTTOM_LOW = 'calc(18px + env(safe-area-inset-bottom))';
const SAFE_BOTTOM_JUMP = 'calc(98px + env(safe-area-inset-bottom))';

interface TouchControlsProps {
  enabled: boolean;
  stance: PlayStance;
  driving: boolean;
}

export function TouchControls({ enabled, stance, driving }: TouchControlsProps) {
  if (!enabled) return null;

  return (
    <>
      <LookPad />
      <Joystick
        onChange={(x, y) => {
          touchController.setMove(x, y);
        }}
      />
      <ActionButton
        glyph={driving ? 'brake' : 'jump'}
        label={driving ? 'Brake' : 'Jump'}
        bottom={SAFE_BOTTOM_JUMP}
        right={SAFE_RIGHT}
        size={72}
        color={driving ? 'rgba(180,140,40,0.6)' : 'rgba(70,130,180,0.55)'}
        onPress={() => {
          touchController.actionDown('jump', BTN_POINTER);
        }}
        onRelease={() => {
          touchController.actionUp('jump', BTN_POINTER);
        }}
      />
      {!driving && (
        <ActionButton
          glyph="attack"
          label={stance === 'build' ? 'Break' : 'Attack'}
          bottom={SAFE_BOTTOM_LOW}
          right={SAFE_RIGHT_OFFSET}
          size={64}
          color="rgba(180,60,60,0.55)"
          onPress={() => {
            touchController.actionDown('primary', ATK_POINTER);
          }}
          onRelease={() => {
            touchController.actionUp('primary', ATK_POINTER);
          }}
        />
      )}
      {!driving && stance === 'build' && (
        <ActionButton
          glyph="place"
          label="Place"
          bottom={SAFE_BOTTOM_LOW}
          right={SAFE_RIGHT}
          size={64}
          color="rgba(60,150,80,0.55)"
          onPress={() => {
            // Place is a tap: down then immediate up leaves a consumable edge.
            touchController.actionDown('place', PLACE_POINTER);
            touchController.actionUp('place', PLACE_POINTER);
          }}
        />
      )}
    </>
  );
}

// Stable synthetic pointer ids for on-screen buttons (each button owns one).
const BTN_POINTER = { pointerId: -1, clientX: 0, clientY: 0 } as const;
const ATK_POINTER = { pointerId: -2, clientX: 0, clientY: 0 } as const;
const PLACE_POINTER = { pointerId: -3, clientX: 0, clientY: 0 } as const;

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 0)
  );
}

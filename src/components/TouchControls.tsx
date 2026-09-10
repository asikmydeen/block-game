import { useEffect, useRef, useState } from 'react';
import { HudIcon, type HudGlyph } from './HudIcons';

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

export const touchState: TouchState = {
  moveX: 0,
  moveY: 0,
  lookDX: 0,
  lookDY: 0,
  jump: false,
  break: false,
  place: false,
};

export function consumeLookDelta(): { dx: number; dy: number } {
  const dx = touchState.lookDX;
  const dy = touchState.lookDY;
  touchState.lookDX = 0;
  touchState.lookDY = 0;
  return { dx, dy };
}

export function consumeBreak(): boolean {
  if (touchState.break) {
    touchState.break = false;
    return true;
  }
  return false;
}

export function consumePlace(): boolean {
  if (touchState.place) {
    touchState.place = false;
    return true;
  }
  return false;
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
      e.preventDefault();
    };

    const handleMove = (e: TouchEvent) => {
      if (!touchRef.current) return;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier === touchRef.current.id) {
          const dx = t.clientX - touchRef.current.x;
          const dy = t.clientY - touchRef.current.y;
          touchState.lookDX += dx;
          touchState.lookDY += dy;
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
          touchState.moveX = x;
          touchState.moveY = y;
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
          touchState.jump = true;
        }}
        onRelease={() => {
          touchState.jump = false;
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
            touchState.break = true;
          }}
          onRelease={() => {
            touchState.break = false;
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
            touchState.place = true;
          }}
        />
      )}
    </>
  );
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 0)
  );
}

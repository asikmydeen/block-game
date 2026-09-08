import { useEffect, useRef, useState } from 'react';

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
        left: 24,
        bottom: 90,
        width: 130,
        height: 130,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.3)',
        border: '2px solid rgba(255,255,255,0.25)',
        zIndex: 150,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 56,
          height: 56,
          marginLeft: -28,
          marginTop: -28,
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

interface LookPadProps {}

function LookPad(_: LookPadProps) {
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
        right: 0,
        top: 0,
        width: '55%',
        height: '70%',
        zIndex: 140,
        touchAction: 'none',
      }}
    />
  );
}

interface ActionButtonProps {
  label: string;
  bottom: number;
  right: number;
  size?: number;
  color?: string;
  onPress: () => void;
  onRelease?: () => void;
  hold?: boolean;
}

function ActionButton({ label, bottom, right, size = 64, color = 'rgba(0,0,0,0.4)', onPress, onRelease, hold }: ActionButtonProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <div
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
        border: '2px solid rgba(255,255,255,0.5)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontSize: 13,
        fontWeight: 'bold',
        zIndex: 160,
        touchAction: 'none',
        userSelect: 'none',
        textShadow: '1px 1px 2px black',
      }}
    >
      {label}
    </div>
  );
}

interface TouchControlsProps {
  enabled: boolean;
}

export function TouchControls({ enabled }: TouchControlsProps) {
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
        label="JUMP"
        bottom={210}
        right={24}
        size={72}
        color="rgba(70,130,180,0.55)"
        onPress={() => { touchState.jump = true; }}
        onRelease={() => { touchState.jump = false; }}
      />
      <ActionButton
        label="BREAK"
        bottom={130}
        right={106}
        size={64}
        color="rgba(180,60,60,0.55)"
        onPress={() => { touchState.break = true; }}
      />
      <ActionButton
        label="PLACE"
        bottom={130}
        right={24}
        size={64}
        color="rgba(60,150,80,0.55)"
        onPress={() => { touchState.place = true; }}
      />
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

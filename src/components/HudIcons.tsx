import type { CSSProperties, ReactNode } from 'react';
import type { WeaponType } from '../game/combat';

/** Chunky filled HUD glyphs — same stroke, same weight, no emoji. */
export type HudGlyph =
  | 'fist'
  | 'sword'
  | 'axe'
  | 'katana'
  | 'blaster'
  | 'shotgun'
  | 'rifle'
  | 'cube'
  | 'jump'
  | 'attack'
  | 'place'
  | 'brake'
  | 'pause'
  | 'shop'
  | 'car'
  | 'mount'
  | 'wrench'
  | 'exit'
  | 'star'
  | 'players'
  | 'lock';

export const WEAPON_GLYPH: Record<WeaponType, HudGlyph> = {
  hand: 'fist',
  sword: 'sword',
  axe: 'axe',
  katana: 'katana',
  blaster: 'blaster',
  shotgun: 'shotgun',
  rifle: 'rifle',
};

const PATHS: Record<HudGlyph, ReactNode> = {
  fist: (
    <>
      <path d="M8 13.5c0-1.2.9-2.2 2-2.2h.4V10c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v.4h.3V9.6c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v1.2h.2V10.2c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v5.2c0 2.6-2 4.8-4.6 5.2H13c-2.8 0-5-2.2-5-5v-1.1z" />
      <path d="M8 14.2c-1.3 0-2.3-1-2.3-2.2S6.7 9.8 8 9.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </>
  ),
  sword: (
    <>
      <path d="M12.2 3.2l1.6 1.6-7.4 12.2-2.2.6.6-2.2L12.2 3.2z" />
      <path d="M6.2 16.4l1.8 1.8-2.6 1.2-1.2-1.2 2-1.8z" />
      <rect x="8.4" y="14.2" width="6.2" height="1.6" transform="rotate(-45 11.5 15)" />
    </>
  ),
  axe: (
    <>
      <path d="M13.2 3.4l7 7-2.2 1.2c-1.6 1.8-4.2 2-6.2.6L13.2 3.4z" />
      <path d="M4.4 20.2l8.6-8.6 1.6 1.6-8.6 8.6z" />
    </>
  ),
  katana: (
    <>
      <path d="M19.6 4.2c-4.6 1-10.8 6.4-14.2 13.2l-1.8.4.6-1.8C8.2 9.4 14 4.6 19.6 4.2z" />
      <path d="M5.2 17.8h5.6v1.6H5.2z" transform="rotate(28 8 18.6)" />
      <path d="M3.6 20.2l2.2 1.2-1 1.6-2.2-1z" />
    </>
  ),
  blaster: (
    <>
      <path d="M4 11.2h9.2v4.2H8.6L6.2 18H4v-6.8z" />
      <path d="M13.2 11.6h6.2v2.2c0 1.2-1 2.2-2.2 2.2h-4v-4.4z" />
      <rect x="6.2" y="9.4" width="3.2" height="1.8" rx="0.4" />
    </>
  ),
  shotgun: (
    <>
      <path d="M3.4 12.2h14.4v2.8H11L8.2 18.2H5.4l1.4-3.2H3.4z" />
      <path d="M17.8 11.4h3.2v4.4h-3.2z" />
      <path d="M12.4 10.2h4.2v1.2h-4.2z" />
    </>
  ),
  rifle: (
    <>
      <path d="M2.8 12.4h16.6v2.2H12.2L10 16.8H7.4l1.2-2.2H2.8z" />
      <path d="M19.4 11.6h2.4v3.6h-2.4z" />
      <path d="M8.6 10.6h3.4v1.8H8.6z" />
      <path d="M14.2 10.2h5.2v1.2h-5.2z" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3.6l8 4.4v8.8L12 21l-8-4.2V8z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3.6v8.8l8 4.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 12.4L4 8" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  jump: (
    <>
      <path d="M12 4.2l4.8 5.4h-3v4.2H10.2V9.6H7.2z" />
      <path d="M6 17.2h12v2.2H6z" />
    </>
  ),
  attack: (
    <>
      <path d="M13.4 3.4l1.4 1.4-8 13.2-2 .5.5-2L13.4 3.4z" />
      <path d="M7.2 16.6l5.4 1.4-3.6 2.4z" />
    </>
  ),
  place: (
    <>
      <path d="M11.1 5h1.8v14h-1.8z" />
      <path d="M5 11.1h14v1.8H5z" />
    </>
  ),
  brake: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8h8v8H8z" />
    </>
  ),
  pause: (
    <>
      <path d="M7 5h3.2v14H7z" />
      <path d="M13.8 5H17v14h-3.2z" />
    </>
  ),
  shop: (
    <>
      <path d="M5.2 8.4h13.6l-1.2 10.2H6.4z" />
      <path d="M8.2 8.2V7.2C8.2 5.2 9.8 3.8 12 3.8s3.8 1.4 3.8 3.4v1" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  car: (
    <>
      <path d="M5 13.2l1.6-4.2h10.8l1.6 4.2v4.2h-2.2v-1.2H7.2v1.2H5z" />
      <circle cx="8" cy="17.6" r="1.5" />
      <circle cx="16" cy="17.6" r="1.5" />
    </>
  ),
  mount: (
    <>
      <path d="M16.6 8.4c1.6 0 2.8 1.6 2.2 3.2l-1.6 4.2-2.2.6-1.2 4.4H12l.6-3.2-3.2-1.2L7.8 20H6.2l1.2-5.4L5.4 13l.8-1.8 3.4.6L11 8.8c.6-1.4 2-2.2 3.4-2.2 0 0 1.4.4 2.2 1.8z" />
    </>
  ),
  wrench: (
    <>
      <path d="M16.8 4.4l-2.2 2.2 1.6 1.6 2.2-2.2c.8.4 1.4 1.2 1.6 2.2-1.8.2-3.2 1.6-3.4 3.4l-7.8 7.8-3.2-3.2 7.8-7.8c1.8-.2 3.2-1.6 3.4-3.4 1 .2 1.8.8 2.2 1.6z" />
    </>
  ),
  exit: (
    <>
      <path d="M5 5h8v2.2H7.2v9.6H13V19H5z" />
      <path d="M12 11h7.2v2H12z" />
      <path d="M16.2 8.2L20.4 12l-4.2 3.8V8.2z" />
    </>
  ),
  star: (
    <path d="M12 3.4l2.2 5.4 5.8.4-4.4 3.8 1.4 5.6L12 15.8 6.9 18.6l1.4-5.6L4 9.2l5.8-.4z" />
  ),
  players: (
    <>
      <circle cx="9" cy="8.2" r="2.4" />
      <path d="M4.6 17.6c.4-3 2.2-4.6 4.4-4.6s4 1.6 4.4 4.6" />
      <circle cx="15.6" cy="8.8" r="2" />
      <path d="M13.4 17.6c.3-2.2 1.6-3.4 3.2-3.4 1.8 0 3.2 1.4 3.4 3.4" />
    </>
  ),
  lock: (
    <>
      <rect x="6.4" y="11" width="11.2" height="8.4" rx="1.4" />
      <path d="M8.6 11V8.8c0-1.9 1.5-3.4 3.4-3.4s3.4 1.5 3.4 3.4V11" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
};

export function HudIcon({
  name,
  size = 22,
  color = '#f4f1ea',
}: {
  name: HudGlyph;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      stroke="none"
      aria-hidden
      style={{ display: 'block', flexShrink: 0, color }}
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        {PATHS[name]}
      </g>
    </svg>
  );
}

export function BlockCube({ color, size = 22 }: { color: string; size?: number }) {
  const top = color;
  const left = shade(color, -0.22);
  const right = shade(color, -0.4);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'block' }}>
      <path d="M12 3.2l8 4.4-8 4.4-8-4.4z" fill={top} />
      <path d="M4 7.6l8 4.4v8.4L4 16z" fill={left} />
      <path d="M12 12l8-4.4v8.4L12 20.4z" fill={right} />
      <path d="M12 3.2l8 4.4v8.4L12 20.4 4 16V7.6z" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="0.8" />
    </svg>
  );
}

function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16);
    return Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  };
  const r = n(0).toString(16).padStart(2, '0');
  const g = n(2).toString(16).padStart(2, '0');
  const b = n(4).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

const roundBase: CSSProperties = {
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  touchAction: 'none',
  userSelect: 'none',
  padding: 0,
  flexShrink: 0,
};

export function HudRoundButton({
  glyph,
  title,
  onPress,
  size = 48,
  active,
  accent = 'rgba(18, 22, 28, 0.78)',
  glyphColor,
  children,
}: {
  glyph?: HudGlyph;
  title: string;
  onPress: () => void;
  size?: number;
  active?: boolean;
  accent?: string;
  glyphColor?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }}
      style={{
        ...roundBase,
        width: size,
        height: size,
        background: accent,
        border: active ? '2px solid #f0d789' : '2px solid rgba(255,255,255,0.28)',
        boxShadow: active
          ? '0 0 0 2px rgba(240,215,137,0.25), 0 4px 10px rgba(0,0,0,0.35)'
          : '0 4px 10px rgba(0,0,0,0.35)',
      }}
    >
      {children ?? <HudIcon name={glyph ?? 'sword'} size={Math.round(size * 0.48)} color={glyphColor} />}
    </button>
  );
}

// Task 10.2 (GREEN) — immutable runtime render-quality profiles.
//
// `selectRenderProfile` is a PURE function that runs BEFORE any Canvas / WebGL
// context is created. It maps an injected capability snapshot to a frozen,
// session-immutable RenderProfile. Desktop preserves every existing rendering
// value; mobile caps DPR, disables antialias, reduces shadows/bloom/stars, and
// bounds decorative lights to a single shared budget. It imports NO gameplay
// constants and mutates nothing outside its own returned object.

/** Injected description of the runtime's rendering capability. */
export interface CapabilitySnapshot {
  /** True when running inside the native (Capacitor) shell. */
  isNative: boolean;
  /** window.devicePixelRatio, if known. */
  devicePixelRatio?: number;
  /** navigator.hardwareConcurrency, if known. */
  hardwareConcurrency?: number;
}

export type RenderTier = 'mobile' | 'desktop';
export type ToneMapping = 'aces';
export type ShadowMapType = 'pcfsoft' | 'basic';

/** A frozen, session-wide rendering profile. */
export interface RenderProfile {
  readonly tier: RenderTier;
  readonly antialias: boolean;
  /** null = renderer default (uncapped); number = explicit capped DPR. */
  readonly dpr: number | null;
  readonly shadows: boolean;
  readonly shadowMapType: ShadowMapType;
  readonly shadowMapSize: number;
  readonly bloom: boolean;
  readonly bloomEnabled: boolean;
  /** Multiplier applied to the scene's base bloom intensity (1 = unchanged). */
  readonly bloomIntensityScale: number;
  readonly starCount: number;
  readonly toneMapping: ToneMapping;
  readonly toneMappingExposure: number;
  /** Max simultaneously-lit decorative (street-lamp) point lights. */
  readonly decorativeLightLimit: number;
}

/** Desktop star field size — must match the scene's historical value. */
export const DESKTOP_STAR_COUNT = 3000;

/** One shared decorative-light budget for the mobile tier. */
export const DECORATIVE_LIGHT_BUDGET = 8;

const DESKTOP_PROFILE: RenderProfile = Object.freeze({
  tier: 'desktop',
  antialias: true,
  dpr: null,
  shadows: true,
  shadowMapType: 'pcfsoft',
  shadowMapSize: 2048,
  bloom: true,
  bloomEnabled: true,
  bloomIntensityScale: 1,
  starCount: DESKTOP_STAR_COUNT,
  toneMapping: 'aces',
  toneMappingExposure: 1.15,
  decorativeLightLimit: Infinity,
});

const MOBILE_PROFILE: RenderProfile = Object.freeze({
  tier: 'mobile',
  antialias: false,
  dpr: 2,
  // Shadows disabled on mobile to stay within the frame budget; meshes/glow
  // remain visible because tone mapping and emissive materials are untouched.
  shadows: false,
  shadowMapType: 'basic',
  shadowMapSize: 512,
  // Bloom kept on but dialled down so glow reads without the full cost.
  bloom: true,
  bloomEnabled: true,
  bloomIntensityScale: 0.5,
  starCount: 800,
  toneMapping: 'aces',
  toneMappingExposure: 1.15,
  decorativeLightLimit: DECORATIVE_LIGHT_BUDGET,
});

/**
 * Select an immutable render profile from a capability snapshot. The native
 * shell selects the mobile tier; everything else preserves the full desktop
 * presentation.
 */
export function selectRenderProfile(snap: CapabilitySnapshot): RenderProfile {
  return snap.isNative ? MOBILE_PROFILE : DESKTOP_PROFILE;
}

/** A 2-D world-space point (a decorative-light candidate). */
export interface LightSpot {
  x: number;
  z: number;
}

/**
 * Choose up to `budget` candidates nearest to `center` (squared XZ distance).
 * The returned references are drawn from `spots`; ties keep the earlier index.
 * This is the single shared selection rule used by both the light budget and
 * its property test.
 */
export function selectNearestLights<T extends LightSpot>(
  spots: readonly T[],
  center: LightSpot,
  budget: number,
): T[] {
  if (budget <= 0 || spots.length === 0) return [];
  if (budget >= spots.length) return spots.slice();
  const scored = spots.map((s, i) => ({
    s,
    i,
    d: (s.x - center.x) ** 2 + (s.z - center.z) ** 2,
  }));
  scored.sort((a, b) => (a.d - b.d) || (a.i - b.i));
  return scored.slice(0, budget).map((e) => e.s);
}

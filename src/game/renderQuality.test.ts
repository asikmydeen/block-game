// Task 10.1 (RED) — runtime render-quality selection and decorative-light budget.
//
// These tests specify a PURE selection function that runs BEFORE any Canvas /
// WebGL context is created. It maps an injected capability snapshot (mobile vs
// desktop) to an IMMUTABLE render profile, and a shared decorative-light budget
// with nearest-candidate selection. No gameplay constants may be imported or
// mutated.

import { describe, it, expect } from 'vitest';
import {
  selectRenderProfile,
  selectNearestLights,
  DESKTOP_STAR_COUNT,
  DECORATIVE_LIGHT_BUDGET,
  type CapabilitySnapshot,
} from './renderQuality';

const desktopSnap: CapabilitySnapshot = {
  isNative: false,
  devicePixelRatio: 2,
  hardwareConcurrency: 16,
};

const mobileSnap: CapabilitySnapshot = {
  isNative: true,
  devicePixelRatio: 3,
  hardwareConcurrency: 6,
};

describe('selectRenderProfile — desktop preservation', () => {
  it('preserves every desktop rendering value', () => {
    const p = selectRenderProfile(desktopSnap);
    expect(p.tier).toBe('desktop');
    expect(p.antialias).toBe(true);
    expect(p.shadows).toBe(true);
    expect(p.shadowMapType).toBe('pcfsoft');
    expect(p.shadowMapSize).toBe(2048);
    expect(p.bloom).toBe(true);
    expect(p.bloomEnabled).toBe(true);
    expect(p.starCount).toBe(3000);
    expect(p.starCount).toBe(DESKTOP_STAR_COUNT);
    expect(p.toneMapping).toBe('aces');
    expect(p.toneMappingExposure).toBeCloseTo(1.15, 5);
    // Desktop keeps ALL decorative lights (no cap).
    expect(p.decorativeLightLimit).toBe(Infinity);
    // Desktop DPR is uncapped (renderer default): null means "let R3F decide".
    expect(p.dpr).toBeNull();
  });
});

describe('selectRenderProfile — mobile caps', () => {
  it('caps DPR, disables antialias, reduces shadows/bloom/stars/lights', () => {
    const p = selectRenderProfile(mobileSnap);
    expect(p.tier).toBe('mobile');
    expect(p.antialias).toBe(false);
    // shadows off OR reduced
    if (p.shadows) {
      expect(p.shadowMapSize).toBeLessThan(2048);
    } else {
      expect(p.shadows).toBe(false);
    }
    // bloom off OR reduced
    expect(p.bloomEnabled === false || p.bloomIntensityScale < 1).toBe(true);
    // star count reduced
    expect(p.starCount).toBeLessThan(DESKTOP_STAR_COUNT);
    expect(p.starCount).toBeGreaterThan(0);
    // decorative light limit <= 8
    expect(p.decorativeLightLimit).toBeLessThanOrEqual(8);
    expect(p.decorativeLightLimit).toBeGreaterThanOrEqual(0);
    // DPR capped to a finite number on mobile
    expect(typeof p.dpr).toBe('number');
    expect(p.dpr as number).toBeLessThanOrEqual(2);
    expect(p.dpr as number).toBeGreaterThan(0);
    // Mobile still uses ACES tone mapping (meshes/glow stay visible).
    expect(p.toneMapping).toBe('aces');
  });

  it('shares one decorative-light budget constant that equals the mobile limit', () => {
    const p = selectRenderProfile(mobileSnap);
    expect(DECORATIVE_LIGHT_BUDGET).toBeLessThanOrEqual(8);
    expect(p.decorativeLightLimit).toBe(DECORATIVE_LIGHT_BUDGET);
  });
});

describe('selectRenderProfile — immutability', () => {
  it('returns a deeply frozen session profile', () => {
    const p = selectRenderProfile(mobileSnap);
    expect(Object.isFrozen(p)).toBe(true);
    expect(() => {
      // @ts-expect-error runtime mutation must throw / be ignored under freeze
      p.antialias = true;
    }).toThrow();
    expect(selectRenderProfile(mobileSnap).antialias).toBe(false);
  });
});

describe('selectNearestLights — nearest-candidate selection', () => {
  const spots = [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
    { x: 5, z: 0 },
    { x: -3, z: 0 },
    { x: 50, z: 50 },
    { x: 1, z: 1 },
    { x: 2, z: 2 },
    { x: 8, z: 0 },
    { x: 9, z: 9 },
    { x: 200, z: 200 },
  ];

  it('never selects more than the budget', () => {
    const chosen = selectNearestLights(spots, { x: 0, z: 0 }, 8);
    expect(chosen.length).toBeLessThanOrEqual(8);
  });

  it('selects the budget-many nearest candidates to the center', () => {
    const center = { x: 0, z: 0 };
    const budget = 3;
    const chosen = selectNearestLights(spots, center, budget);
    expect(chosen.length).toBe(3);
    const chosenSet = new Set(chosen);
    const distanceTo = (s: { x: number; z: number }) =>
      (s.x - center.x) ** 2 + (s.z - center.z) ** 2;
    const maxChosen = Math.max(...chosen.map(distanceTo));
    // Every NON-chosen candidate must be at least as far as the farthest chosen.
    for (const s of spots) {
      if (!chosenSet.has(s)) {
        expect(distanceTo(s)).toBeGreaterThanOrEqual(maxChosen);
      }
    }
  });

  it('returns all candidates when budget exceeds count', () => {
    const few = [{ x: 0, z: 0 }, { x: 1, z: 1 }];
    expect(selectNearestLights(few, { x: 0, z: 0 }, 8).length).toBe(2);
  });

  it('returns nothing when budget is zero', () => {
    expect(selectNearestLights(spots, { x: 0, z: 0 }, 0).length).toBe(0);
  });
});

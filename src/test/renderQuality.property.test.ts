// Property test (task 10.3) — Feature: capacitor-mobile-app, Property 14:
// Runtime selection enforces quality-profile limits.
//
// Over generated capability snapshots, the selected profile always honours the
// tier's bounds: mobile caps DPR/antialias/shadows/bloom/stars and the shared
// decorative-light budget (<= 8); desktop preserves every full-quality value;
// nearest-candidate light selection never exceeds the budget and always picks
// the closest candidates to the center.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  selectRenderProfile,
  selectNearestLights,
  DESKTOP_STAR_COUNT,
  DECORATIVE_LIGHT_BUDGET,
  type CapabilitySnapshot,
} from '../game/renderQuality';

const snapshotArb: fc.Arbitrary<CapabilitySnapshot> = fc.record({
  isNative: fc.boolean(),
  devicePixelRatio: fc.float({ min: Math.fround(0.5), max: 4, noNaN: true }),
  hardwareConcurrency: fc.integer({ min: 1, max: 32 }),
});

describe('Feature: capacitor-mobile-app, Property 14: Runtime selection enforces quality-profile limits', () => {
  it('every selected profile honours its tier bounds and is immutable', () => {
    fc.assert(
      fc.property(snapshotArb, (snap) => {
        const p = selectRenderProfile(snap);
        expect(Object.isFrozen(p)).toBe(true);
        expect(p.toneMapping).toBe('aces');

        if (snap.isNative) {
          expect(p.tier).toBe('mobile');
          expect(p.antialias).toBe(false);
          expect(p.starCount).toBeGreaterThan(0);
          expect(p.starCount).toBeLessThan(DESKTOP_STAR_COUNT);
          expect(p.decorativeLightLimit).toBeLessThanOrEqual(8);
          expect(p.decorativeLightLimit).toBe(DECORATIVE_LIGHT_BUDGET);
          expect(typeof p.dpr).toBe('number');
          expect(p.dpr as number).toBeGreaterThan(0);
          expect(p.dpr as number).toBeLessThanOrEqual(2);
          // shadows off OR reduced map size
          expect(p.shadows === false || p.shadowMapSize < 2048).toBe(true);
          // bloom off OR reduced intensity scale
          expect(p.bloomEnabled === false || p.bloomIntensityScale < 1).toBe(true);
        } else {
          expect(p.tier).toBe('desktop');
          expect(p.antialias).toBe(true);
          expect(p.shadows).toBe(true);
          expect(p.shadowMapType).toBe('pcfsoft');
          expect(p.shadowMapSize).toBe(2048);
          expect(p.bloom).toBe(true);
          expect(p.bloomEnabled).toBe(true);
          expect(p.bloomIntensityScale).toBe(1);
          expect(p.starCount).toBe(3000);
          expect(p.toneMappingExposure).toBeCloseTo(1.15, 5);
          expect(p.decorativeLightLimit).toBe(Infinity);
          expect(p.dpr).toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });

  it('nearest-candidate light selection respects the budget and picks the closest', () => {
    const spotArb = fc.record({
      x: fc.integer({ min: -500, max: 500 }),
      z: fc.integer({ min: -500, max: 500 }),
    });
    fc.assert(
      fc.property(
        fc.array(spotArb, { minLength: 0, maxLength: 40 }),
        fc.record({ x: fc.integer({ min: -500, max: 500 }), z: fc.integer({ min: -500, max: 500 }) }),
        fc.integer({ min: 0, max: 8 }),
        (spots, center, budget) => {
          const chosen = selectNearestLights(spots, center, budget);
          expect(chosen.length).toBeLessThanOrEqual(budget);
          expect(chosen.length).toBe(Math.min(budget, spots.length));
          const d = (s: { x: number; z: number }) =>
            (s.x - center.x) ** 2 + (s.z - center.z) ** 2;
          if (chosen.length > 0 && chosen.length < spots.length) {
            const maxChosen = Math.max(...chosen.map(d));
            const chosenSet = new Set(chosen);
            for (const s of spots) {
              if (!chosenSet.has(s)) {
                expect(d(s)).toBeGreaterThanOrEqual(maxChosen);
              }
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

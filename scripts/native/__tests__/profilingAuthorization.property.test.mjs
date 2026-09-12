// Property test (task 14.6) — Feature: capacitor-mobile-app, Property 18:
// Advanced meshing authorization follows measured evidence.
//
// For any prerequisite status, per-device FPS, and ranked contributor profile,
// the gate emits exactly one allowed decision and:
//   - never authorizes unless prerequisites 8-10 are met AND a device misses
//     45 FPS AND a profile is present,
//   - authorizes iff chunk-generation or mesh-construction is BOTH top-three
//     AND >=20% of measured main-thread time,
//   - otherwise stays deferred/optimize and names the true largest contributor.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';

import { DECISIONS, decideAdvancedMeshing } from '../profiling-gate.mjs';

const NAMES = ['chunk-generation', 'mesh-construction', 'physics', 'render', 'gc', 'interpolation'];
const MESHING = new Set(['chunk-generation', 'mesh-construction']);

const contributorArb = fc.record({
  name: fc.constantFrom(...NAMES),
  percent: fc.integer({ min: 0, max: 60 }),
});

describe('Feature: capacitor-mobile-app, Property 18: Advanced meshing authorization follows measured evidence', () => {
  it('profiling and separate-scope decisions follow the thresholds exactly', () => {
    fc.assert(
      fc.property(
        fc.record({ req8: fc.boolean(), req9: fc.boolean(), req10: fc.boolean() }),
        fc.record({ ios: fc.integer({ min: 20, max: 60 }), android: fc.integer({ min: 20, max: 60 }) }),
        // Either no profile, or a non-empty unique-name contributor list.
        fc.option(
          fc.uniqueArray(contributorArb, { minLength: 1, maxLength: 6, selector: (c) => c.name }),
          { nil: undefined },
        ),
        (prerequisites, fps, contributors) => {
          const profile = contributors ? { contributors } : undefined;
          const result = decideAdvancedMeshing({ prerequisites, fps, profile });

          // Always exactly one allowed decision.
          assert.ok(DECISIONS.includes(result.decision));

          const prereqMet = prerequisites.req8 && prerequisites.req9 && prerequisites.req10;
          const misses = fps.ios < 45 || fps.android < 45;

          if (!prereqMet || !misses) {
            assert.equal(result.decision, 'deferred');
            return;
          }
          // Prereqs met and a device misses FPS.
          if (!profile) {
            assert.equal(result.decision, 'profile-required');
            return;
          }

          const ranked = [...contributors].sort((a, b) => b.percent - a.percent);
          const topThree = new Set(ranked.slice(0, 3).map((c) => c.name));
          const authorized = ranked.some(
            (c) => MESHING.has(c.name) && topThree.has(c.name) && c.percent >= 20,
          );

          if (authorized) {
            assert.equal(result.decision, 'separate-meshing-evaluation-authorized');
          } else {
            assert.equal(result.decision, 'optimize-largest-contributor');
            assert.equal(result.largestContributor, ranked[0].name);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never emits an implementation directive — only scope decisions', () => {
    fc.assert(
      fc.property(fc.constantFrom(...NAMES), fc.integer({ min: 20, max: 60 }), (name, percent) => {
        const result = decideAdvancedMeshing({
          prerequisites: { req8: true, req9: true, req10: true },
          fps: { ios: 40, android: 47 },
          profile: { contributors: [{ name, percent }] },
        });
        assert.ok(!('workerImplementation' in result));
        assert.ok(!('greedyImplementation' in result));
        assert.ok(DECISIONS.includes(result.decision));
      }),
      { numRuns: 100 },
    );
  });
});

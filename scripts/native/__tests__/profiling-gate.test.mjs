// RED (task 14.4): the profiling gate is a PURE, decision-only validator for
// whether advanced meshing (Worker/Greedy) may be separately scoped.
//
// These tests fail today because `scripts/native/profiling-gate.mjs` does not
// exist. They pin Requirement 13:
//
//   13.1 meshing stays out of initial scope,
//   13.2 a main-thread CPU profile is REQUIRED only when a device misses 45 FPS
//        AND prerequisite Requirements 8, 9, 10 are all satisfied,
//   13.3 separate-scope is authorized ONLY when chunk-generation OR
//        mesh-construction is BOTH top-three AND >=20% of measured main time,
//   13.4 otherwise meshing stays deferred,
//   13.5 when still unmet after profiling, prioritize the largest measured
//        contributor.
//
// The gate must emit EXACTLY ONE of:
//   deferred | profile-required | separate-meshing-evaluation-authorized
//   | optimize-largest-contributor
// and must NEVER invoke or add worker/greedy meshing implementation.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DECISIONS, decideAdvancedMeshing } from '../profiling-gate.mjs';

const PREREQS_MET = { req8: true, req9: true, req10: true };

// A helper: both devices meet FPS.
const FPS_OK = { ios: 46, android: 47 };

function contributors(list) {
  // list: array of { name, percent } in measured order (already ranked or not)
  return list;
}

describe('advanced-meshing profiling gate — decision-only', () => {
  test('exposes exactly the four allowed decision values', () => {
    assert.deepEqual(
      [...DECISIONS].sort(),
      [
        'deferred',
        'optimize-largest-contributor',
        'profile-required',
        'separate-meshing-evaluation-authorized',
      ].sort(),
    );
  });

  test('both devices meet 45 FPS -> deferred (no profiling needed)', () => {
    const result = decideAdvancedMeshing({ prerequisites: PREREQS_MET, fps: FPS_OK });
    assert.equal(result.decision, 'deferred');
  });

  test('a device misses FPS but prerequisites 8-10 are NOT all met -> deferred (never profile early)', () => {
    const result = decideAdvancedMeshing({
      prerequisites: { req8: true, req9: false, req10: true },
      fps: { ios: 40, android: 47 },
    });
    assert.equal(result.decision, 'deferred');
  });

  test('a device misses FPS with prerequisites met and NO profile yet -> profile-required', () => {
    const result = decideAdvancedMeshing({
      prerequisites: PREREQS_MET,
      fps: { ios: 40, android: 47 },
    });
    assert.equal(result.decision, 'profile-required');
  });

  test('profile shows chunk-generation top-three AND >=20% -> separate evaluation authorized', () => {
    const result = decideAdvancedMeshing({
      prerequisites: PREREQS_MET,
      fps: { ios: 40, android: 47 },
      profile: {
        contributors: contributors([
          { name: 'chunk-generation', percent: 24 },
          { name: 'physics', percent: 18 },
          { name: 'render', percent: 15 },
          { name: 'gc', percent: 10 },
        ]),
      },
    });
    assert.equal(result.decision, 'separate-meshing-evaluation-authorized');
  });

  test('mesh-construction top-three AND >=20% -> separate evaluation authorized', () => {
    const result = decideAdvancedMeshing({
      prerequisites: PREREQS_MET,
      fps: { ios: 40, android: 47 },
      profile: {
        contributors: contributors([
          { name: 'physics', percent: 30 },
          { name: 'mesh-construction', percent: 22 },
          { name: 'render', percent: 20 },
          { name: 'gc', percent: 8 },
        ]),
      },
    });
    assert.equal(result.decision, 'separate-meshing-evaluation-authorized');
  });

  test('chunk-generation is top-three but <20% -> defer, name the largest contributor', () => {
    const result = decideAdvancedMeshing({
      prerequisites: PREREQS_MET,
      fps: { ios: 40, android: 47 },
      profile: {
        contributors: contributors([
          { name: 'physics', percent: 40 },
          { name: 'render', percent: 25 },
          { name: 'chunk-generation', percent: 15 },
        ]),
      },
    });
    assert.equal(result.decision, 'optimize-largest-contributor');
    assert.equal(result.largestContributor, 'physics');
  });

  test('chunk-generation >=20% but NOT top-three -> optimize largest contributor (not authorized)', () => {
    const result = decideAdvancedMeshing({
      prerequisites: PREREQS_MET,
      fps: { ios: 40, android: 47 },
      profile: {
        contributors: contributors([
          { name: 'physics', percent: 30 },
          { name: 'render', percent: 28 },
          { name: 'gc', percent: 25 },
          { name: 'chunk-generation', percent: 22 },
        ]),
      },
    });
    assert.equal(result.decision, 'optimize-largest-contributor');
    assert.equal(result.largestContributor, 'physics');
  });

  test('the gate never returns a worker/greedy implementation directive or code', () => {
    const result = decideAdvancedMeshing({
      prerequisites: PREREQS_MET,
      fps: { ios: 40, android: 47 },
      profile: {
        contributors: [{ name: 'chunk-generation', percent: 50 }],
      },
    });
    // Authorization is only ever a SCOPE decision, never an implementation.
    assert.equal(result.decision, 'separate-meshing-evaluation-authorized');
    assert.ok(!('workerImplementation' in result));
    assert.ok(!('greedyImplementation' in result));
    assert.ok(DECISIONS.every((d) => !/implement|apply|enable-worker|enable-greedy/i.test(d)));
  });

  test('largest contributor is computed from measured percentages regardless of input order', () => {
    const result = decideAdvancedMeshing({
      prerequisites: PREREQS_MET,
      fps: { ios: 40, android: 47 },
      profile: {
        contributors: [
          { name: 'render', percent: 12 },
          { name: 'physics', percent: 41 },
          { name: 'gc', percent: 9 },
        ],
      },
    });
    assert.equal(result.largestContributor, 'physics');
  });
});

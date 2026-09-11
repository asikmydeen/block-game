// RED (task 14.1): release evidence schema validation + an all-or-nothing,
// fully diagnostic release-acceptance gate.
//
// These tests must fail today because `scripts/native/release-gate.mjs` and its
// evidence writers/validators do not exist yet. They pin the contract:
//
//   - the release manifest carries exact Capacitor / secure-storage pins, the
//     compatibility source + check date, qualifying upstream activity, endpoint
//     HOSTS ONLY (no secrets, no full URLs with credentials), native versions,
//     test commands, target devices/OS, the automation identity, and artifact
//     links + checksums — and NEVER a secret,
//   - every criterion 12.1–12.16 must be present and passing for acceptance,
//   - acceptance is all-or-nothing: one failed/missing criterion => rejected,
//   - a rejection enumerates EVERY failed/missing criterion ID (not just the
//     first), plus any build/lock hash or artifact checksum mismatch,
//   - stale evidence (build ID mismatch between candidate dir and manifest) is
//     rejected.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  REQUIRED_CRITERIA,
  validateReleaseManifest,
  evaluateReleaseCandidate,
} from '../release-gate.mjs';

const BUILD_ID = '2026-09-11T00-00-00Z-abc1234';

// A fully-populated, secret-free manifest for the fixture build.
function goodManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    buildId: BUILD_ID,
    capacitorVersion: '7.4.4',
    secureStorageVersion: '7.1.6',
    compatibility: {
      source: 'validation/mobile/dependency-compatibility.json',
      checkedAt: '2026-09-08T21:25:46.751Z',
      qualifyingUpstreamActivity:
        'https://github.com/aparajita/capacitor-secure-storage/commits',
    },
    endpointHosts: { api: 'api.example.com', webSocket: 'api.example.com' },
    nativeVersions: { ios: '17.0', androidMinSdk: 31 },
    testCommands: ['npm run typecheck', 'npx vitest run', 'npm run build'],
    devices: [
      { platform: 'ios', model: 'iPhone 13', os: '17.5' },
      { platform: 'android', model: 'Pixel 7', os: '14' },
    ],
    automationIdentity: 'ci-bot@release-pipeline',
    artifacts: [
      { name: 'ios.ipa', url: 'https://artifacts.example.com/ios.ipa', sha256: 'a'.repeat(64) },
      { name: 'android.aab', url: 'https://artifacts.example.com/android.aab', sha256: 'b'.repeat(64) },
    ],
    hashes: {
      lockfile: 'c'.repeat(64),
      webBuild: 'd'.repeat(64),
    },
    ...overrides,
  };
}

// A criterion-result set where every required criterion passes.
function allPass() {
  return REQUIRED_CRITERIA.map((id) => ({ id, status: 'pass', evidenceRef: `${id}.json` }));
}

describe('release manifest schema validation', () => {
  test('a complete secret-free manifest validates', () => {
    const result = validateReleaseManifest(goodManifest());
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.errors, []);
  });

  test('a missing required manifest field is reported by field name', () => {
    const m = goodManifest();
    delete m.capacitorVersion;
    const result = validateReleaseManifest(m);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /capacitorVersion/.test(e)));
  });

  test('an inexact (range) Capacitor pin is rejected', () => {
    const result = validateReleaseManifest(goodManifest({ capacitorVersion: '^7.4.4' }));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /capacitorVersion/.test(e)));
  });

  test('an endpoint given as a full URL (not a bare host) is rejected', () => {
    const result = validateReleaseManifest(
      goodManifest({ endpointHosts: { api: 'https://api.example.com/x', webSocket: 'api.example.com' } }),
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /endpointHosts\.api/.test(e)));
  });

  test('a secret embedded anywhere in the manifest is rejected', () => {
    const m = goodManifest({ automationIdentity: 'SUPABASE_SERVICE_ROLE=eyJabcdefghijklmnopqrstuvwxyz012345' });
    const result = validateReleaseManifest(m);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /secret/i.test(e)));
  });

  test('an artifact checksum that is not a 64-hex sha256 is rejected', () => {
    const m = goodManifest();
    m.artifacts[0].sha256 = 'not-a-hash';
    const result = validateReleaseManifest(m);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /sha256|checksum/i.test(e)));
  });
});

describe('all-or-nothing release acceptance gate', () => {
  test('accepts only when the manifest is valid AND every required criterion passes', () => {
    const result = evaluateReleaseCandidate({
      buildId: BUILD_ID,
      manifest: goodManifest(),
      criteria: allPass(),
    });
    assert.equal(result.accepted, true, JSON.stringify(result.failedCriteria));
    assert.deepEqual(result.failedCriteria, []);
    assert.deepEqual(result.missingCriteria, []);
  });

  test('rejects and enumerates EVERY failed criterion, not just the first', () => {
    const criteria = allPass();
    criteria[0].status = 'fail';
    criteria[3].status = 'fail';
    criteria[7].status = 'fail';
    const result = evaluateReleaseCandidate({ buildId: BUILD_ID, manifest: goodManifest(), criteria });
    assert.equal(result.accepted, false);
    assert.deepEqual(
      [...result.failedCriteria].sort(),
      [criteria[0].id, criteria[3].id, criteria[7].id].sort(),
    );
  });

  test('rejects and reports EVERY missing required criterion ID', () => {
    const criteria = allPass().filter((c) => c.id !== '12.5' && c.id !== '12.14');
    const result = evaluateReleaseCandidate({ buildId: BUILD_ID, manifest: goodManifest(), criteria });
    assert.equal(result.accepted, false);
    assert.deepEqual([...result.missingCriteria].sort(), ['12.14', '12.5'].sort());
  });

  test('rejects a stale candidate whose manifest build ID differs from the candidate dir', () => {
    const result = evaluateReleaseCandidate({
      buildId: 'a-different-build-id',
      manifest: goodManifest(),
      criteria: allPass(),
    });
    assert.equal(result.accepted, false);
    assert.ok(result.errors.some((e) => /build id|stale|mismatch/i.test(e)));
  });

  test('a single failed criterion is enough to reject an otherwise-complete candidate', () => {
    const criteria = allPass();
    criteria[criteria.length - 1].status = 'fail';
    const result = evaluateReleaseCandidate({ buildId: BUILD_ID, manifest: goodManifest(), criteria });
    assert.equal(result.accepted, false);
    assert.equal(result.failedCriteria.length, 1);
  });

  test('an invalid manifest rejects the candidate even when all criteria pass', () => {
    const bad = goodManifest();
    delete bad.artifacts;
    const result = evaluateReleaseCandidate({ buildId: BUILD_ID, manifest: bad, criteria: allPass() });
    assert.equal(result.accepted, false);
    assert.ok(result.errors.length > 0);
  });

  test('the required criteria set is exactly 12.1 through 12.16', () => {
    const expected = Array.from({ length: 16 }, (_, i) => `12.${i + 1}`);
    assert.deepEqual([...REQUIRED_CRITERIA].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3))), expected);
  });
});

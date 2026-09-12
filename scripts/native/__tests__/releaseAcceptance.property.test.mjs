// Property test (task 14.3) — Feature: capacitor-mobile-app, Property 17:
// Release acceptance is all-or-nothing and diagnostic.
//
// For any generated set of required-criterion results, the gate accepts iff a
// valid manifest is paired with a matching build ID AND every required
// criterion (12.1–12.16) is present and passing; and on rejection it reports
// EXACTLY the set of failed criterion IDs and EXACTLY the set of missing
// required criterion IDs — no more, no fewer.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';

import { REQUIRED_CRITERIA, evaluateReleaseCandidate } from '../release-gate.mjs';

const BUILD_ID = '2026-09-11T00-00-00Z-prop17';

function validManifest() {
  return {
    schemaVersion: 1,
    buildId: BUILD_ID,
    capacitorVersion: '7.4.4',
    secureStorageVersion: '7.1.6',
    compatibility: {
      source: 'validation/mobile/dependency-compatibility.json',
      checkedAt: '2026-09-08T21:25:46.751Z',
      qualifyingUpstreamActivity: 'https://github.com/aparajita/capacitor-secure-storage/commits',
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
    hashes: { lockfile: 'c'.repeat(64), webBuild: 'd'.repeat(64) },
  };
}

describe('Feature: capacitor-mobile-app, Property 17: Release acceptance is all-or-nothing and diagnostic', () => {
  it('accepts iff every required criterion passes, and reports exactly the failed/missing IDs otherwise', () => {
    // Per required criterion, choose one of: present+pass, present+fail, absent.
    const statusArb = fc.constantFrom('pass', 'fail', 'absent');
    fc.assert(
      fc.property(
        fc.array(statusArb, { minLength: REQUIRED_CRITERIA.length, maxLength: REQUIRED_CRITERIA.length }),
        (statuses) => {
          const criteria = [];
          const expectedFailed = [];
          const expectedMissing = [];
          REQUIRED_CRITERIA.forEach((id, i) => {
            const s = statuses[i];
            if (s === 'absent') {
              expectedMissing.push(id);
            } else {
              criteria.push({ id, status: s });
              if (s === 'fail') expectedFailed.push(id);
            }
          });

          const result = evaluateReleaseCandidate({
            buildId: BUILD_ID,
            manifest: validManifest(),
            criteria,
          });

          const shouldAccept = expectedFailed.length === 0 && expectedMissing.length === 0;
          assert.equal(result.accepted, shouldAccept);
          assert.deepEqual([...result.failedCriteria].sort(), [...expectedFailed].sort());
          assert.deepEqual([...result.missingCriteria].sort(), [...expectedMissing].sort());
        },
      ),
      { numRuns: 200 },
    );
  });

  it('an invalid manifest or a build-ID mismatch always rejects, regardless of criteria', () => {
    fc.assert(
      fc.property(fc.boolean(), (mismatch) => {
        const criteria = REQUIRED_CRITERIA.map((id) => ({ id, status: 'pass' }));
        const manifest = validManifest();
        delete manifest.artifacts; // invalid
        const result = evaluateReleaseCandidate({
          buildId: mismatch ? 'other-build' : BUILD_ID,
          manifest,
          criteria,
        });
        assert.equal(result.accepted, false);
        assert.ok(result.errors.length > 0);
      }),
      { numRuns: 100 },
    );
  });
});

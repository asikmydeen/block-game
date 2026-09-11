import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  CANONICAL_INPUTS,
  SKIP,
  checkConfigLayerDeterminism,
  hashInputs,
  planNativeSync,
  verifyIdempotent,
} from '../verify-idempotent.mjs';

const fakeRead = (map) => (rel) => (rel in map ? Buffer.from(map[rel]) : null);

describe('native idempotence check', () => {
  test('config-layer determinism passes for a stable reader', () => {
    const read = fakeRead({ 'capacitor.config.ts': 'A', 'package.json': '{}' });
    const result = checkConfigLayerDeterminism('/x', read);
    assert.equal(result.ok, true);
    assert.equal(result.first, result.second);
  });

  test('hashInputs is order-independent and content-sensitive', () => {
    const a = hashInputs('/x', ['a', 'b'], fakeRead({ a: '1', b: '2' }));
    const b = hashInputs('/x', ['b', 'a'], fakeRead({ a: '1', b: '2' }));
    const c = hashInputs('/x', ['a', 'b'], fakeRead({ a: '1', b: '3' }));
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  test('canonical inputs include the native config surface', () => {
    assert.ok(CANONICAL_INPUTS.includes('capacitor.config.ts'));
    assert.ok(CANONICAL_INPUTS.includes('validation/mobile/native-config.json'));
  });

  test('native sync is skipped (not failed) when the Capacitor CLI is absent', () => {
    const plan = planNativeSync({ hasCapacitorCli: false, existsFn: () => true });
    assert.equal(plan.action, 'skip');
  });

  test('native sync is skipped when no platform project is present', () => {
    const plan = planNativeSync({ hasCapacitorCli: true, existsFn: () => false });
    assert.equal(plan.action, 'skip');
  });

  test('native sync is runnable when CLI and a platform project are present', () => {
    const plan = planNativeSync({
      hasCapacitorCli: true,
      root: '/x',
      existsFn: (p) => p.endsWith('/ios'),
    });
    assert.equal(plan.action, 'run');
    assert.deepEqual(plan.platforms, ['ios']);
  });

  test('verifyIdempotent reports config determinism pass and native sync skip on a toolchain-absent host', () => {
    const report = verifyIdempotent({
      root: '/x',
      readFile: fakeRead({ 'capacitor.config.ts': 'A' }),
      syncPlan: { action: 'skip', reason: 'no generated native project present' },
    });
    assert.equal(report.ok, true);
    const determinism = report.results.find((r) => r.check === 'config-layer-determinism');
    assert.equal(determinism.status, 'pass');
    const sync = report.results.find((r) => r.check === 'native-sync-twice');
    assert.equal(sync.status, SKIP);
  });
});

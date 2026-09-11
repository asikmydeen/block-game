import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, test } from 'node:test';

import { SKIP_TOOLCHAIN } from '../native-exec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.resolve(here, '..');
const repoRoot = path.resolve(scriptsDir, '..', '..');

function runScript(name, args = [], env = {}) {
  return spawnSync('node', [path.join(scriptsDir, name), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe('native command wrappers', () => {
  test('build-ios exits cleanly with a toolchain-absent skip when ios/App is missing', () => {
    const r = runScript('build-ios.mjs');
    assert.equal(r.status, 0);
    assert.match(r.stdout, new RegExp(SKIP_TOOLCHAIN));
  });

  test('build-android exits cleanly with a toolchain-absent skip when android/ is missing', () => {
    const r = runScript('build-android.mjs', [], { ANDROID_HOME: '', ANDROID_SDK_ROOT: '' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, new RegExp(SKIP_TOOLCHAIN));
  });

  test('sync-native rejects an unknown platform with a nonzero exit', () => {
    const r = runScript('sync-native.mjs', ['windows']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unknown platform/);
  });

  test('sync-native skips cleanly for a named platform whose project is absent', () => {
    const r = runScript('sync-native.mjs', ['ios']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, new RegExp(SKIP_TOOLCHAIN));
  });
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

import { SKIP_TOOLCHAIN } from '../native-exec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.resolve(here, '..');
const repoRoot = path.resolve(scriptsDir, '..', '..');

function runScript(name, args = [], env = {}, cwd = repoRoot) {
  return spawnSync('node', [path.join(scriptsDir, name), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// The wrappers detect a generated native project via existsSync('ios/App') /
// 'android' RELATIVE TO CWD. To test the project-absent skip path
// deterministically — independent of whether the real repo has generated
// projects — run those cases from an empty temp dir.
function emptyCwd() {
  return mkdtempSync(path.join(tmpdir(), 'bg-native-'));
}

describe('native command wrappers', () => {
  test('build-ios exits cleanly with a toolchain-absent skip when ios/App is missing', () => {
    const r = runScript('build-ios.mjs', [], {}, emptyCwd());
    assert.equal(r.status, 0);
    assert.match(r.stdout, new RegExp(SKIP_TOOLCHAIN));
  });

  test('build-android exits cleanly with a toolchain-absent skip when android/ is missing', () => {
    const r = runScript('build-android.mjs', [], { ANDROID_HOME: '', ANDROID_SDK_ROOT: '' }, emptyCwd());
    assert.equal(r.status, 0);
    assert.match(r.stdout, new RegExp(SKIP_TOOLCHAIN));
  });

  test('sync-native rejects an unknown platform with a nonzero exit', () => {
    const r = runScript('sync-native.mjs', ['windows']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unknown platform/);
  });

  test('sync-native skips cleanly for a named platform whose project is absent', () => {
    const r = runScript('sync-native.mjs', ['ios'], {}, emptyCwd());
    assert.equal(r.status, 0);
    assert.match(r.stdout, new RegExp(SKIP_TOOLCHAIN));
  });
});

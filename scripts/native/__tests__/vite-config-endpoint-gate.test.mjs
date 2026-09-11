import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';

import { loadConfigFromFile } from 'vite';

// Behavior test for the native endpoint gate in vite.config.ts. It drives the
// *actual* config by asking Vite to load and evaluate it (loadConfigFromFile
// runs the exported defineConfig callback with a given command/mode) — never
// by inspecting source text and never by running a full bundle. The gate must
// fail closed for a native production build with missing endpoints, must leave
// the ordinary web build untouched, and must consult a Vite mode env source
// (`.env.<mode>`) so operators can supply overrides that way.

const CONFIG_FILE = fileURLToPath(new URL('../../../vite.config.ts', import.meta.url));
const PROJECT_ROOT = path.dirname(CONFIG_FILE);

const CONTROLLED_VARS = ['VITE_BUILD_TARGET', 'VITE_API_BASE_URL', 'VITE_WEBSOCKET_URL', 'NODE_ENV'];

function snapshotEnv() {
  const previous = {};
  for (const key of CONTROLLED_VARS) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
  }
  return previous;
}

function applyEnv(overrides) {
  for (const key of CONTROLLED_VARS) {
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function withEnv(overrides, fn) {
  const previous = snapshotEnv();
  applyEnv({ ...Object.fromEntries(CONTROLLED_VARS.map((k) => [k, undefined])), ...overrides });
  try {
    return await fn();
  } finally {
    applyEnv(previous);
  }
}

// Load and evaluate the real config for `command: 'build'` at the given mode.
// configRoot stays pinned to the project so esbuild bundling is stable even
// when a test temporarily changes the working directory.
function loadBuildConfig(mode) {
  return loadConfigFromFile({ command: 'build', mode }, CONFIG_FILE, PROJECT_ROOT);
}

describe('native endpoint gate in vite.config.ts', () => {
  test('rejects a native production build with missing endpoints, naming both variables', async () => {
    await withEnv({ VITE_BUILD_TARGET: 'native', NODE_ENV: 'production' }, async () => {
      await assert.rejects(
        () => loadBuildConfig('production'),
        (error) => {
          assert.match(error.message, /VITE_API_BASE_URL/);
          assert.match(error.message, /VITE_WEBSOCKET_URL/);
          // The message must not leak endpoint values (there are none here),
          // only variable names — keep the diagnostic secret-free.
          return true;
        },
      );
    });
  });

  test('loads a default web build with no endpoint overrides', async () => {
    await withEnv({ NODE_ENV: 'production' }, async () => {
      const loaded = await loadBuildConfig('production');
      assert.ok(loaded, 'expected the web build config to load');
      assert.equal(loaded.config.build.outDir, 'dist/public');
    });
  });

  test('accepts a valid native pair supplied through a Vite mode env source (.env.<mode>)', async () => {
    const mode = 'nativeprod';
    const envDir = mkdtempSync(path.join(os.tmpdir(), 'vite-endpoint-gate-'));
    writeFileSync(
      path.join(envDir, `.env.${mode}`),
      [
        'VITE_API_BASE_URL=https://api.example.com',
        'VITE_WEBSOCKET_URL=wss://api.example.com/api/mp',
        '',
      ].join('\n'),
    );

    const originalCwd = process.cwd();
    // The config resolves env with loadEnv(mode, process.cwd(), ''), so point
    // the working directory at the fixture dir to prove `.env.<mode>` is read.
    process.chdir(envDir);
    try {
      await withEnv({ VITE_BUILD_TARGET: 'native', NODE_ENV: 'production' }, async () => {
        const loaded = await loadBuildConfig(mode);
        assert.ok(loaded, 'expected the native build to load from the mode env source');
        assert.equal(loaded.config.build.outDir, 'dist/public');
      });
    } finally {
      process.chdir(originalCwd);
      rmSync(envDir, { recursive: true, force: true });
    }
  });
});

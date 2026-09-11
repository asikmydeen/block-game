import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, test } from 'node:test';

import { loadConfigFromFile } from 'vite';

// Behavioral integration test for the Vite config endpoint gate.
//
// `scripts/native/validate-endpoints.mjs` is unit-tested in isolation, but that
// proves nothing about whether the build actually invokes it. `loadConfigFromFile`
// evaluates `vite.config.ts` exactly as Vite does at the start of a build —
// including calling a function config with `{ command, mode }` — *before* any
// module transform runs. So if the config throws here, the real build aborts
// before bundling the client. That is the behavior we assert, not the text of
// the config file.

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..', '..');
const configFile = path.join(projectRoot, 'vite.config.ts');

const ENDPOINT_VARS = ['VITE_BUILD_TARGET', 'VITE_API_BASE_URL', 'VITE_WEBSOCKET_URL', 'NODE_ENV'];

function clearEndpointEnv() {
  for (const key of ENDPOINT_VARS) delete process.env[key];
}

async function loadBuildConfig(env, { mode = 'production' } = {}) {
  clearEndpointEnv();
  Object.assign(process.env, env);
  try {
    return await loadConfigFromFile({ command: 'build', mode }, configFile, projectRoot, 'silent');
  } finally {
    clearEndpointEnv();
  }
}

describe('vite production build endpoint gate', () => {
  afterEach(clearEndpointEnv);

  test('a native production build with no endpoints fails before transform, naming both variables', async () => {
    await assert.rejects(
      () => loadBuildConfig({ VITE_BUILD_TARGET: 'native' }),
      (error) => {
        assert.match(error.message, /VITE_API_BASE_URL/);
        assert.match(error.message, /VITE_WEBSOCKET_URL/);
        return true;
      },
    );
  });

  test('a native production build with insecure endpoints fails, naming the variables', async () => {
    await assert.rejects(
      () =>
        loadBuildConfig({
          VITE_BUILD_TARGET: 'native',
          VITE_API_BASE_URL: 'http://api.example.com',
          VITE_WEBSOCKET_URL: 'ws://api.example.com/api/mp',
        }),
      (error) => {
        assert.match(error.message, /VITE_API_BASE_URL/);
        assert.match(error.message, /VITE_WEBSOCKET_URL/);
        return true;
      },
    );
  });

  test('a native production build with a WebSocket path other than /api/mp fails, naming the socket variable', async () => {
    await assert.rejects(
      () =>
        loadBuildConfig({
          VITE_BUILD_TARGET: 'native',
          VITE_API_BASE_URL: 'https://api.example.com',
          VITE_WEBSOCKET_URL: 'wss://api.example.com/ws',
        }),
      (error) => {
        assert.match(error.message, /VITE_WEBSOCKET_URL/);
        return true;
      },
    );
  });

  test('the default web production build loads without endpoint overrides', async () => {
    const loaded = await loadBuildConfig({});
    assert.ok(loaded && loaded.config, 'default web build config must load');
  });

  test('a native production build with a valid HTTPS/WSS pair loads', async () => {
    const loaded = await loadBuildConfig({
      VITE_BUILD_TARGET: 'native',
      VITE_API_BASE_URL: 'https://api.example.com',
      VITE_WEBSOCKET_URL: 'wss://api.example.com/api/mp',
    });
    assert.ok(loaded && loaded.config, 'valid native build config must load');
  });
});

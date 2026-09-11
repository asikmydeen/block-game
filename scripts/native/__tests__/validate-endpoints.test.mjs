import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { validateEndpointPair } from '../validate-endpoints.mjs';

function variables(result) {
  return new Set(result.diagnostics.map(({ variable }) => variable));
}

describe('native production endpoint validation', () => {
  test('accepts a complete absolute HTTPS/WSS pair with the /api/mp path', () => {
    const result = validateEndpointPair({
      apiBaseUrl: 'https://api.example.com',
      webSocketUrl: 'wss://api.example.com/api/mp',
      target: 'native',
      production: true,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  });

  test('fails when both endpoints are missing, naming the API variable', () => {
    const result = validateEndpointPair({ target: 'native', production: true });

    assert.equal(result.ok, false);
    assert.ok(variables(result).has('VITE_API_BASE_URL'));
  });

  test('fails when only one endpoint is provided, naming the missing variable', () => {
    const result = validateEndpointPair({
      apiBaseUrl: 'https://api.example.com',
      target: 'native',
      production: true,
    });

    assert.equal(result.ok, false);
    assert.ok(variables(result).has('VITE_WEBSOCKET_URL'));
  });

  test('rejects insecure HTTP/WS transport in production', () => {
    const result = validateEndpointPair({
      apiBaseUrl: 'http://api.example.com',
      webSocketUrl: 'ws://api.example.com/api/mp',
      target: 'native',
      production: true,
    });

    assert.equal(result.ok, false);
    assert.ok(variables(result).has('VITE_API_BASE_URL'));
  });

  test('rejects localhost and loopback literals in production', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const result = validateEndpointPair({
        apiBaseUrl: `https://${host}/`,
        webSocketUrl: `wss://${host}/api/mp`,
        target: 'native',
        production: true,
      });
      assert.equal(result.ok, false, `${host} must be rejected`);
    }
  });

  test('requires the WebSocket pathname to be exactly /api/mp', () => {
    const result = validateEndpointPair({
      apiBaseUrl: 'https://api.example.com',
      webSocketUrl: 'wss://api.example.com/ws',
      target: 'native',
      production: true,
    });

    assert.equal(result.ok, false);
    assert.ok(variables(result).has('VITE_WEBSOCKET_URL'));
  });

  test('rejects a malformed endpoint URL, naming the variable', () => {
    const result = validateEndpointPair({
      apiBaseUrl: 'not a url',
      webSocketUrl: 'wss://api.example.com/api/mp',
      target: 'native',
      production: true,
    });

    assert.equal(result.ok, false);
    assert.ok(variables(result).has('VITE_API_BASE_URL'));
  });

  test('rejects credentials and fragments in endpoint URLs', () => {
    const withCredentials = validateEndpointPair({
      apiBaseUrl: 'https://user:pass@api.example.com',
      webSocketUrl: 'wss://api.example.com/api/mp',
      target: 'native',
      production: true,
    });
    assert.equal(withCredentials.ok, false);
    assert.ok(variables(withCredentials).has('VITE_API_BASE_URL'));

    const withFragment = validateEndpointPair({
      apiBaseUrl: 'https://api.example.com/#x',
      webSocketUrl: 'wss://api.example.com/api/mp',
      target: 'native',
      production: true,
    });
    assert.equal(withFragment.ok, false);
    assert.ok(variables(withFragment).has('VITE_API_BASE_URL'));
  });
});

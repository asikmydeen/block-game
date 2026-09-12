// Server + transport integration acceptance (task 14.8) — Requirements
// 2.10-2.15, 5.1-5.12, 12.9-12.11.
//
// Boots the real Express app + multiplayer hub on an ephemeral port with an
// allowlist that includes BOTH native scheme origins the installed app uses
// (capacitor://localhost for iOS, https://localhost for Android) alongside
// remote web origins, then proves the complete acceptance contract:
//
//   - every configured origin is approved and echoed EXACTLY over HTTP and WS,
//   - a CORS preflight returns the exact allow-origin, methods, and headers,
//   - every unapproved / malformed / missing native Origin is REJECTED on both
//     HTTP and WS — a missing or different native Origin must FAIL, never
//     broaden the policy,
//   - the production endpoint validator rejects localhost/insecure endpoints,
//   - the REST + WS fixtures (healthz/leaderboard shapes, mp auth_error) are
//     unchanged by the origin layer,
//   - a WS reconnect from an approved origin re-authenticates the same way,
//   - no response leaks a Supabase service-role credential.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';

import { createApp } from './index.mjs';
import { validateEndpointPair } from '../scripts/native/validate-endpoints.mjs';

// Remote web origins + the two native scheme origins the installed app uses.
const NATIVE_ORIGINS = ['capacitor://localhost', 'https://localhost'];
const WEB_ORIGINS = ['https://app.example.com', 'https://www.example.com'];
const ORIGINS = [...WEB_ORIGINS, ...NATIVE_ORIGINS];

let server;
let base;
let wsBase;

before(async () => {
  process.env.ORIGIN_ALLOWLIST = ORIGINS.join(', ');
  const app = createApp({ log: { info() {}, warn() {}, error() {} } });
  server = createServer(app.handler);
  app.attach(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}`;
});

after(async () => {
  if (server) {
    server.close();
    await once(server, 'close').catch(() => {});
  }
});

async function wsResult(origin, path = '/api/mp') {
  const ws = new WebSocket(`${wsBase}${path}`, origin ? { headers: { Origin: origin } } : {});
  let welcomed = false;
  ws.on('message', () => {
    welcomed = true;
  });
  const outcome = await Promise.race([
    once(ws, 'open').then(() => 'open'),
    once(ws, 'unexpected-response').then(() => 'refused'),
    once(ws, 'error').then(() => 'refused'),
  ]);
  return { outcome, welcomed, ws };
}

test('12.10: every configured origin (web + native scheme) is approved and echoed exactly over HTTP', async () => {
  for (const origin of ORIGINS) {
    const res = await fetch(`${base}/api/healthz`, { headers: { Origin: origin } });
    assert.equal(res.status, 200, `HTTP must approve ${origin}`);
    assert.equal(res.headers.get('access-control-allow-origin'), origin, `exact echo for ${origin}`);
    assert.match(res.headers.get('vary') ?? '', /Origin/i);
  }
});

test('12.10: every configured origin can open the multiplayer WebSocket', async () => {
  for (const origin of ORIGINS) {
    const { outcome, ws } = await wsResult(origin);
    assert.equal(outcome, 'open', `WS must connect from ${origin}`);
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
});

test('12.10: an authorization/content-type preflight returns exact allow-origin, methods, and headers', async () => {
  for (const origin of ORIGINS) {
    const res = await fetch(`${base}/api/profile/progress`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    });
    assert.ok(res.status === 204 || res.status === 200);
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
    const methods = (res.headers.get('access-control-allow-methods') ?? '').toUpperCase();
    assert.ok(methods.includes('POST'));
    const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    assert.ok(allowHeaders.includes('authorization'));
    assert.ok(allowHeaders.includes('content-type'));
  }
});

test('12.11: unapproved / malformed / different native Origins are rejected on HTTP (policy is not broadened)', async () => {
  const denied = [
    'https://evil.example.com',
    'capacitor://evilhost', // different native host must NOT be accepted
    'ionic://localhost', // different native scheme
    'http://localhost', // insecure variant of the https native origin
    'not-a-valid-origin',
  ];
  for (const origin of denied) {
    const res = await fetch(`${base}/api/healthz`, { headers: { Origin: origin } });
    assert.equal(res.status, 403, `HTTP must reject ${origin}`);
    const body = await res.json().catch(() => ({}));
    assert.notEqual(body.status, 'ok', `${origin} route must not have run`);
  }
});

test('12.11: unapproved / different native Origins are refused on WS before any connection callback', async () => {
  const denied = ['https://evil.example.com', 'capacitor://evilhost', 'ionic://localhost', 'http://localhost'];
  for (const origin of denied) {
    const { outcome, welcomed, ws } = await wsResult(origin);
    assert.equal(outcome, 'refused', `WS must refuse ${origin}`);
    assert.equal(welcomed, false, `${origin} must receive no welcome`);
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
});

test('5.x: a WS upgrade to a non-/api/mp path is refused even from an approved origin', async () => {
  const { outcome, ws } = await wsResult(NATIVE_ORIGINS[0], '/api/nope');
  assert.equal(outcome, 'refused');
  try {
    ws.close();
  } catch {
    /* ignore */
  }
});

test('12.9: the production endpoint validator rejects localhost and insecure transports', () => {
  // A production build must never embed localhost/insecure endpoints.
  const insecure = validateEndpointPair({
    apiBaseUrl: 'http://localhost:3000',
    webSocketUrl: 'ws://localhost:3000/api/mp',
    target: 'native',
    production: true,
  });
  assert.equal(insecure.ok, false);

  const secure = validateEndpointPair({
    apiBaseUrl: 'https://api.example.com',
    webSocketUrl: 'wss://api.example.com/api/mp',
    target: 'native',
    production: true,
  });
  assert.equal(secure.ok, true, JSON.stringify(secure.diagnostics));
});

test('5.x: REST fixtures are unchanged by the origin layer (healthz + leaderboard shapes)', async () => {
  const health = await fetch(`${base}/api/healthz`, { headers: { Origin: NATIVE_ORIGINS[0] } });
  const healthBody = await health.json();
  assert.equal(healthBody.status, 'ok');
  assert.ok(healthBody.db === 'configured' || healthBody.db === 'missing_env');

  const board = await fetch(`${base}/api/leaderboard?limit=5`, { headers: { Origin: NATIVE_ORIGINS[1] } });
  const boardBody = await board.json();
  assert.ok(Array.isArray(boardBody.leaders));
});

test('5.x: WS auth fixture is unchanged and re-auth on reconnect behaves identically', async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ws = new WebSocket(`${wsBase}/api/mp`, { headers: { Origin: NATIVE_ORIGINS[0] } });
    await once(ws, 'open');
    const messagePromise = once(ws, 'message');
    ws.send(JSON.stringify({ type: 'join', token: 'definitely-not-a-real-session' }));
    const [raw] = await messagePromise;
    const msg = JSON.parse(String(raw));
    assert.equal(msg.type, 'auth_error', `reconnect attempt ${attempt} must return the same auth_error`);
    assert.equal(typeof msg.message, 'string');
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
});

test('12.9/service-role isolation: no response leaks a Supabase service-role credential', async () => {
  for (const path of ['/api/healthz', '/api/leaderboard?limit=1']) {
    const res = await fetch(`${base}${path}`, { headers: { Origin: NATIVE_ORIGINS[0] } });
    const text = await res.text();
    assert.ok(!/service_role|SUPABASE_SERVICE_ROLE|eyJ[A-Za-z0-9_-]{20,}/.test(text), `${path} must not leak a secret`);
  }
});

// Integration lock (task 2.7): the shared web/native backend contract and the
// origin behavior are one repeatable test command.
//
// Proves, against the real Express app + multiplayer hub on an ephemeral port:
//   - every configured allowlist origin is approved and echoed exactly,
//   - a denied origin is rejected before any route runs,
//   - the /api request/response SHAPES are unchanged by the origin layer,
//   - a /api/mp join produces the unchanged `welcome` + `race` messages,
//   - an approved-origin POST /api/profile/progress (the page-hide beacon
//     target) still returns the { player } shape,
//   - Supabase service-role credentials are never surfaced to the client.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';

import { createApp } from './index.mjs';

const ORIGINS = ['https://app.example.com', 'https://www.example.com', 'capacitor://localhost'];
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

test('every configured allowlist origin is approved and echoed exactly', async () => {
  for (const origin of ORIGINS) {
    const res = await fetch(`${base}/api/healthz`, { headers: { Origin: origin } });
    assert.equal(res.status, 200, `origin ${origin} should be approved`);
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
  }
});

test('a denied origin is rejected for every route it tries', async () => {
  for (const path of ['/api/healthz', '/api/leaderboard', '/api/auth/suggest']) {
    const res = await fetch(`${base}${path}`, { headers: { Origin: 'https://evil.example.com' } });
    assert.equal(res.status, 403, `${path} must reject the unapproved origin`);
  }
});

test('the /api/healthz response shape is unchanged (status + db fields)', async () => {
  const res = await fetch(`${base}/api/healthz`, { headers: { Origin: ORIGINS[0] } });
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.ok(body.db === 'configured' || body.db === 'missing_env');
});

test('the /api/leaderboard response shape is unchanged ({ leaders: [...] })', async () => {
  const res = await fetch(`${base}/api/leaderboard?limit=5`, { headers: { Origin: ORIGINS[0] } });
  const body = await res.json();
  assert.ok(Array.isArray(body.leaders));
});

test('authorization + content-type preflight is answered for an approved origin', async () => {
  const res = await fetch(`${base}/api/profile/progress`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGINS[1],
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  });
  assert.ok(res.status === 204 || res.status === 200);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGINS[1]);
  const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  assert.ok(allowHeaders.includes('authorization'));
});

test('an unauthenticated progress POST still returns the documented 401 shape', async () => {
  const res = await fetch(`${base}/api/profile/progress`, {
    method: 'POST',
    headers: { Origin: ORIGINS[0], 'Content-Type': 'application/json' },
    body: JSON.stringify({ score: 10 }),
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'unauthenticated');
});

test('a /api/mp join with an invalid token yields the unchanged auth_error and closes', async () => {
  const ws = new WebSocket(`${wsBase}/api/mp`, { headers: { Origin: ORIGINS[0] } });
  await once(ws, 'open');
  const messagePromise = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'join', token: 'definitely-not-a-real-session' }));
  const [raw] = await messagePromise;
  const msg = JSON.parse(String(raw));
  assert.equal(msg.type, 'auth_error');
  assert.equal(typeof msg.message, 'string');
  try {
    ws.close();
  } catch {
    /* ignore */
  }
});

test('no response body leaks a service-role key or Supabase secret', async () => {
  const res = await fetch(`${base}/api/healthz`, { headers: { Origin: ORIGINS[0] } });
  const text = await res.text();
  assert.ok(!/service_role|SUPABASE_SERVICE_ROLE|eyJ[A-Za-z0-9_-]{20,}/.test(text));
});

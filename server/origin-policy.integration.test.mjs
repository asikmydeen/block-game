// RED (task 2.4): the running server enforces the origin policy before HTTP
// routes execute and owns the WebSocket upgrade via noServer.
//
// These tests boot the real Express app + multiplayer hub on an ephemeral port
// and assert:
//   - an approved Origin gets its exact echo + Vary: Origin on /api routes,
//   - an unapproved Origin is rejected (403) BEFORE the route handler runs,
//   - a same-origin (no Origin header) request still works,
//   - a WS upgrade from an approved origin to /api/mp connects, and an
//     unapproved-origin or wrong-path upgrade is refused before any connection
//     callback (welcome/auth_error) fires.
//
// They must fail today because server/index.mjs mounts no origin middleware and
// server/mp.mjs attaches WebSocketServer with `{ server }` (auto-upgrade) rather
// than `{ noServer: true }` under policy control.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';

import { createApp } from './index.mjs';

const ALLOW = 'https://app.example.com';
let server;
let base;
let wsBase;

before(async () => {
  process.env.ORIGIN_ALLOWLIST = ALLOW;
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

test('approved Origin gets an exact echo and Vary: Origin on an API route', async () => {
  const res = await fetch(`${base}/api/healthz`, { headers: { Origin: ALLOW } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), ALLOW);
  assert.match(res.headers.get('vary') ?? '', /Origin/i);
});

test('unapproved Origin is rejected with 403 before the route runs', async () => {
  const res = await fetch(`${base}/api/healthz`, {
    headers: { Origin: 'https://evil.example.com' },
  });
  assert.equal(res.status, 403);
  // The health route would have returned {status:'ok'}; a 403 proves it never ran.
  const body = await res.json().catch(() => ({}));
  assert.notEqual(body.status, 'ok');
});

test('same-origin request without an Origin header is served', async () => {
  const res = await fetch(`${base}/api/healthz`);
  assert.equal(res.status, 200);
});

test('an authorization/content-type preflight from the approved origin is answered', async () => {
  const res = await fetch(`${base}/api/profile/progress`, {
    method: 'OPTIONS',
    headers: {
      Origin: ALLOW,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  });
  assert.ok(res.status === 204 || res.status === 200);
  assert.equal(res.headers.get('access-control-allow-origin'), ALLOW);
});

test('an approved-origin WS upgrade to /api/mp connects', async () => {
  const ws = new WebSocket(`${wsBase}/api/mp`, { headers: { Origin: ALLOW } });
  const [openOrErr] = await Promise.race([
    once(ws, 'open').then(() => ['open']),
    once(ws, 'error').then(([e]) => ['error', e]),
  ]);
  assert.equal(openOrErr, 'open');
  ws.close();
});

test('an unapproved-origin WS upgrade is refused before any connection callback', async () => {
  const ws = new WebSocket(`${wsBase}/api/mp`, {
    headers: { Origin: 'https://evil.example.com' },
  });
  let welcomed = false;
  ws.on('message', () => {
    welcomed = true;
  });
  const result = await Promise.race([
    once(ws, 'open').then(() => 'open'),
    once(ws, 'unexpected-response').then(() => 'refused'),
    once(ws, 'error').then(() => 'refused'),
  ]);
  assert.equal(result, 'refused');
  assert.equal(welcomed, false);
  try {
    ws.close();
  } catch {
    /* ignore */
  }
});

test('an upgrade to a non-/api/mp path is refused', async () => {
  const ws = new WebSocket(`${wsBase}/api/nope`, { headers: { Origin: ALLOW } });
  const result = await Promise.race([
    once(ws, 'open').then(() => 'open'),
    once(ws, 'unexpected-response').then(() => 'refused'),
    once(ws, 'error').then(() => 'refused'),
  ]);
  assert.equal(result, 'refused');
  try {
    ws.close();
  } catch {
    /* ignore */
  }
});

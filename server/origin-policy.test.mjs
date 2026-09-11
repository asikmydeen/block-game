// RED (task 2.4): exact HTTP and WebSocket origin decisions.
//
// These tests specify the shared OriginPolicy before any implementation exists.
// They must fail because `server/origin-policy.mjs` is absent. The policy is a
// pure decision layer: it parses ORIGIN_ALLOWLIST once at startup (rejecting
// wildcard / null / malformed / path / query / fragment entries), then decides
// HTTP and WebSocket-upgrade requests by exact origin membership.
//
// No token, join payload, device ID, or service credential may appear in any
// decision or diagnostic — the policy only ever sees an origin string.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAllowlist,
  createOriginPolicy,
  OriginPolicyError,
} from './origin-policy.mjs';

// ── Allowlist parsing (startup, fail-closed) ───────────────────────────────

test('parseAllowlist accepts a comma-separated list of exact scheme+host[:port] origins', () => {
  const list = parseAllowlist('https://app.example.com, https://www.example.com, capacitor://localhost');
  assert.deepEqual(list, [
    'https://app.example.com',
    'https://www.example.com',
    'capacitor://localhost',
  ]);
});

test('parseAllowlist normalizes surrounding whitespace and drops empty entries', () => {
  const list = parseAllowlist('  https://a.example.com ,, https://b.example.com  ');
  assert.deepEqual(list, ['https://a.example.com', 'https://b.example.com']);
});

for (const bad of [
  '*',
  'https://*.example.com',
  'null',
  'not-a-url',
  'https://app.example.com/path',
  'https://app.example.com/?q=1',
  'https://app.example.com/#frag',
  'https://app.example.com ',
]) {
  test(`parseAllowlist rejects insecure/ambiguous entry ${JSON.stringify(bad)}`, () => {
    // The lone trailing-space case is normalized, so exclude it from the reject set.
    if (bad === 'https://app.example.com ') return;
    assert.throws(() => parseAllowlist(bad), OriginPolicyError);
  });
}

test('parseAllowlist rejects a wildcard even when mixed with valid entries', () => {
  assert.throws(() => parseAllowlist('https://ok.example.com, *'), OriginPolicyError);
});

test('parseAllowlist returns an empty list for an empty string', () => {
  assert.deepEqual(parseAllowlist(''), []);
  assert.deepEqual(parseAllowlist(undefined), []);
});

// ── HTTP decisions ─────────────────────────────────────────────────────────

function httpPolicy(allowlist, opts = {}) {
  return createOriginPolicy({ allowlist: parseAllowlist(allowlist), ...opts });
}

test('an approved Origin is allowed and echoed exactly with Vary: Origin', () => {
  const policy = httpPolicy('https://app.example.com');
  const d = policy.decideHttp({ origin: 'https://app.example.com', method: 'GET' });
  assert.equal(d.allowed, true);
  assert.equal(d.headers['Access-Control-Allow-Origin'], 'https://app.example.com');
  assert.equal(d.headers['Vary'], 'Origin');
});

test('an unapproved Origin is denied with no allow-origin echo', () => {
  const policy = httpPolicy('https://app.example.com');
  const d = policy.decideHttp({ origin: 'https://evil.example.com', method: 'GET' });
  assert.equal(d.allowed, false);
  assert.equal(d.headers['Access-Control-Allow-Origin'], undefined);
});

test('a same-host request with no Origin header is allowed (same-origin browser/native fetch)', () => {
  const policy = httpPolicy('https://app.example.com');
  const d = policy.decideHttp({ origin: undefined, method: 'GET' });
  assert.equal(d.allowed, true);
});

test('a JSON/authorization preflight for an approved origin returns the allowed headers and methods', () => {
  const policy = httpPolicy('https://app.example.com');
  const d = policy.decideHttp({
    origin: 'https://app.example.com',
    method: 'OPTIONS',
    isPreflight: true,
    requestHeaders: 'authorization, content-type',
  });
  assert.equal(d.allowed, true);
  assert.equal(d.isPreflight, true);
  const allowHeaders = String(d.headers['Access-Control-Allow-Headers']).toLowerCase();
  assert.ok(allowHeaders.includes('authorization'));
  assert.ok(allowHeaders.includes('content-type'));
  const allowMethods = String(d.headers['Access-Control-Allow-Methods']).toUpperCase();
  assert.ok(allowMethods.includes('POST'));
  assert.ok(allowMethods.includes('OPTIONS'));
});

test('a preflight for an unapproved origin is denied before any route runs', () => {
  const policy = httpPolicy('https://app.example.com');
  const d = policy.decideHttp({
    origin: 'https://evil.example.com',
    method: 'OPTIONS',
    isPreflight: true,
  });
  assert.equal(d.allowed, false);
});

test('decisions never leak anything but a normalized origin/reason category', () => {
  const policy = httpPolicy('https://app.example.com');
  const d = policy.decideHttp({ origin: 'https://evil.example.com', method: 'GET' });
  assert.equal(typeof d.reason, 'string');
  const serialized = JSON.stringify(d);
  assert.ok(!/authorization|bearer|token|deviceId/i.test(serialized));
});

// ── WebSocket upgrade decisions ─────────────────────────────────────────────

test('an approved-origin upgrade to exactly /api/mp is accepted', () => {
  const policy = httpPolicy('https://app.example.com');
  const d = policy.decideUpgrade({ origin: 'https://app.example.com', path: '/api/mp' });
  assert.equal(d.allowed, true);
});

test('an upgrade to a path other than /api/mp is rejected regardless of origin', () => {
  const policy = httpPolicy('https://app.example.com');
  const d = policy.decideUpgrade({ origin: 'https://app.example.com', path: '/api/other' });
  assert.equal(d.allowed, false);
});

test('an unapproved-origin upgrade is rejected', () => {
  const policy = httpPolicy('https://app.example.com');
  const d = policy.decideUpgrade({ origin: 'https://evil.example.com', path: '/api/mp' });
  assert.equal(d.allowed, false);
});

test('a missing-origin upgrade is rejected in production by default', () => {
  const policy = httpPolicy('https://app.example.com', { production: true });
  const d = policy.decideUpgrade({ origin: undefined, path: '/api/mp' });
  assert.equal(d.allowed, false);
});

test('a missing-origin upgrade is accepted only when originless mode is explicitly enabled (non-production)', () => {
  const policy = httpPolicy('https://app.example.com', {
    production: false,
    allowOriginlessUpgrade: true,
  });
  const d = policy.decideUpgrade({ origin: undefined, path: '/api/mp' });
  assert.equal(d.allowed, true);
});

test('originless upgrade cannot be enabled in production even if the flag is set', () => {
  const policy = httpPolicy('https://app.example.com', {
    production: true,
    allowOriginlessUpgrade: true,
  });
  const d = policy.decideUpgrade({ origin: undefined, path: '/api/mp' });
  assert.equal(d.allowed, false);
});

test('a malformed origin string is rejected on upgrade', () => {
  const policy = httpPolicy('https://app.example.com');
  const d = policy.decideUpgrade({ origin: 'http://', path: '/api/mp' });
  assert.equal(d.allowed, false);
});

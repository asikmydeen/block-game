#!/usr/bin/env node

// Pre-build endpoint validator for native production packaging.
//
// A native production build must embed a complete, absolute, secure endpoint
// pair (HTTPS REST base + WSS multiplayer socket ending in `/api/mp`). This
// validator runs BEFORE Vite/Capacitor so a missing, partial, malformed,
// insecure, or loopback endpoint fails the build with a message naming the
// offending environment variable — never producing an app pointed at the wrong
// or an insecure backend.
//
// It is intentionally self-contained (no TypeScript import) so it can run in a
// clean Node environment ahead of any bundling step. The rules mirror
// `src/config/endpoints.ts`; both are covered by tests to prevent drift.

import { pathToFileURL } from 'node:url';

export const API_VAR = 'VITE_API_BASE_URL';
export const WS_VAR = 'VITE_WEBSOCKET_URL';
export const TARGET_VAR = 'VITE_BUILD_TARGET';
export const MULTIPLAYER_PATH = '/api/mp';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isLoopbackHost(hostname) {
  let host = String(hostname).toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '::') return true;
  if (host === '0.0.0.0') return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (host.startsWith('::ffff:127.')) return true;
  return false;
}

function validateApi(raw, production, diagnostics) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    diagnostics.push({ variable: API_VAR, message: `${API_VAR} is not a valid absolute URL: ${raw}` });
    return;
  }
  if (url.username || url.password) {
    diagnostics.push({ variable: API_VAR, message: `${API_VAR} must not embed credentials` });
  }
  if (url.hash) {
    diagnostics.push({ variable: API_VAR, message: `${API_VAR} must not include a URL fragment` });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    diagnostics.push({ variable: API_VAR, message: `${API_VAR} must use http or https` });
    return;
  }
  if (production) {
    if (url.protocol !== 'https:') {
      diagnostics.push({ variable: API_VAR, message: `${API_VAR} must use HTTPS in a production build` });
    }
    if (isLoopbackHost(url.hostname)) {
      diagnostics.push({
        variable: API_VAR,
        message: `${API_VAR} must not target localhost/loopback in a production build`,
      });
    }
  }
}

function validateWebSocket(raw, production, diagnostics) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    diagnostics.push({ variable: WS_VAR, message: `${WS_VAR} is not a valid absolute URL: ${raw}` });
    return;
  }
  if (url.username || url.password) {
    diagnostics.push({ variable: WS_VAR, message: `${WS_VAR} must not embed credentials` });
  }
  if (url.hash) {
    diagnostics.push({ variable: WS_VAR, message: `${WS_VAR} must not include a URL fragment` });
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    diagnostics.push({ variable: WS_VAR, message: `${WS_VAR} must use ws or wss` });
    return;
  }
  if (url.pathname !== MULTIPLAYER_PATH) {
    diagnostics.push({
      variable: WS_VAR,
      message: `${WS_VAR} pathname must be exactly ${MULTIPLAYER_PATH}; found ${url.pathname}`,
    });
  }
  if (production) {
    if (url.protocol !== 'wss:') {
      diagnostics.push({ variable: WS_VAR, message: `${WS_VAR} must use WSS in a production build` });
    }
    if (isLoopbackHost(url.hostname)) {
      diagnostics.push({
        variable: WS_VAR,
        message: `${WS_VAR} must not target localhost/loopback in a production build`,
      });
    }
  }
}

/**
 * Validate a native endpoint pair.
 *
 * @param {{ apiBaseUrl?: string, webSocketUrl?: string, target?: string, production?: boolean }} input
 * @returns {{ ok: boolean, diagnostics: Array<{ variable: string, message: string }> }}
 */
export function validateEndpointPair({
  apiBaseUrl,
  webSocketUrl,
  target = 'native',
  production = true,
} = {}) {
  const diagnostics = [];

  if (target !== 'web' && target !== 'native') {
    diagnostics.push({
      variable: TARGET_VAR,
      message: `${TARGET_VAR} must be "web" or "native"; found ${String(target)}`,
    });
  }

  const hasApi = isNonEmptyString(apiBaseUrl);
  const hasWs = isNonEmptyString(webSocketUrl);

  if (!hasApi && !hasWs) {
    // A native build has no browser-origin fallback; both are mandatory.
    diagnostics.push({
      variable: API_VAR,
      message: `native builds require an explicit ${API_VAR} and ${WS_VAR}`,
    });
    diagnostics.push({
      variable: WS_VAR,
      message: `native builds require an explicit ${API_VAR} and ${WS_VAR}`,
    });
    return { ok: false, diagnostics };
  }

  if (hasApi !== hasWs) {
    const missing = hasApi ? WS_VAR : API_VAR;
    const present = hasApi ? API_VAR : WS_VAR;
    diagnostics.push({
      variable: missing,
      message: `${missing} is required when ${present} is set; provide both endpoint overrides`,
    });
  }

  if (hasApi) validateApi(apiBaseUrl, production, diagnostics);
  if (hasWs) validateWebSocket(webSocketUrl, production, diagnostics);

  return { ok: diagnostics.length === 0, diagnostics };
}

function main() {
  const target = process.env[TARGET_VAR] ?? 'native';
  const production = process.env.NODE_ENV !== 'development';
  const result = validateEndpointPair({
    apiBaseUrl: process.env[API_VAR],
    webSocketUrl: process.env[WS_VAR],
    target,
    production,
  });

  if (result.ok) {
    console.log(`Endpoint configuration OK (${target}, ${production ? 'production' : 'non-production'}).`);
    return;
  }

  console.error('Endpoint configuration is invalid:');
  for (const { variable, message } of result.diagnostics) {
    console.error(`  - [${variable}] ${message}`);
  }
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

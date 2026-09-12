// Authoritative, build-time endpoint resolution for the shared client.
//
// The client reaches the backend through exactly two typed destinations: a REST
// API base (HTTP/HTTPS) and a multiplayer WebSocket (WS/WSS ending in
// `/api/mp`). Resolution is decided once from build inputs and the browser
// origin — never from query parameters, local storage, native preferences, or
// remote config — so a shipped app cannot be pointed at a different backend at
// runtime.
//
// The `scripts/native/validate-endpoints.mjs` pre-build validator mirrors these
// rules in plain JS so a native production build fails before Vite/Capacitor
// run. Both are covered by tests to guard against drift.

/** The multiplayer WebSocket path is a fixed part of the backend contract. */
export const MULTIPLAYER_PATH = '/api/mp';

export interface EndpointConfig {
  /** Absolute REST API base; every REST request resolves against this. */
  readonly apiBaseUrl: URL;
  /** Absolute multiplayer WebSocket URL, always ending in `/api/mp`. */
  readonly webSocketUrl: URL;
  /** Whether the destinations came from build overrides or the browser origin. */
  readonly source: 'build-override' | 'browser-origin';
}

export interface EndpointBuildInput {
  /** Packaging target; `native` has no browser-origin fallback. */
  readonly target: 'web' | 'native';
  /** Whether this is a production build (enforces secure transport). */
  readonly production: boolean;
  /** `VITE_API_BASE_URL` override, if supplied. */
  readonly apiBaseUrl?: string;
  /** `VITE_WEBSOCKET_URL` override, if supplied. */
  readonly webSocketUrl?: string;
}

/**
 * A configuration failure that always names the offending environment variable
 * (or `window.location.origin` for the web fallback) so the build message is
 * actionable.
 */
export class EndpointConfigError extends Error {
  readonly variable: string;

  constructor(variable: string, message: string) {
    super(message);
    this.name = 'EndpointConfigError';
    this.variable = variable;
  }
}

const API_VAR = 'VITE_API_BASE_URL';
const WS_VAR = 'VITE_WEBSOCKET_URL';
const TARGET_VAR = 'VITE_BUILD_TARGET';
const ORIGIN_VAR = 'window.location.origin';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function parseAbsoluteUrl(raw: string, variable: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EndpointConfigError(variable, `${variable} is not a valid absolute URL: ${raw}`);
  }
  if (url.username || url.password) {
    throw new EndpointConfigError(variable, `${variable} must not embed credentials`);
  }
  if (url.hash) {
    throw new EndpointConfigError(variable, `${variable} must not include a URL fragment`);
  }
  return url;
}

function isLoopbackHost(hostname: string): boolean {
  let host = hostname.toLowerCase();
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

function resolveOverride(input: EndpointBuildInput): EndpointConfig {
  const api = parseAbsoluteUrl((input.apiBaseUrl as string).trim(), API_VAR);
  if (api.protocol !== 'http:' && api.protocol !== 'https:') {
    throw new EndpointConfigError(API_VAR, `${API_VAR} must use http or https`);
  }

  const ws = parseAbsoluteUrl((input.webSocketUrl as string).trim(), WS_VAR);
  if (ws.protocol !== 'ws:' && ws.protocol !== 'wss:') {
    throw new EndpointConfigError(WS_VAR, `${WS_VAR} must use ws or wss`);
  }
  if (ws.pathname !== MULTIPLAYER_PATH) {
    throw new EndpointConfigError(
      WS_VAR,
      `${WS_VAR} pathname must be exactly ${MULTIPLAYER_PATH}; found ${ws.pathname}`,
    );
  }

  if (input.production) {
    if (api.protocol !== 'https:') {
      throw new EndpointConfigError(API_VAR, `${API_VAR} must use HTTPS in a production build`);
    }
    if (ws.protocol !== 'wss:') {
      throw new EndpointConfigError(WS_VAR, `${WS_VAR} must use WSS in a production build`);
    }
    if (isLoopbackHost(api.hostname)) {
      throw new EndpointConfigError(
        API_VAR,
        `${API_VAR} must not target localhost/loopback in a production build`,
      );
    }
    if (isLoopbackHost(ws.hostname)) {
      throw new EndpointConfigError(
        WS_VAR,
        `${WS_VAR} must not target localhost/loopback in a production build`,
      );
    }
  }

  return { apiBaseUrl: api, webSocketUrl: ws, source: 'build-override' };
}

function resolveBrowserOrigin(input: EndpointBuildInput, browserOrigin: string): EndpointConfig {
  if (input.target === 'native') {
    throw new EndpointConfigError(
      API_VAR,
      `native builds require explicit ${API_VAR} and ${WS_VAR}; browser-origin fallback is web-only`,
    );
  }

  const origin = parseAbsoluteUrl(browserOrigin, ORIGIN_VAR);
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
    throw new EndpointConfigError(ORIGIN_VAR, `${ORIGIN_VAR} must use http or https`);
  }

  if (input.production) {
    if (origin.protocol !== 'https:') {
      throw new EndpointConfigError(
        ORIGIN_VAR,
        `a production web build requires an HTTPS ${ORIGIN_VAR}`,
      );
    }
    if (isLoopbackHost(origin.hostname)) {
      throw new EndpointConfigError(
        ORIGIN_VAR,
        `a production web build must not run against a localhost/loopback ${ORIGIN_VAR}`,
      );
    }
  }

  const apiBaseUrl = new URL(`${origin.origin}/`);
  const wsProtocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  const webSocketUrl = new URL(`${wsProtocol}//${origin.host}${MULTIPLAYER_PATH}`);

  return { apiBaseUrl, webSocketUrl, source: 'browser-origin' };
}

/**
 * Resolve the REST and WebSocket destinations from build inputs.
 *
 * Either returns two normalized, transport-correct URLs, or throws an
 * {@link EndpointConfigError} naming the invalid variable. When both web
 * overrides are omitted, the destinations are derived from `browserOrigin`.
 */
export function resolveEndpointConfig(
  input: EndpointBuildInput,
  browserOrigin: string,
): EndpointConfig {
  if (input.target !== 'web' && input.target !== 'native') {
    throw new EndpointConfigError(
      TARGET_VAR,
      `${TARGET_VAR} must be "web" or "native"; found ${String(input.target)}`,
    );
  }

  const hasApi = isNonEmptyString(input.apiBaseUrl);
  const hasWs = isNonEmptyString(input.webSocketUrl);

  if (hasApi !== hasWs) {
    const missing = hasApi ? WS_VAR : API_VAR;
    const present = hasApi ? API_VAR : WS_VAR;
    throw new EndpointConfigError(
      missing,
      `${missing} is required when ${present} is set; provide both endpoint overrides or neither`,
    );
  }

  return hasApi && hasWs ? resolveOverride(input) : resolveBrowserOrigin(input, browserOrigin);
}

/**
 * Build an absolute REST URL from a resolved config and a rooted API path.
 *
 * The path must start with a single `/`; absolute URLs, protocol-relative
 * paths, whitespace, and backslashes are rejected so a caller cannot smuggle a
 * different destination through the path argument.
 */
export function resolveApiUrl(config: EndpointConfig, apiPath: string): URL {
  if (typeof apiPath !== 'string' || apiPath === '') {
    throw new TypeError('apiPath must be a non-empty string');
  }
  if (!apiPath.startsWith('/')) {
    throw new Error(`apiPath must start with "/": ${apiPath}`);
  }
  if (apiPath.startsWith('//')) {
    throw new Error(`apiPath must not be protocol-relative: ${apiPath}`);
  }
  if (apiPath.includes('://') || apiPath.includes('\\') || /\s/.test(apiPath)) {
    throw new Error(`apiPath must be a plain rooted path: ${apiPath}`);
  }

  const base = config.apiBaseUrl;
  const basePath = base.pathname.replace(/\/+$/, '');
  return new URL(`${base.origin}${basePath}${apiPath}`);
}

// Transport client that routes every REST request and page-hide beacon through
// the authoritative EndpointConfig. It attaches the JSON content type and the
// in-memory bearer token as headers only — the token never appears in a URL,
// query string, or log line. A 401 notifies the caller so the session layer can
// reject the current token.

import {
  resolveApiUrl,
  resolveEndpointConfig,
  type EndpointBuildInput,
  type EndpointConfig,
} from '../config/endpoints';

export interface ApiError extends Error {
  readonly status: number;
  readonly code: string;
}

export interface ApiClient {
  /** Perform an authenticated JSON request against `path` (e.g. `/api/auth/me`). */
  request<T>(path: string, init?: RequestInit): Promise<T>;
  /**
   * Fire a best-effort page-hide save to `path`. The body is serialized as-is;
   * callers that need the server-supported token-in-body behaviour include the
   * token in `body` themselves (the client never adds it to the URL).
   */
  beacon(path: string, body: unknown): boolean;
}

export interface ApiClientOptions {
  readonly config: EndpointConfig;
  readonly getToken?: () => string | null;
  readonly onUnauthorized?: () => void;
  readonly fetchImpl?: typeof fetch;
  readonly sendBeacon?: (url: string, data: Blob) => boolean;
}

class ApiRequestError extends Error implements ApiError {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { config, getToken, onUnauthorized, fetchImpl, sendBeacon } = options;
  const doFetch: typeof fetch = fetchImpl ?? ((...args) => fetch(...args));

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = resolveApiUrl(config, path).toString();
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const token = getToken?.() ?? null;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await doFetch(url, { ...init, headers });
    const text = await response.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        onUnauthorized?.();
      }
      const serverError =
        body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
          ? (body as { error: string }).error
          : undefined;
      const code = serverError ?? `http_${response.status}`;
      throw new ApiRequestError(
        response.status,
        code,
        serverError ?? `request failed (${response.status})`,
      );
    }

    return body as T;
  }

  function beacon(path: string, body: unknown): boolean {
    const url = resolveApiUrl(config, path).toString();
    const send =
      sendBeacon ??
      (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
        ? navigator.sendBeacon.bind(navigator)
        : null);
    if (!send) {
      return false;
    }
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    return send(url, blob);
  }

  return { request, beacon };
}

// ── Default client wiring for the running app ──────────────────────────────
//
// The endpoint config is resolved once from the immutable build environment and
// the current browser origin. Query parameters and storage cannot influence it.

let cachedConfig: EndpointConfig | null = null;

function readBuildInput(env: ImportMetaEnv): EndpointBuildInput {
  const rawTarget = (env.VITE_BUILD_TARGET ?? 'web') as EndpointBuildInput['target'];
  return {
    target: rawTarget,
    production: env.PROD === true,
    apiBaseUrl: env.VITE_API_BASE_URL,
    webSocketUrl: env.VITE_WEBSOCKET_URL,
  };
}

/** Resolve (and memoize) the app's endpoint config from build env + origin. */
export function getEndpointConfig(): EndpointConfig {
  if (!cachedConfig) {
    const origin =
      typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost';
    cachedConfig = resolveEndpointConfig(readBuildInput(import.meta.env), origin);
  }
  return cachedConfig;
}

/** Test hook: override the cached config; pass null to reset to env resolution. */
export function __setEndpointConfigForTest(config: EndpointConfig | null): void {
  cachedConfig = config;
}

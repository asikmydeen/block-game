import { describe, expect, it, vi } from 'vitest';

import { resolveEndpointConfig, type EndpointConfig } from '../config/endpoints';
import { createApiClient, type ApiError } from './apiClient';

function makeConfig(): EndpointConfig {
  return resolveEndpointConfig(
    {
      target: 'native',
      production: true,
      apiBaseUrl: 'https://api.example.com',
      webSocketUrl: 'wss://api.example.com/api/mp',
    },
    'https://ignored.example.com',
  );
}

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createApiClient.request', () => {
  it('routes every request to an absolute URL on the configured API origin', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ player: { id: '1' } }));
    const client = createApiClient({ config: makeConfig(), fetchImpl });

    await client.request('/api/auth/me');

    const calledUrl = String(fetchImpl.mock.calls[0][0]);
    expect(calledUrl).toBe('https://api.example.com/api/auth/me');
  });

  it('adds JSON and bearer authorization headers without putting the token in the URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    const client = createApiClient({
      config: makeConfig(),
      getToken: () => 'secret-token',
      fetchImpl,
    });

    await client.request('/api/profile/progress', {
      method: 'POST',
      body: JSON.stringify({ score: 1 }),
    });

    const [calledInput, calledInit] = fetchImpl.mock.calls[0];
    expect(String(calledInput)).not.toContain('secret-token');
    const headers = new Headers(calledInit?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer secret-token');
  });

  it('omits the authorization header when there is no token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    const client = createApiClient({ config: makeConfig(), getToken: () => null, fetchImpl });

    await client.request('/api/auth/suggest');

    const [, calledInit] = fetchImpl.mock.calls[0];
    expect(new Headers(calledInit?.headers).has('Authorization')).toBe(false);
  });

  it('invokes onUnauthorized and throws a typed ApiError on 401', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: 'expired' }, { status: 401 }));
    const client = createApiClient({
      config: makeConfig(),
      getToken: () => 'stale',
      onUnauthorized,
      fetchImpl,
    });

    await expect(client.request('/api/auth/me')).rejects.toMatchObject({
      status: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('surfaces the server error message and status on a non-401 failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: 'nope' }, { status: 400 }));
    const client = createApiClient({ config: makeConfig(), fetchImpl });

    let caught: ApiError | null = null;
    try {
      await client.request('/api/auth/login', { method: 'POST' });
    } catch (error) {
      caught = error as ApiError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.status).toBe(400);
    expect(caught?.message).toContain('nope');
  });

  it('parses and returns the JSON body on success', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ username: 'blocky' }));
    const client = createApiClient({ config: makeConfig(), fetchImpl });

    const body = await client.request<{ username: string }>('/api/auth/suggest');
    expect(body.username).toBe('blocky');
  });
});

describe('createApiClient.beacon', () => {
  it('posts the body to the absolute API URL and never leaks the token into the URL', () => {
    const sendBeacon = vi.fn<(url: string, data: Blob) => boolean>(() => true);
    const client = createApiClient({
      config: makeConfig(),
      getToken: () => 'secret-token',
      sendBeacon,
    });

    const ok = client.beacon('/api/profile/progress', { score: 5, token: 'secret-token' });

    expect(ok).toBe(true);
    const [beaconUrl] = sendBeacon.mock.calls[0];
    expect(beaconUrl).toBe('https://api.example.com/api/profile/progress');
    expect(beaconUrl).not.toContain('secret-token');
  });

  it('returns false when no beacon transport is available', () => {
    const client = createApiClient({ config: makeConfig(), sendBeacon: undefined });
    // jsdom may not implement navigator.sendBeacon; force the no-transport path.
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    try {
      expect(client.beacon('/api/profile/progress', { score: 1 })).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
      });
    }
  });
});

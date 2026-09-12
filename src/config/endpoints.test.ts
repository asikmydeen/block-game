import { describe, expect, it } from 'vitest';

import {
  EndpointConfigError,
  resolveApiUrl,
  resolveEndpointConfig,
  type EndpointBuildInput,
} from './endpoints';

function input(overrides: Partial<EndpointBuildInput> = {}): EndpointBuildInput {
  return {
    target: 'web',
    production: false,
    ...overrides,
  };
}

describe('resolveEndpointConfig — build overrides', () => {
  it('accepts a complete production HTTPS/WSS pair and keeps REST and WS separate', () => {
    const config = resolveEndpointConfig(
      input({
        target: 'native',
        production: true,
        apiBaseUrl: 'https://api.example.com',
        webSocketUrl: 'wss://api.example.com/api/mp',
      }),
      'https://ignored.example.com',
    );

    expect(config.source).toBe('build-override');
    expect(config.apiBaseUrl.protocol).toBe('https:');
    expect(config.apiBaseUrl.host).toBe('api.example.com');
    expect(config.webSocketUrl.protocol).toBe('wss:');
    expect(config.webSocketUrl.pathname).toBe('/api/mp');
    // REST and WS are distinct destinations, not derived from one another.
    expect(config.apiBaseUrl.toString()).not.toBe(config.webSocketUrl.toString());
  });

  it('requires the WebSocket pathname to be exactly /api/mp', () => {
    expect(() =>
      resolveEndpointConfig(
        input({
          target: 'native',
          production: true,
          apiBaseUrl: 'https://api.example.com',
          webSocketUrl: 'wss://api.example.com/socket',
        }),
        'https://ignored.example.com',
      ),
    ).toThrowError(/VITE_WEBSOCKET_URL/);
  });

  it('rejects a production API base that is not HTTPS, naming the variable', () => {
    try {
      resolveEndpointConfig(
        input({
          target: 'native',
          production: true,
          apiBaseUrl: 'http://api.example.com',
          webSocketUrl: 'wss://api.example.com/api/mp',
        }),
        'https://ignored.example.com',
      );
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(EndpointConfigError);
      expect((error as EndpointConfigError).variable).toBe('VITE_API_BASE_URL');
    }
  });

  it('rejects a production WebSocket that is not WSS, naming the variable', () => {
    try {
      resolveEndpointConfig(
        input({
          target: 'native',
          production: true,
          apiBaseUrl: 'https://api.example.com',
          webSocketUrl: 'ws://api.example.com/api/mp',
        }),
        'https://ignored.example.com',
      );
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(EndpointConfigError);
      expect((error as EndpointConfigError).variable).toBe('VITE_WEBSOCKET_URL');
    }
  });

  it('rejects a production localhost/loopback endpoint', () => {
    expect(() =>
      resolveEndpointConfig(
        input({
          target: 'native',
          production: true,
          apiBaseUrl: 'https://localhost/',
          webSocketUrl: 'wss://localhost/api/mp',
        }),
        'https://ignored.example.com',
      ),
    ).toThrowError(/VITE_API_BASE_URL/);
  });

  it('rejects production IPv4 and IPv6 loopback literals', () => {
    expect(() =>
      resolveEndpointConfig(
        input({
          target: 'native',
          production: true,
          apiBaseUrl: 'https://127.0.0.1/',
          webSocketUrl: 'wss://127.0.0.1/api/mp',
        }),
        'https://ignored.example.com',
      ),
    ).toThrowError(EndpointConfigError);

    expect(() =>
      resolveEndpointConfig(
        input({
          target: 'native',
          production: true,
          apiBaseUrl: 'https://[::1]/',
          webSocketUrl: 'wss://[::1]/api/mp',
        }),
        'https://ignored.example.com',
      ),
    ).toThrowError(EndpointConfigError);
  });

  it('rejects credentials embedded in an endpoint URL', () => {
    expect(() =>
      resolveEndpointConfig(
        input({
          target: 'native',
          production: true,
          apiBaseUrl: 'https://user:pass@api.example.com',
          webSocketUrl: 'wss://api.example.com/api/mp',
        }),
        'https://ignored.example.com',
      ),
    ).toThrowError(/VITE_API_BASE_URL/);
  });

  it('rejects a URL fragment in an endpoint URL', () => {
    expect(() =>
      resolveEndpointConfig(
        input({
          target: 'native',
          production: true,
          apiBaseUrl: 'https://api.example.com/#frag',
          webSocketUrl: 'wss://api.example.com/api/mp',
        }),
        'https://ignored.example.com',
      ),
    ).toThrowError(/VITE_API_BASE_URL/);
  });

  it('rejects a malformed endpoint URL, naming the variable', () => {
    try {
      resolveEndpointConfig(
        input({
          target: 'native',
          production: true,
          apiBaseUrl: 'not a url',
          webSocketUrl: 'wss://api.example.com/api/mp',
        }),
        'https://ignored.example.com',
      );
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(EndpointConfigError);
      expect((error as EndpointConfigError).variable).toBe('VITE_API_BASE_URL');
    }
  });

  it('rejects providing only one override (API without WS)', () => {
    try {
      resolveEndpointConfig(
        input({ target: 'web', production: true, apiBaseUrl: 'https://api.example.com' }),
        'https://app.example.com',
      );
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(EndpointConfigError);
      expect((error as EndpointConfigError).variable).toBe('VITE_WEBSOCKET_URL');
    }
  });

  it('rejects providing only one override (WS without API)', () => {
    try {
      resolveEndpointConfig(
        input({ target: 'web', production: true, webSocketUrl: 'wss://api.example.com/api/mp' }),
        'https://app.example.com',
      );
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(EndpointConfigError);
      expect((error as EndpointConfigError).variable).toBe('VITE_API_BASE_URL');
    }
  });

  it('allows explicit HTTP/WS loopback overrides in non-production builds', () => {
    const config = resolveEndpointConfig(
      input({
        target: 'native',
        production: false,
        apiBaseUrl: 'http://localhost:3000',
        webSocketUrl: 'ws://localhost:3000/api/mp',
      }),
      'http://localhost:5173',
    );

    expect(config.source).toBe('build-override');
    expect(config.apiBaseUrl.protocol).toBe('http:');
    expect(config.webSocketUrl.protocol).toBe('ws:');
  });

  it('rejects an unrecognized build target, naming VITE_BUILD_TARGET', () => {
    try {
      resolveEndpointConfig(
        {
          target: 'desktop' as unknown as EndpointBuildInput['target'],
          production: false,
        },
        'https://app.example.com',
      );
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(EndpointConfigError);
      expect((error as EndpointConfigError).variable).toBe('VITE_BUILD_TARGET');
    }
  });
});

describe('resolveEndpointConfig — web browser-origin fallback', () => {
  it('derives HTTPS REST and WSS multiplayer from a secure browser origin', () => {
    const config = resolveEndpointConfig(
      input({ target: 'web', production: true }),
      'https://play.example.com',
    );

    expect(config.source).toBe('browser-origin');
    expect(config.apiBaseUrl.protocol).toBe('https:');
    expect(config.apiBaseUrl.host).toBe('play.example.com');
    expect(config.webSocketUrl.protocol).toBe('wss:');
    expect(config.webSocketUrl.host).toBe('play.example.com');
    expect(config.webSocketUrl.pathname).toBe('/api/mp');
  });

  it('derives ws:// for an http browser origin in non-production', () => {
    const config = resolveEndpointConfig(
      input({ target: 'web', production: false }),
      'http://localhost:5173',
    );

    expect(config.source).toBe('browser-origin');
    expect(config.apiBaseUrl.protocol).toBe('http:');
    expect(config.webSocketUrl.protocol).toBe('ws:');
    expect(config.webSocketUrl.host).toBe('localhost:5173');
    expect(config.webSocketUrl.pathname).toBe('/api/mp');
  });

  it('fails closed when a production web build resolves against an insecure origin', () => {
    expect(() =>
      resolveEndpointConfig(input({ target: 'web', production: true }), 'http://play.example.com'),
    ).toThrowError(/origin/i);
  });

  it('does not offer a browser-origin fallback for native builds', () => {
    try {
      resolveEndpointConfig(input({ target: 'native', production: true }), 'https://play.example.com');
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(EndpointConfigError);
      expect((error as EndpointConfigError).variable).toBe('VITE_API_BASE_URL');
    }
  });
});

describe('resolveApiUrl', () => {
  const config = resolveEndpointConfig(
    input({
      target: 'native',
      production: true,
      apiBaseUrl: 'https://api.example.com',
      webSocketUrl: 'wss://api.example.com/api/mp',
    }),
    'https://ignored.example.com',
  );

  it('produces an absolute URL on the configured API origin', () => {
    const url = resolveApiUrl(config, '/api/auth/me');
    expect(url.toString()).toBe('https://api.example.com/api/auth/me');
    expect(url.origin).toBe('https://api.example.com');
    expect(url.pathname).toBe('/api/auth/me');
  });

  it('preserves query strings', () => {
    const url = resolveApiUrl(config, '/api/leaderboard?limit=10');
    expect(url.pathname).toBe('/api/leaderboard');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('rejects a path that is not rooted at "/"', () => {
    expect(() => resolveApiUrl(config, 'api/auth/me')).toThrowError();
  });

  it('rejects an attempt to smuggle an absolute URL through the path', () => {
    expect(() => resolveApiUrl(config, 'https://evil.example.com/api/auth/me')).toThrowError();
    expect(() => resolveApiUrl(config, '//evil.example.com/api')).toThrowError();
  });
});

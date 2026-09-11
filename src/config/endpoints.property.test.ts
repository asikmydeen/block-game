import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  EndpointConfigError,
  MULTIPLAYER_PATH,
  resolveApiUrl,
  resolveEndpointConfig,
  type EndpointBuildInput,
} from './endpoints';

const KNOWN_VARS = new Set([
  'VITE_API_BASE_URL',
  'VITE_WEBSOCKET_URL',
  'VITE_BUILD_TARGET',
  'window.location.origin',
]);

const TARGETS = ['web', 'native', 'desktop', '', ' web'];

const API_CANDIDATES = [
  undefined,
  '',
  'https://api.example.com',
  'https://api.example.com/base',
  'http://api.example.com',
  'https://user:pass@api.example.com',
  'https://api.example.com/#frag',
  'https://localhost/',
  'https://127.0.0.1/',
  'wss://api.example.com/api/mp',
  'not a url',
];

const WS_CANDIDATES = [
  undefined,
  '',
  'wss://api.example.com/api/mp',
  'ws://api.example.com/api/mp',
  'wss://api.example.com/socket',
  'wss://user:pass@api.example.com/api/mp',
  'wss://[::1]/api/mp',
  'https://api.example.com/api/mp',
  'bad',
];

const ORIGINS = [
  'https://play.example.com',
  'https://play.example.com:8443',
  'http://play.example.com',
  'http://localhost:5173',
  'https://localhost',
  'not-an-origin',
  '',
];

const PATHS = [
  '/api/auth/me',
  '/api/leaderboard?limit=10',
  '/api/profile/progress',
  'api/relative',
  '//evil.example.com/api',
  'https://evil.example.com/api',
];

function isProvided(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

// Feature: capacitor-mobile-app, Property 1: Endpoint resolution is secure, complete, and authoritative
describe('Feature: capacitor-mobile-app, Property 1: Endpoint resolution is secure, complete, and authoritative', () => {
  it('returns transport-correct authoritative URLs or rejects naming the invalid variable', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TARGETS),
        fc.boolean(),
        fc.constantFrom(...API_CANDIDATES),
        fc.constantFrom(...WS_CANDIDATES),
        fc.constantFrom(...ORIGINS),
        fc.constantFrom(...PATHS),
        (target, production, apiBaseUrl, webSocketUrl, browserOrigin, apiPath) => {
          const input = {
            target,
            production,
            apiBaseUrl,
            webSocketUrl,
          } as EndpointBuildInput;

          let config;
          try {
            config = resolveEndpointConfig(input, browserOrigin);
          } catch (error) {
            // Rejection is only acceptable as a named-variable diagnostic.
            expect(error).toBeInstanceOf(EndpointConfigError);
            expect(KNOWN_VARS.has((error as EndpointConfigError).variable)).toBe(true);
            return;
          }

          // Success: two separate, transport-correct, authoritative URLs.
          expect(['http:', 'https:']).toContain(config.apiBaseUrl.protocol);
          expect(['ws:', 'wss:']).toContain(config.webSocketUrl.protocol);
          expect(config.webSocketUrl.pathname).toBe(MULTIPLAYER_PATH);

          const bothProvided = isProvided(apiBaseUrl) && isProvided(webSocketUrl);
          expect(config.source).toBe(bothProvided ? 'build-override' : 'browser-origin');

          if (production) {
            expect(config.apiBaseUrl.protocol).toBe('https:');
            expect(config.webSocketUrl.protocol).toBe('wss:');
          }

          if (config.source === 'browser-origin') {
            // Both overrides omitted -> derived from the current browser origin.
            const origin = new URL(browserOrigin);
            expect(config.apiBaseUrl.host).toBe(origin.host);
            expect(config.webSocketUrl.host).toBe(origin.host);
          }

          // Every REST path routes through the resolved API base, or the path
          // is rejected for being non-rooted / absolute / protocol-relative.
          try {
            const url = resolveApiUrl(config, apiPath);
            expect(url.origin).toBe(config.apiBaseUrl.origin);
          } catch {
            expect(
              !apiPath.startsWith('/') ||
                apiPath.startsWith('//') ||
                apiPath.includes('://'),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

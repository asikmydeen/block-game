// RED (task 4.5): asynchronous AppServices bootstrap and recoverable startup
// states. Must fail because src/platform/runtime.ts and the AppServices factory
// do not exist yet.
//
// Bootstrap contract:
//   - runtime event listeners attach EARLY (before shell prep / hydration);
//   - shell preparation and auth hydration both finish before gameplay is
//     allowed to resume;
//   - an ENDPOINT failure is fatal and names the offending variable;
//   - NETWORK absence is nonfatal (startup still completes);
//   - a SHELL failure yields a recoverable "retry-shell" state (gameplay gated);
//   - a STORAGE failure yields a recoverable "retry-storage" signed-out state
//     and never exposes the stored value.

import { describe, it, expect, vi } from 'vitest';
import { createAppServices } from '../platform/appServices';
import { EndpointConfigError } from '../config/endpoints';

function baseDeps(overrides: Record<string, unknown> = {}) {
  const attach = vi.fn();
  return {
    attach,
    deps: {
      // Resolve endpoints from an explicit web origin (no build override).
      resolveEndpoints: () => ({ apiBaseUrl: new URL('http://localhost/'), webSocketUrl: new URL('ws://localhost/api/mp'), source: 'browser-origin' as const }),
      createStorage: () => ({
        getToken: async () => null,
        setToken: async () => {},
        clearToken: async () => {},
        getDeviceId: async () => 'dev-1',
        setDeviceId: async () => {},
      }),
      shell: {
        prepare: vi.fn(async () => {}),
      },
      network: {
        attachListeners: attach,
        getStatus: async () => ({ connected: true }),
      },
      ...overrides,
    },
  };
}

describe('createAppServices bootstrap', () => {
  it('attaches runtime listeners before shell.prepare and auth hydration', async () => {
    const seq: string[] = [];
    const { deps } = baseDeps({
      network: {
        attachListeners: () => seq.push('attach'),
        getStatus: async () => ({ connected: true }),
      },
      shell: { prepare: vi.fn(async () => void seq.push('shell')) },
      createStorage: () => ({
        getToken: async () => {
          seq.push('hydrate');
          return null;
        },
        setToken: async () => {},
        clearToken: async () => {},
        getDeviceId: async () => null,
        setDeviceId: async () => {},
      }),
    });
    await createAppServices(deps);
    expect(seq[0]).toBe('attach');
    expect(seq).toContain('shell');
    expect(seq).toContain('hydrate');
  });

  it('resolves to ready with a hydrated session and endpoint config', async () => {
    const { deps } = baseDeps();
    const services = await createAppServices(deps);
    expect(services.status).toBe('ready');
    expect(services.session.isHydrated()).toBe(true);
    expect(services.endpoints.webSocketUrl.pathname).toBe('/api/mp');
  });

  it('treats an endpoint failure as fatal and names the variable', async () => {
    const { deps } = baseDeps({
      resolveEndpoints: () => {
        throw new EndpointConfigError('VITE_API_BASE_URL', 'missing');
      },
    });
    const services = await createAppServices(deps);
    expect(services.status).toBe('fatal-endpoint');
    expect(services.fatalVariable).toBe('VITE_API_BASE_URL');
  });

  it('treats network absence as nonfatal — startup still becomes ready', async () => {
    const { deps } = baseDeps({
      network: {
        attachListeners: () => {},
        getStatus: async () => {
          throw new Error('no network module');
        },
      },
    });
    const services = await createAppServices(deps);
    expect(services.status).toBe('ready');
  });

  it('surfaces a recoverable retry-shell state when shell.prepare fails', async () => {
    const { deps } = baseDeps({ shell: { prepare: vi.fn(async () => { throw new Error('orientation lock failed'); }) } });
    const services = await createAppServices(deps);
    expect(services.status).toBe('retry-shell');
    expect(typeof services.retry).toBe('function');
  });

  it('surfaces a recoverable retry-storage signed-out state without exposing the value', async () => {
    const { deps } = baseDeps({
      createStorage: () => ({
        getToken: async () => {
          throw new Error('keychain unavailable: secret-xyz');
        },
        setToken: async () => {},
        clearToken: async () => {},
        getDeviceId: async () => null,
        setDeviceId: async () => {},
      }),
    });
    const services = await createAppServices(deps);
    expect(services.status).toBe('retry-storage');
    expect(services.session.getToken()).toBeNull();
    expect(String(services.error ?? '')).not.toContain('secret-xyz');
  });
});

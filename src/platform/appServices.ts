// AppServices bootstrap (task 4.6): assemble endpoints, storage, session,
// shell, and network in the required order and expose a recoverable status.
//
// Order: attach network listeners EARLY, then run shell.prepare() and auth
// hydration before gameplay is allowed. Endpoint failure is fatal (and names
// the variable). Network failure is nonfatal. Shell failure is a recoverable
// retry-shell state; storage failure is a recoverable retry-storage signed-out
// state that never exposes the stored value.

import { EndpointConfigError, type EndpointConfig } from '../config/endpoints';
import { createAuthSession, type AuthSession } from '../game/authSession';
import { type AuthStorage } from '../game/authStorage';
import { type NativeShell, type NetworkService, type NetworkStatus } from './runtime';

export type BootstrapStatus =
  | 'ready'
  | 'fatal-endpoint'
  | 'retry-shell'
  | 'retry-storage';

export interface AppServicesDeps {
  resolveEndpoints: () => EndpointConfig;
  createStorage: () => AuthStorage;
  shell: NativeShell;
  network: NetworkService;
}

export interface AppServices {
  status: BootstrapStatus;
  endpoints: EndpointConfig;
  session: AuthSession;
  network: NetworkService;
  networkStatus: NetworkStatus;
  shell: NativeShell;
  fatalVariable?: string;
  error?: string;
  /** Re-run the failed phase (shell or storage). No-op when ready/fatal. */
  retry: () => Promise<AppServices>;
}

export async function createAppServices(deps: AppServicesDeps): Promise<AppServices> {
  // 1. Endpoints first — a bad endpoint config is fatal and un-retryable.
  let endpoints: EndpointConfig;
  try {
    endpoints = deps.resolveEndpoints();
  } catch (err) {
    const variable = err instanceof EndpointConfigError ? err.variable : 'endpoints';
    return failed('fatal-endpoint', deps, { fatalVariable: variable });
  }

  // 2. Attach network listeners EARLY, before shell/hydration.
  let networkStatus: NetworkStatus = { connected: true };
  try {
    deps.network.attachListeners((s) => {
      networkStatus = s;
    });
  } catch {
    /* listener attach is best-effort */
  }
  // Network absence is nonfatal.
  try {
    networkStatus = await deps.network.getStatus();
  } catch {
    networkStatus = { connected: false };
  }

  // 3. Shell preparation — recoverable on failure.
  try {
    await deps.shell.prepare();
  } catch {
    return failed('retry-shell', deps, { endpoints, networkStatus, error: 'shell preparation failed' });
  }

  // 4. Auth hydration — recoverable signed-out on storage failure. Probe the
  // storage backend directly first: the session itself is deliberately
  // resilient (it swallows read failures into a null token), so bootstrap must
  // observe the raw failure here to offer a retry.
  const storage = deps.createStorage();
  const session = createAuthSession({ storage });
  try {
    await storage.getToken();
  } catch {
    // Do not surface the stored value; report a generic recoverable error.
    return {
      status: 'retry-storage',
      endpoints,
      session,
      network: deps.network,
      networkStatus,
      shell: deps.shell,
      error: 'auth storage unavailable',
      retry: () => createAppServices(deps),
    };
  }
  await session.hydrate();

  return {
    status: 'ready',
    endpoints,
    session,
    network: deps.network,
    networkStatus,
    shell: deps.shell,
    retry: async function ready(): Promise<AppServices> {
      return this as AppServices;
    },
  };
}

function failed(
  status: BootstrapStatus,
  deps: AppServicesDeps,
  extra: Partial<AppServices>,
): AppServices {
  const placeholderSession = createAuthSession({ storage: deps.createStorage() });
  return {
    status,
    endpoints: extra.endpoints as EndpointConfig,
    session: placeholderSession,
    network: deps.network,
    networkStatus: extra.networkStatus ?? { connected: false },
    shell: deps.shell,
    fatalVariable: extra.fatalVariable,
    error: extra.error,
    retry: () => createAppServices(deps),
  };
}

// AuthSession (task 4.2): the single owner of the in-memory session token.
//
// Every REST and multiplayer consumer reads the token through getToken(), so
// they always observe one hydrated value. Persistence writes are serialized
// through a promise chain so a later write cannot be clobbered by an earlier
// one that resolves late. hydrate() must complete before the app resumes; until
// then the session reports not-hydrated and a null token.
//
// A rejected token (401) is cleared BEFORE any device resume runs, so a stale
// token can never be presented again. logout() clears only the token and
// retains the device id. Storage failure degrades to a recoverable signed-out
// state — it never throws the secret value.

import { type AuthStorage } from './authStorage';

export interface AuthSessionOptions {
  storage: AuthStorage;
  /** Called synchronously after the in-memory token is cleared (before resume). */
  onTokenCleared?: () => void;
}

export interface AuthSession {
  hydrate(): Promise<void>;
  isHydrated(): boolean;
  getToken(): string | null;
  setAuthenticated(token: string): Promise<void>;
  reject(): Promise<void>;
  logout(): Promise<void>;
}

export function createAuthSession({ storage, onTokenCleared }: AuthSessionOptions): AuthSession {
  let token: string | null = null;
  let hydrated = false;
  // Serialize storage mutations so the last logical write wins.
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = queue.then(op, op);
    // Keep the chain alive even if an op rejects; swallow to avoid unhandled.
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    async hydrate() {
      token = await storage.getToken().catch(() => null);
      hydrated = true;
    },
    isHydrated() {
      return hydrated;
    },
    getToken() {
      return hydrated ? token : null;
    },
    async setAuthenticated(next: string) {
      // Publish in memory immediately (so consumers see it), persist serially.
      token = next;
      await enqueue(() => storage.setToken(next)).catch(() => {
        /* recoverable: memory holds the token for this page/session */
      });
    },
    async reject() {
      token = null;
      onTokenCleared?.();
      await enqueue(() => storage.clearToken()).catch(() => {});
    },
    async logout() {
      token = null;
      await enqueue(() => storage.clearToken()).catch(() => {});
      // Device id is intentionally retained.
    },
  };
}

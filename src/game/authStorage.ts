// Shared auth-storage contract (task 4.2). Two secrets are persisted with very
// different sensitivity:
//   - the session TOKEN, which is the login itself, and
//   - the DEVICE ID, which only enables "same computer -> same account".
//
// Web keeps both in localStorage under the existing keys. Native keeps the
// TOKEN in the OS secure store (Keychain/Keystore) and the DEVICE ID in
// Preferences — a token must never land in Preferences, a URL, a log, or a
// diagnostic.
//
// Every method is async so the native (plugin-backed) and web (synchronous
// Storage) adapters share one interface. Failures are swallowed into a
// recoverable signed-out state rather than thrown, and never carry the value.

export const WEB_TOKEN_KEY = 'blockgame.token';
export const WEB_DEVICE_KEY = 'blockgame.deviceId';

export interface AuthStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  getDeviceId(): Promise<string | null>;
  setDeviceId(deviceId: string): Promise<void>;
}

/** A minimal async key/value store, satisfied by Capacitor secure storage and Preferences. */
export interface AsyncKvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

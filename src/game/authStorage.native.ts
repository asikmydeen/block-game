// Native AuthStorage (task 4.2): the session TOKEN lives in the OS secure store
// (Keychain/Keystore), the DEVICE ID lives in Preferences. The routing is
// one-directional and enforced here — a token is never written to Preferences,
// and the device id never occupies a secure-storage slot meant for the token.
//
// Both stores are injected as AsyncKvStore so unit tests need no native runtime;
// the plugin-backed wiring is assembled in the platform layer (phase 13).

import { type AuthStorage, type AsyncKvStore } from './authStorage';

const TOKEN_SLOT = 'token';
const DEVICE_SLOT = 'deviceId';

export interface NativeAuthStorageDeps {
  /** OS secure storage (e.g. @aparajita/capacitor-secure-storage). */
  secure: AsyncKvStore;
  /** Capacitor Preferences. */
  preferences: AsyncKvStore;
}

export function createNativeAuthStorage({ secure, preferences }: NativeAuthStorageDeps): AuthStorage {
  return {
    getToken: async () => {
      try {
        return await secure.get(TOKEN_SLOT);
      } catch {
        return null;
      }
    },
    setToken: async (t) => {
      await secure.set(TOKEN_SLOT, t);
    },
    clearToken: async () => {
      try {
        await secure.remove(TOKEN_SLOT);
      } catch {
        /* ignore */
      }
    },
    getDeviceId: async () => {
      try {
        return await preferences.get(DEVICE_SLOT);
      } catch {
        return null;
      }
    },
    setDeviceId: async (d) => {
      await preferences.set(DEVICE_SLOT, d);
    },
  };
}

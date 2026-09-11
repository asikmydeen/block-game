// Native bootstrap wiring (task 13.5): the single place that decides, from the
// platform, whether to build the plugin-backed native shell/runtime-events or
// the web no-op path. Every native plugin import is DYNAMIC and only reached on
// native, so the web bundle never loads or executes a Capacitor plugin.
//
// The web build ships this module too, but `isNativePlatform()` is false there,
// so `createRuntime()` returns the browser-backed adapters and no `@capacitor/*`
// module is ever imported.

import { createWebNetwork, createWebShell, type NativeShell, type NetworkService } from './runtime';
import {
  createNativeRuntimeEvents,
  createWebRuntimeEvents,
  type RuntimeEvents,
} from './runtimeEvents';
import { createNativeShell, createSplashController, type SplashController } from './nativeShell';

/**
 * True only inside a Capacitor native webview. Guarded so the web bundle, which
 * has no Capacitor global, always evaluates to false without importing anything.
 */
export function isNativePlatform(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export interface AppRuntime {
  shell: NativeShell;
  network: NetworkService;
  events: RuntimeEvents;
  splash: SplashController;
}

/**
 * Build the runtime adapters for the current platform. On web everything is a
 * no-op / browser-backed and no native plugin is imported. On native the
 * Capacitor plugins are imported dynamically and injected into the adapters.
 */
export async function createRuntime(): Promise<AppRuntime> {
  if (!isNativePlatform()) {
    return {
      shell: createWebShell(),
      network: createWebNetwork(),
      events: createWebRuntimeEvents(),
      splash: createSplashController({
        // Never used on web (isNative:false); a stub keeps the type total.
        splashScreen: { hide: async () => {} },
        isNative: false,
      }),
    };
  }

  // Native only — dynamic imports keep these out of the web bundle entirely.
  const [{ ScreenOrientation }, { StatusBar }, { SplashScreen }, { App }, { Network }] =
    await Promise.all([
      import('@capacitor/screen-orientation'),
      import('@capacitor/status-bar'),
      import('@capacitor/splash-screen'),
      import('@capacitor/app'),
      import('@capacitor/network'),
    ]);

  const orientation = {
    lock: async (o: 'landscape') => {
      await ScreenOrientation.lock({ orientation: o });
    },
    unlock: async () => {
      await ScreenOrientation.unlock();
    },
  };
  const statusBar = {
    hide: async () => {
      await StatusBar.hide();
    },
    setStyle: async (opts: { style: string }) => {
      await StatusBar.setStyle(opts as never);
    },
  };

  const network: NetworkService = {
    attachListeners(onChange) {
      void Network.addListener('networkStatusChange', (s) => onChange({ connected: s.connected }));
    },
    getStatus: async () => {
      const s = await Network.getStatus();
      return { connected: s.connected };
    },
  };

  return {
    shell: createNativeShell({ orientation, statusBar, isNative: true }),
    network,
    events: createNativeRuntimeEvents({
      app: App as never,
      network: Network as never,
      isNative: true,
    }),
    splash: createSplashController({
      splashScreen: { hide: async () => SplashScreen.hide() },
      isNative: true,
    }),
  };
}

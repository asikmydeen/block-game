// Native shell (task 13.5): the plugin-backed implementation of the injectable
// NativeShell interface plus a splash controller that dismisses the launch
// splash exactly once.
//
// Design constraints:
//   - prepare() LOCKS orientation to landscape and HIDES the status bar before
//     it resolves, so gameplay input is only enabled after the chrome is
//     settled. It is idempotent (safe to re-run on resume) and rejects on a
//     recoverable failure so bootstrap can retry.
//   - the splash is dismissed EXACTLY once, and only after BOTH React readiness
//     AND one settled viewport frame — whichever arrives second triggers the
//     single hide.
//   - every native plugin call is behind an `isNative` guard so nothing native
//     ever runs in the web runtime; the web path is a pure no-op.
//
// The Capacitor plugins are injected as minimal interfaces so unit tests drive
// fakes with no real native runtime. Production wiring (see createDefault
// NativeShell) imports the real plugins lazily and only on native.

import type { NativeShell } from './runtime';

export interface OrientationPlugin {
  lock(orientation: 'landscape'): Promise<void>;
  unlock?(): Promise<void>;
}

export interface StatusBarPlugin {
  hide(): Promise<void>;
  setStyle?(opts: { style: string }): Promise<void>;
}

export interface SplashScreenPlugin {
  hide(): Promise<void>;
}

export interface NativeShellDeps {
  orientation: OrientationPlugin;
  statusBar: StatusBarPlugin;
  isNative: boolean;
}

/**
 * Create a NativeShell. On web (`isNative: false`) prepare() is a no-op and no
 * plugin is touched. On native it locks landscape then hides the status bar,
 * both awaited before resolving; a failure rejects for a bootstrap retry.
 */
export function createNativeShell(deps: NativeShellDeps): NativeShell {
  if (!deps.isNative) {
    return {
      prepare: async () => {
        /* web: the browser owns orientation and chrome */
      },
    };
  }
  return {
    prepare: async () => {
      // Lock orientation BEFORE input; a failure here is recoverable (rejects).
      await deps.orientation.lock('landscape');
      // Hide the status bar so the game canvas owns the full landscape surface.
      await deps.statusBar.hide();
    },
  };
}

export interface SplashControllerDeps {
  splashScreen: SplashScreenPlugin;
  isNative: boolean;
}

export interface SplashController {
  /** Signal that React has mounted and the first ready frame is committed. */
  markReactReady(): Promise<void>;
  /** Signal that the visual viewport has settled (one stable layout frame). */
  markViewportSettled(): void;
}

/**
 * The splash is hidden once BOTH signals have arrived. Either order works; the
 * second signal performs the single hide. On web it is a pure no-op.
 */
export function createSplashController(deps: SplashControllerDeps): SplashController {
  let reactReady = false;
  let viewportSettled = false;
  let hidden = false;

  const maybeHide = async () => {
    if (!deps.isNative || hidden || !reactReady || !viewportSettled) return;
    hidden = true;
    await deps.splashScreen.hide();
  };

  return {
    async markReactReady() {
      reactReady = true;
      await maybeHide();
    },
    markViewportSettled() {
      viewportSettled = true;
      // Fire-and-forget: the settled frame is a synchronous DOM signal.
      void maybeHide();
    },
  };
}

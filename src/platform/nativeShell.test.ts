// RED (task 13.4): native shell preparation + plugin-backed runtime events.
// Must fail because src/platform/nativeShell.ts and the native branches in
// src/platform/runtimeEvents.ts do not exist yet.
//
// Contract:
//   - NativeShell.prepare(): locks landscape AND hides the status bar BEFORE
//     it resolves (i.e. before input is enabled); ordering is deterministic.
//   - prepare() is re-runnable on resume (idempotent re-prepare).
//   - a recoverable failure in prepare() rejects so bootstrap can retry, and a
//     later retry can succeed.
//   - the splash is dismissed EXACTLY once, only after React readiness AND one
//     settled viewport frame — never before, never twice.
//   - web no-ops: the web shell prepares without touching any native plugin.
//   - native App lifecycle events are DE-DUPLICATED (a repeated same-state
//     event does not fire the handler twice).
//   - Network change events propagate through the native adapter.
//   - listeners attach EARLY (before the first emitted event is observed).

import { describe, it, expect, vi } from 'vitest';
import { createNativeShell, createSplashController } from '../platform/nativeShell';
import { createNativeRuntimeEvents } from '../platform/runtimeEvents';

function pluginFakes(overrides = {}) {
  const calls: string[] = [];
  const orientation = {
    lock: vi.fn(async () => {
      calls.push('orientation.lock');
    }),
    unlock: vi.fn(async () => {}),
  };
  const statusBar = {
    hide: vi.fn(async () => {
      calls.push('statusBar.hide');
    }),
    setStyle: vi.fn(async () => {}),
  };
  const splashScreen = {
    hide: vi.fn(async () => {
      calls.push('splash.hide');
    }),
  };
  return { calls, orientation, statusBar, splashScreen, ...overrides };
}

describe('native shell prepare()', () => {
  it('locks landscape and hides the status bar before resolving', async () => {
    const f = pluginFakes();
    const shell = createNativeShell({
      orientation: f.orientation,
      statusBar: f.statusBar,
      isNative: true,
    });
    await shell.prepare();
    expect(f.orientation.lock).toHaveBeenCalledWith('landscape');
    expect(f.statusBar.hide).toHaveBeenCalledTimes(1);
    // Both preparation steps completed before prepare() resolved.
    expect(f.calls).toContain('orientation.lock');
    expect(f.calls).toContain('statusBar.hide');
  });

  it('is idempotent — a resume re-prepare runs the lock/hide again without error', async () => {
    const f = pluginFakes();
    const shell = createNativeShell({ orientation: f.orientation, statusBar: f.statusBar, isNative: true });
    await shell.prepare();
    await shell.prepare();
    expect(f.orientation.lock).toHaveBeenCalledTimes(2);
    expect(f.statusBar.hide).toHaveBeenCalledTimes(2);
  });

  it('rejects on a recoverable failure and can succeed on retry', async () => {
    let attempt = 0;
    const orientation = {
      lock: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('orientation not ready');
      }),
      unlock: vi.fn(async () => {}),
    };
    const statusBar = { hide: vi.fn(async () => {}), setStyle: vi.fn(async () => {}) };
    const shell = createNativeShell({ orientation, statusBar, isNative: true });
    await expect(shell.prepare()).rejects.toThrow(/orientation/);
    await expect(shell.prepare()).resolves.toBeUndefined();
    expect(orientation.lock).toHaveBeenCalledTimes(2);
  });

  it('web shell no-ops: prepare touches no native plugin', async () => {
    const f = pluginFakes();
    const shell = createNativeShell({
      orientation: f.orientation,
      statusBar: f.statusBar,
      isNative: false,
    });
    await shell.prepare();
    expect(f.orientation.lock).not.toHaveBeenCalled();
    expect(f.statusBar.hide).not.toHaveBeenCalled();
  });
});

describe('splash controller', () => {
  it('hides the splash exactly once, only after readiness AND a settled frame', async () => {
    const f = pluginFakes();
    const splash = createSplashController({ splashScreen: f.splashScreen, isNative: true });

    splash.markViewportSettled();
    expect(f.splashScreen.hide).not.toHaveBeenCalled(); // readiness not signaled yet

    await splash.markReactReady();
    expect(f.splashScreen.hide).toHaveBeenCalledTimes(1);

    // Further signals must not hide the splash again.
    splash.markViewportSettled();
    await splash.markReactReady();
    expect(f.splashScreen.hide).toHaveBeenCalledTimes(1);
  });

  it('waits for the settled viewport frame even when readiness comes first', async () => {
    const f = pluginFakes();
    const splash = createSplashController({ splashScreen: f.splashScreen, isNative: true });

    await splash.markReactReady();
    expect(f.splashScreen.hide).not.toHaveBeenCalled(); // no settled frame yet

    splash.markViewportSettled();
    expect(f.splashScreen.hide).toHaveBeenCalledTimes(1);
  });

  it('web splash controller never calls a native plugin', async () => {
    const f = pluginFakes();
    const splash = createSplashController({ splashScreen: f.splashScreen, isNative: false });
    await splash.markReactReady();
    splash.markViewportSettled();
    expect(f.splashScreen.hide).not.toHaveBeenCalled();
  });
});

describe('native runtime events', () => {
  function appPluginFake() {
    let stateHandler: ((s: { isActive: boolean }) => void) | null = null;
    const app = {
      addListener: vi.fn(async (event: string, cb: (arg: unknown) => void) => {
        if (event === 'appStateChange') stateHandler = cb as (s: { isActive: boolean }) => void;
        return { remove: vi.fn() };
      }),
    };
    return { app, emitState: (isActive: boolean) => stateHandler?.({ isActive }) };
  }
  function networkPluginFake() {
    let netHandler: ((s: { connected: boolean }) => void) | null = null;
    const network = {
      addListener: vi.fn(async (event: string, cb: (arg: unknown) => void) => {
        if (event === 'networkStatusChange') netHandler = cb as (s: { connected: boolean }) => void;
        return { remove: vi.fn() };
      }),
    };
    return { network, emitNet: (connected: boolean) => netHandler?.({ connected }) };
  }

  it('attaches the app listener early and de-duplicates repeated same-state events', async () => {
    const { app, emitState } = appPluginFake();
    const events = createNativeRuntimeEvents({ app, isNative: true });

    const phases: string[] = [];
    events.onLifecycle((p) => phases.push(p));
    // Listener must already be attached.
    expect(app.addListener).toHaveBeenCalled();

    emitState(false); // background
    emitState(false); // duplicate — ignored
    emitState(true); // foreground
    emitState(true); // duplicate — ignored
    emitState(false); // background again

    expect(phases).toEqual(['background', 'foreground', 'background']);
  });

  it('propagates network status changes', async () => {
    const { network, emitNet } = networkPluginFake();
    const events = createNativeRuntimeEvents({ network, isNative: true });

    const statuses: boolean[] = [];
    events.onNetworkChange((s) => statuses.push(s.connected));
    emitNet(false);
    emitNet(true);
    expect(statuses).toEqual([false, true]);
  });
});

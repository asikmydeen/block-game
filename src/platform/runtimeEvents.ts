// Runtime lifecycle events (task 5.2). The coordinator listens for foreground/
// background transitions through an injectable interface so unit tests need no
// native runtime. The web adapter is backed by the Page Visibility API and
// `pagehide`; the native (Capacitor App plugin) branch is wired in phase 13.

export type LifecyclePhase = 'foreground' | 'background';

export interface NetworkChange {
  connected: boolean;
}

export interface RuntimeEvents {
  /** Subscribe to foreground/background transitions. Returns an unsubscribe fn. */
  onLifecycle(handler: (phase: LifecyclePhase) => void): () => void;
  /** Subscribe to a final page-hide/terminate signal for a last durable save. */
  onPageHide(handler: () => void): () => void;
  /** Subscribe to connectivity changes. Returns an unsubscribe fn. */
  onNetworkChange(handler: (change: NetworkChange) => void): () => void;
}

/** Web adapter using document visibility + pagehide. Duplicate transitions are
 * left to the consumer's clock to coalesce. */
export function createWebRuntimeEvents(): RuntimeEvents {
  return {
    onLifecycle(handler) {
      if (typeof document === 'undefined') return () => {};
      const onVis = () =>
        handler(document.visibilityState === 'visible' ? 'foreground' : 'background');
      document.addEventListener('visibilitychange', onVis);
      return () => document.removeEventListener('visibilitychange', onVis);
    },
    onPageHide(handler) {
      if (typeof window === 'undefined') return () => {};
      const onHide = () => handler();
      window.addEventListener('pagehide', onHide);
      return () => window.removeEventListener('pagehide', onHide);
    },
    onNetworkChange(handler) {
      if (typeof window === 'undefined') return () => {};
      const emit = () => handler({ connected: navigator.onLine });
      window.addEventListener('online', emit);
      window.addEventListener('offline', emit);
      return () => {
        window.removeEventListener('online', emit);
        window.removeEventListener('offline', emit);
      };
    },
  };
}

// Native (Capacitor) adapters (task 13.5). The App and Network plugins are
// injected as minimal listener interfaces so unit tests drive fakes with no
// real native runtime. Listeners attach EAGERLY at creation so no event is
// missed, and lifecycle transitions are DE-DUPLICATED: the App plugin can emit
// repeated same-state `appStateChange` events, and a duplicate must not fire the
// consumer's handler twice.

export interface CapacitorPluginHandle {
  remove: () => void;
}

export interface AppPlugin {
  addListener(
    event: 'appStateChange',
    cb: (state: { isActive: boolean }) => void,
  ): Promise<CapacitorPluginHandle> | CapacitorPluginHandle;
}

export interface NetworkPlugin {
  addListener(
    event: 'networkStatusChange',
    cb: (status: { connected: boolean }) => void,
  ): Promise<CapacitorPluginHandle> | CapacitorPluginHandle;
}

export interface NativeRuntimeEventsDeps {
  app?: AppPlugin;
  network?: NetworkPlugin;
  isNative: boolean;
}

export function createNativeRuntimeEvents(deps: NativeRuntimeEventsDeps): RuntimeEvents {
  if (!deps.isNative) return createWebRuntimeEvents();

  const lifecycleHandlers = new Set<(phase: LifecyclePhase) => void>();
  const networkHandlers = new Set<(change: NetworkChange) => void>();
  const pageHideHandlers = new Set<() => void>();

  let lastPhase: LifecyclePhase | null = null;

  // Attach the app-state listener eagerly and de-duplicate same-state events.
  if (deps.app) {
    void deps.app.addListener('appStateChange', ({ isActive }) => {
      const phase: LifecyclePhase = isActive ? 'foreground' : 'background';
      if (phase === lastPhase) return; // duplicate — ignore
      lastPhase = phase;
      // A move to background is also the app's best chance for a final save.
      for (const handler of lifecycleHandlers) handler(phase);
      if (phase === 'background') {
        for (const handler of pageHideHandlers) handler();
      }
    });
  }

  if (deps.network) {
    void deps.network.addListener('networkStatusChange', ({ connected }) => {
      for (const handler of networkHandlers) handler({ connected });
    });
  }

  return {
    onLifecycle(handler) {
      lifecycleHandlers.add(handler);
      return () => lifecycleHandlers.delete(handler);
    },
    onPageHide(handler) {
      pageHideHandlers.add(handler);
      return () => pageHideHandlers.delete(handler);
    },
    onNetworkChange(handler) {
      networkHandlers.add(handler);
      return () => networkHandlers.delete(handler);
    },
  };
}

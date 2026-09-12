// Lifecycle coordinator (task 5.6): the single place that sequences what
// happens on background, foreground, and page-hide. It never unmounts or resets
// the mounted game session — score, health, inventory, mode, and in-session
// world edits survive a background transition; only account progress is
// persisted for termination.
//
// Background order:  clock.enterBackground -> save snapshot -> multiplayer
//                    suspend -> touch reset -> ui.onBackground
// Foreground order:  clock.enterForeground -> await readiness -> save retry ->
//                    ui.enableInput -> multiplayer resume
// Page-hide:         one final durable save through the absolute beacon.

export interface LifecycleClock {
  enterForeground(): void;
  enterBackground(): void;
}

export interface LifecycleCoordinatorDeps {
  clock: LifecycleClock;
  saveSnapshot: () => Promise<void>;
  multiplayer: { suspend: () => void; resume: () => void };
  touch: { reset: () => void };
  ui: { onBackground: () => void; enableInput: () => void };
  readiness: { awaitReady: () => Promise<void> };
  beacon: () => void;
}

export interface LifecycleCoordinator {
  onBackground(): Promise<void>;
  onForeground(): Promise<void>;
  onPageHide(): void;
}

export function createLifecycleCoordinator(deps: LifecycleCoordinatorDeps): LifecycleCoordinator {
  return {
    async onBackground() {
      deps.clock.enterBackground();
      await deps.saveSnapshot();
      deps.multiplayer.suspend();
      deps.touch.reset();
      deps.ui.onBackground();
    },
    async onForeground() {
      deps.clock.enterForeground();
      await deps.readiness.awaitReady();
      await deps.saveSnapshot(); // retry any pending save now that we're back
      deps.ui.enableInput();
      deps.multiplayer.resume();
    },
    onPageHide() {
      // Synchronous, best-effort final save — the game stays mounted.
      deps.beacon();
    },
  };
}

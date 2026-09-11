// RED (task 5.5): lifecycle coordinator ordering and page-hide behavior. Must
// fail because ./lifecycleCoordinator does not exist yet.
//
// On BACKGROUND the coordinator must run, in order:
//   clock.enterBackground -> snapshot/save -> multiplayer.suspend ->
//   touch.reset -> ui.onBackground
// On FOREGROUND it must wait for auth+shell+layout readiness before:
//   save-retry -> input-enable -> multiplayer.resume
// A page-hide fires a final durable save through the absolute beacon and never
// unmounts the game or loses in-session state (the coordinator does not touch
// the mounted session).

import { describe, it, expect, vi } from 'vitest';
import { createLifecycleCoordinator } from '../game/lifecycleCoordinator';

function harness() {
  const order: string[] = [];
  const clock = {
    enterForeground: vi.fn(() => {
      order.push('clock.fg');
    }),
    enterBackground: vi.fn(() => {
      order.push('clock.bg');
    }),
    foregroundSeconds: () => 0,
    isForeground: () => false,
    reset: vi.fn(),
  };
  const deps = {
    clock,
    saveSnapshot: vi.fn(async () => {
      order.push('save');
    }),
    multiplayer: {
      suspend: vi.fn(() => {
        order.push('mp.suspend');
      }),
      resume: vi.fn(() => {
        order.push('mp.resume');
      }),
    },
    touch: {
      reset: vi.fn(() => {
        order.push('touch.reset');
      }),
    },
    ui: {
      onBackground: vi.fn(() => {
        order.push('ui.bg');
      }),
      enableInput: vi.fn(() => {
        order.push('ui.input');
      }),
    },
    readiness: {
      awaitReady: vi.fn(async () => {
        order.push('ready');
      }),
    },
    beacon: vi.fn(() => {
      order.push('beacon');
    }),
  };
  return { order, deps };
}

describe('lifecycle coordinator', () => {
  it('runs the exact background order: clock -> save -> multiplayer -> touch -> ui', async () => {
    const { order, deps } = harness();
    const coord = createLifecycleCoordinator(deps);
    await coord.onBackground();
    expect(order).toEqual(['clock.bg', 'save', 'mp.suspend', 'touch.reset', 'ui.bg']);
  });

  it('foreground waits for readiness before save-retry, input, and multiplayer resume', async () => {
    const { order, deps } = harness();
    const coord = createLifecycleCoordinator(deps);
    await coord.onForeground();
    expect(order[0]).toBe('clock.fg');
    expect(order.indexOf('ready')).toBeLessThan(order.indexOf('ui.input'));
    expect(order.indexOf('ready')).toBeLessThan(order.indexOf('mp.resume'));
    expect(order).toContain('save'); // retry of the pending save
  });

  it('page-hide fires a final durable save through the beacon', () => {
    const { order, deps } = harness();
    const coord = createLifecycleCoordinator(deps);
    coord.onPageHide();
    expect(deps.beacon).toHaveBeenCalledTimes(1);
    expect(order).toContain('beacon');
  });

  it('does not unmount or reset the game session on background', async () => {
    const { deps } = harness();
    const coord = createLifecycleCoordinator(deps);
    await coord.onBackground();
    // The coordinator has no unmount hook; the clock reset must NOT be called
    // (in-session world/score/health survive the background transition).
    expect(deps.clock.reset).not.toHaveBeenCalled();
  });
});

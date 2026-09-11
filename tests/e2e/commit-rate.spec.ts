import { test, expect, enableCommitProbe, signInToMenu, enterFreePlay, startGame } from './fixtures';

// Priority 3 (task 14.7): steady-movement React-Profiler ROOT COMMIT RATE gate.
//
// The Game page wraps its tree in a <Profiler id="game-root"> (enabled only by
// the test-only commit probe) whose onRender bumps window.__BLOCKGAME_COMMIT_PROBE__.
// The design goal this guards: per-frame player position must NOT drive a React
// setState on the root — it flows through the HUD sampler (<=5Hz). If a
// regression reintroduced a per-frame commit, this rate would spike toward 60/s.
//
// The assertion budget is <=10 root game commits/sec over a multi-second window
// of simulated movement.

test.describe('root commit rate under steady movement', () => {
  test('produces <= 10 root game commits per second while moving', async ({ page }) => {
    await enableCommitProbe(page);
    await signInToMenu(page);
    await enterFreePlay(page);
    await startGame(page);

    // Confirm the probe is installed (proves the Profiler mounted).
    await page.waitForFunction(() => !!(window as unknown as { __BLOCKGAME_COMMIT_PROBE__?: unknown }).__BLOCKGAME_COMMIT_PROBE__, null, {
      timeout: 15_000,
    });

    // Let the scene settle (initial chunk mount commits), then start a clean
    // measurement window.
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      (window as unknown as { __BLOCKGAME_COMMIT_PROBE__: { reset(): void } }).__BLOCKGAME_COMMIT_PROBE__.reset();
    });

    // Simulate steady movement: hold W (forward) and periodically nudge look/
    // strafe for a few seconds. dispatchEvent keydown/keyup mirrors what drei's
    // KeyboardControls + the window keydown handler consume.
    const DURATION_MS = 4000;
    await page.evaluate(async (durationMs) => {
      const fire = (type: 'keydown' | 'keyup', code: string, key: string) => {
        window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }));
      };
      fire('keydown', 'KeyW', 'w');
      const start = performance.now();
      // Small strafe pulses keep movement "steady but changing" without opening
      // any modal (numbers/UI keys are avoided).
      let toggle = false;
      while (performance.now() - start < durationMs) {
        toggle = !toggle;
        fire(toggle ? 'keydown' : 'keyup', 'KeyD', 'd');
        await new Promise((r) => setTimeout(r, 250));
      }
      fire('keyup', 'KeyW', 'w');
      fire('keyup', 'KeyD', 'd');
    }, DURATION_MS);

    const probe = await page.evaluate(() => {
      const p = (window as unknown as {
        __BLOCKGAME_COMMIT_PROBE__: { count: number; firstAt: number | null; lastAt: number | null };
      }).__BLOCKGAME_COMMIT_PROBE__;
      return { count: p.count, firstAt: p.firstAt, lastAt: p.lastAt };
    });

    // Compute commits/sec over the measured window. Use the fixed simulated
    // duration as the denominator floor so a quiet scene (0-1 commits) can't
    // divide by a tiny span and inflate the rate.
    const elapsedSec = Math.max(DURATION_MS / 1000, ((probe.lastAt ?? 0) - (probe.firstAt ?? 0)) / 1000 || 0);
    const rate = elapsedSec > 0 ? probe.count / elapsedSec : 0;

    // eslint-disable-next-line no-console
    console.log(`[commit-rate] count=${probe.count} elapsedSec=${elapsedSec.toFixed(2)} rate=${rate.toFixed(2)}/s`);

    expect(rate).toBeLessThanOrEqual(10);
  });
});

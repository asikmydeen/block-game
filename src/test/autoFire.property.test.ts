import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createPrimaryFireController, WEAPONS } from '../game/combat';

// Feature: capacitor-mobile-app, Property 10: Held automatic fire obeys cadence
// and termination.
//
// For any weapon, hold duration, and interleaving of terminal events, the
// shared primary-fire controller (a) never fires two shots closer together than
// the weapon's interval, (b) fires nothing while a terminal condition holds,
// and (c) a semi-auto weapon fires at most once per uninterrupted press.

describe('Feature: capacitor-mobile-app, Property 10: Held automatic fire obeys cadence and termination', () => {
  it('cadence lower bound and terminal suppression hold for every weapon', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...WEAPONS.map((w) => w.id)),
        fc.integer({ min: 200, max: 3000 }), // hold duration ms
        fc.integer({ min: 8, max: 50 }), // frame step ms
        fc.array(fc.integer({ min: 0, max: 3000 }), { maxLength: 4 }), // background windows starts
        (weaponId, holdMs, frameMs, bgStarts) => {
          const weapon = WEAPONS.find((w) => w.id === weaponId)!;
          const c = createPrimaryFireController();
          c.setWeapon(weapon);
          const interval = 1000 / weapon.attackRate;

          const bgWindows = bgStarts.map((s) => [s, s + 120] as const);
          const inBg = (t: number) => bgWindows.some(([a, b]) => t >= a && t < b);

          const shotTimes: number[] = [];
          let lastBg = false;
          for (let t = 0; t <= holdMs; t += frameMs) {
            const bg = inBg(t);
            if (bg !== lastBg) {
              c.setBackgrounded(bg);
              lastBg = bg;
            }
            const n = c.step(t, true);
            if (n > 0) {
              expect(bg).toBe(false); // never fires while backgrounded
              shotTimes.push(t);
            }
          }

          // cadence: consecutive shots respect the interval (within one frame
          // of sampling jitter)
          for (let i = 1; i < shotTimes.length; i++) {
            expect(shotTimes[i] - shotTimes[i - 1]).toBeGreaterThanOrEqual(interval - frameMs);
          }

          // semi-auto: with the button held continuously (no release), a
          // non-auto weapon fires at most once between background terminals.
          if (!weapon.auto) {
            // number of shots cannot exceed number of (re)starts of held/eligible
            // segments = 1 initial + number of background windows that ended.
            const maxShots = 1 + bgWindows.filter(([, b]) => b <= holdMs).length;
            expect(shotTimes.length).toBeLessThanOrEqual(maxShots);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

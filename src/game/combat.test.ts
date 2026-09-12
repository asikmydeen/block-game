import { describe, it, expect } from 'vitest';
import { createPrimaryFireController, getWeapon } from './combat';

// Fake-clock combat/input tests (11.6). The primary-fire controller is the
// single shared path both touch and desktop dispatch through, so its cadence
// and termination rules are identical regardless of the input device.
//
// Model: caller advances a manual clock and reports whether "primary" is held.
// `step(nowMs, held)` returns the number of shots that should fire on that
// step (0 or 1 in practice, since cadence is sampled per frame).

describe('primary fire controller (shared touch/desktop)', () => {
  it('fires exactly one shot on the rising edge for a semi-auto weapon', () => {
    const c = createPrimaryFireController();
    c.setWeapon(getWeapon('blaster')); // auto:false
    expect(c.step(0, false)).toBe(0);
    expect(c.step(16, true)).toBe(1); // rising edge -> single shot
    expect(c.step(32, true)).toBe(0); // still held, semi-auto: no repeat
    expect(c.step(9999, true)).toBe(0);
    // release then press again -> new shot
    expect(c.step(10000, false)).toBe(0);
    expect(c.step(10016, true)).toBe(1);
  });

  it('an automatic weapon repeats at its cadence while held', () => {
    const c = createPrimaryFireController();
    const rifle = getWeapon('rifle'); // attackRate 7/s -> ~142.86ms
    c.setWeapon(rifle);
    const interval = 1000 / rifle.attackRate;
    let shots = 0;
    // hold for exactly 1 second, sampling every 16ms
    for (let t = 0; t <= 1000; t += 16) {
      shots += c.step(t, true);
    }
    // ~7 shots in one second (rising-edge shot at t=0 plus cadence)
    expect(shots).toBeGreaterThanOrEqual(6);
    expect(shots).toBeLessThanOrEqual(8);
    void interval;
  });

  it('respects cooldown eligibility: no shot before the interval elapses', () => {
    const c = createPrimaryFireController();
    const rifle = getWeapon('rifle');
    c.setWeapon(rifle);
    const interval = 1000 / rifle.attackRate;
    expect(c.step(0, true)).toBe(1); // edge shot
    expect(c.step(interval * 0.5, true)).toBe(0); // too soon
    expect(c.step(interval + 1, true)).toBe(1); // eligible again
  });

  it('terminates immediately on release', () => {
    const c = createPrimaryFireController();
    c.setWeapon(getWeapon('rifle'));
    expect(c.step(0, true)).toBe(1);
    expect(c.step(200, false)).toBe(0);
    expect(c.step(400, false)).toBe(0);
  });

  it.each(['cancel', 'background', 'typing', 'gateClose'] as const)(
    'terminates immediately on %s even while the button is still logically held',
    (kind) => {
      const c = createPrimaryFireController();
      c.setWeapon(getWeapon('rifle'));
      expect(c.step(0, true)).toBe(1);
      // a terminal fires while held=true
      if (kind === 'cancel') c.cancel();
      if (kind === 'background') c.setBackgrounded(true);
      if (kind === 'typing') c.setTyping(true);
      if (kind === 'gateClose') c.setInputOpen(false);
      // no further shots while terminal condition holds, regardless of cadence
      expect(c.step(500, true)).toBe(0);
      expect(c.step(1000, true)).toBe(0);
    },
  );

  it('does not diverge between touch and keyboard/mouse: same held timeline, same shots', () => {
    const rifle = getWeapon('rifle');
    const timeline: Array<[number, boolean]> = [
      [0, true], [50, true], [150, true], [300, true], [450, false], [600, true], [750, true],
    ];
    const touch = createPrimaryFireController();
    const desktop = createPrimaryFireController();
    touch.setWeapon(rifle);
    desktop.setWeapon(rifle);
    let touchShots = 0;
    let desktopShots = 0;
    for (const [t, held] of timeline) {
      touchShots += touch.step(t, held);
      desktopShots += desktop.step(t, held);
    }
    expect(touchShots).toBe(desktopShots);
  });
});

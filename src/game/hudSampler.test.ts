// Task 10.5 (RED) — bounded HUD sampler and frame/React separation.
//
// The HUD sampler is the ONLY publish path for continuous player position: the
// per-frame loop writes into refs, and this sampler publishes rounded
// coordinates at <= 5 Hz with display-precision equality suppression, and
// suspends while backgrounded. Driven by an injected monotonic clock (no real
// timers) so it is deterministic in the shared suite.

import { describe, it, expect, vi } from 'vitest';
import { createHudSampler, HUD_SAMPLE_INTERVAL_MS } from './hudSampler';

describe('createHudSampler — 200ms sampling cadence', () => {
  it('uses a 200ms interval', () => {
    expect(HUD_SAMPLE_INTERVAL_MS).toBe(200);
  });

  it('publishes at most once per interval regardless of sample frequency', () => {
    const publish = vi.fn();
    const s = createHudSampler({ publish, precision: 1 });
    // 60 samples over 1000ms, each moving enough to be unequal.
    for (let i = 0; i < 60; i++) {
      const t = i * (1000 / 60);
      s.sample(t, { x: i, y: 0, z: 0 });
    }
    // 1000ms / 200ms => at most 5 publications in the window.
    expect(publish.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('publishes the first sample immediately (t=0)', () => {
    const publish = vi.fn();
    const s = createHudSampler({ publish, precision: 1 });
    s.sample(0, { x: 1, y: 2, z: 3 });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenLastCalledWith({ x: 1, y: 2, z: 3 });
  });
});

describe('createHudSampler — equality suppression at display precision', () => {
  it('suppresses publications whose rounded coordinates are unchanged', () => {
    const publish = vi.fn();
    const s = createHudSampler({ publish, precision: 1 });
    s.sample(0, { x: 1.00, y: 2.0, z: 3.0 });
    expect(publish).toHaveBeenCalledTimes(1);
    // 300ms later (past the gate) but rounds to the same 0.1 precision => suppressed.
    s.sample(300, { x: 1.04, y: 2.02, z: 2.97 });
    expect(publish).toHaveBeenCalledTimes(1);
    // 600ms: now a real rounded change => publishes.
    s.sample(600, { x: 1.2, y: 2.0, z: 3.0 });
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith({ x: 1.2, y: 2.0, z: 3.0 });
  });

  it('publishes rounded (not raw) coordinates', () => {
    const publish = vi.fn();
    const s = createHudSampler({ publish, precision: 1 });
    s.sample(0, { x: 1.234, y: 5.678, z: -9.876 });
    expect(publish).toHaveBeenLastCalledWith({ x: 1.2, y: 5.7, z: -9.9 });
  });
});

describe('createHudSampler — suspend / resume / stop', () => {
  it('does not publish while suspended', () => {
    const publish = vi.fn();
    const s = createHudSampler({ publish, precision: 1 });
    s.sample(0, { x: 0, y: 0, z: 0 });
    expect(publish).toHaveBeenCalledTimes(1);
    s.suspend();
    s.sample(300, { x: 5, y: 0, z: 0 });
    s.sample(600, { x: 9, y: 0, z: 0 });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('resumes publishing after resume()', () => {
    const publish = vi.fn();
    const s = createHudSampler({ publish, precision: 1 });
    s.sample(0, { x: 0, y: 0, z: 0 });
    s.suspend();
    s.sample(300, { x: 5, y: 0, z: 0 });
    s.resume();
    s.sample(600, { x: 9, y: 0, z: 0 });
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith({ x: 9, y: 0, z: 0 });
  });

  it('never publishes after stop()', () => {
    const publish = vi.fn();
    const s = createHudSampler({ publish, precision: 1 });
    s.stop();
    s.sample(0, { x: 1, y: 1, z: 1 });
    s.sample(400, { x: 2, y: 2, z: 2 });
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('HUD sampler is the publish path (not a per-frame setState)', () => {
  it('drives a HUD setter at <= 5 publications/sec across a dense per-frame trace', () => {
    // Simulate the intended Player wiring: per-frame writes go to a ref, and
    // ONLY the sampler forwards to the React HUD setter.
    const setHud = vi.fn();
    const posRef = { current: { x: 0, y: 0, z: 0 } };
    const s = createHudSampler({ publish: (p) => setHud(p), precision: 1 });
    for (let frame = 0; frame < 90; frame++) {
      const t = frame * (1000 / 90); // 90fps over 1s
      posRef.current = { x: frame * 0.5, y: 0, z: 0 };
      s.sample(t, posRef.current); // Player calls this each frame; ref holds truth
    }
    expect(setHud.mock.calls.length).toBeLessThanOrEqual(5);
    expect(setHud.mock.calls.length).toBeGreaterThan(0);
  });
});

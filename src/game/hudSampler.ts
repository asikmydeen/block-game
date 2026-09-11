// Task 10.6 (GREEN) — bounded, equality-aware HUD position sampler.
//
// Continuous player position lives in refs / Three.js each frame. This sampler
// is the ONLY path that forwards position to the React HUD. It publishes at
// most once per 200 ms (<= 5 Hz), suppresses publications whose display-rounded
// coordinates are unchanged, and suspends while the app is backgrounded. It is
// driven by an injected monotonic clock value passed to `sample`, so it holds
// no real timers and is deterministic in the shared test suite.

/** Sampling interval: 200 ms => at most 5 publications per second. */
export const HUD_SAMPLE_INTERVAL_MS = 200;

export interface HudCoords {
  x: number;
  y: number;
  z: number;
}

export interface HudSamplerOptions {
  /** Called with rounded coordinates when a publication is due and changed. */
  publish: (coords: HudCoords) => void;
  /** Decimal places used for both display rounding and equality suppression. */
  precision?: number;
  /** Override the interval (defaults to HUD_SAMPLE_INTERVAL_MS). */
  intervalMs?: number;
}

export interface HudSampler {
  /** Feed the latest continuous position at monotonic clock time `nowMs`. */
  sample: (nowMs: number, coords: HudCoords) => void;
  /** Stop publishing while backgrounded (keeps the last published value). */
  suspend: () => void;
  /** Allow publishing again; the next eligible sample publishes. */
  resume: () => void;
  /** Permanently stop; no further publication ever occurs. */
  stop: () => void;
}

function roundTo(value: number, precision: number): number {
  const f = 10 ** precision;
  // +0 normalizes -0 to 0 so equality suppression treats them the same.
  return Math.round(value * f) / f + 0;
}

export function createHudSampler(opts: HudSamplerOptions): HudSampler {
  const precision = opts.precision ?? 1;
  const intervalMs = opts.intervalMs ?? HUD_SAMPLE_INTERVAL_MS;
  let suspended = false;
  let stopped = false;
  let lastPublishAt = -Infinity;
  let last: HudCoords | null = null;

  return {
    sample(nowMs, coords) {
      if (stopped || suspended) return;
      // Gate on the interval: skip until 200 ms have elapsed since last publish.
      if (nowMs - lastPublishAt < intervalMs) return;
      const rounded: HudCoords = {
        x: roundTo(coords.x, precision),
        y: roundTo(coords.y, precision),
        z: roundTo(coords.z, precision),
      };
      // Equality suppression at display precision.
      if (last && last.x === rounded.x && last.y === rounded.y && last.z === rounded.z) {
        // Still advance the gate so an unchanged position doesn't cause a burst
        // the instant it finally changes.
        lastPublishAt = nowMs;
        return;
      }
      last = rounded;
      lastPublishAt = nowMs;
      opts.publish(rounded);
    },
    suspend() {
      suspended = true;
    },
    resume() {
      if (stopped) return;
      suspended = false;
    },
    stop() {
      stopped = true;
    },
  };
}

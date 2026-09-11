// Lifecycle foreground clock (task 5.2). Playtime must reflect only time the
// game was actually in the foreground — background stretches (a suspended tab,
// a locked phone) are excluded, and duplicate foreground/background events are
// coalesced so nothing is double-counted. The clock reports live elapsed time
// while still in the foreground, so no one-second React timer is needed.

export interface ForegroundClockOptions {
  /** Injectable time source (ms). Defaults to Date.now. */
  now?: () => number;
}

export interface ForegroundClock {
  enterForeground(): void;
  enterBackground(): void;
  /** Accumulated foreground time in whole seconds (including the live segment). */
  foregroundSeconds(): number;
  isForeground(): boolean;
  reset(): void;
}

export function createForegroundClock({ now = () => Date.now() }: ForegroundClockOptions = {}): ForegroundClock {
  let accumulatedMs = 0;
  let segmentStart: number | null = null; // non-null while in the foreground

  return {
    enterForeground() {
      if (segmentStart !== null) return; // duplicate — already foreground
      segmentStart = now();
    },
    enterBackground() {
      if (segmentStart === null) return; // duplicate — already background
      accumulatedMs += now() - segmentStart;
      segmentStart = null;
    },
    foregroundSeconds() {
      const live = segmentStart !== null ? now() - segmentStart : 0;
      return Math.floor((accumulatedMs + live) / 1000);
    },
    isForeground() {
      return segmentStart !== null;
    },
    reset() {
      accumulatedMs = 0;
      segmentStart = null;
    },
  };
}

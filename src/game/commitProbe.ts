// Test-only instrumentation for the root game commit rate (task 14.7).
//
// The Playwright commit-rate spec asserts that steady movement produces at most
// ~10 React *root game* commits per second. React does not expose a commit
// counter, so the Game page wraps its tree in a <Profiler> whose onRender feeds
// this counter. Everything here is inert in production: the flag defaults off,
// the Profiler is only mounted when the flag is on, and no game code ever reads
// the counter. A test turns it on BEFORE the app boots (via a localStorage key
// or a window flag set in an init script) so the very first commit is counted.

const FLAG_STORAGE_KEY = 'blockgame.commitProbe';

export interface CommitProbe {
  /** Total root game commits observed since the probe was installed. */
  count: number;
  /** performance.now() of the first observed commit, or null before any. */
  firstAt: number | null;
  /** performance.now() of the most recent observed commit, or null. */
  lastAt: number | null;
  /** Reset the counter/timestamps — a spec calls this to start a clean window. */
  reset(): void;
}

declare global {
  interface Window {
    /** Set to true (or the storage flag to '1') to enable the probe. */
    __BLOCKGAME_COMMIT_PROBE_ENABLED__?: boolean;
    /** The live counter, installed lazily on first enabled render. */
    __BLOCKGAME_COMMIT_PROBE__?: CommitProbe;
  }
}

/**
 * Whether the commit probe is enabled for this session. True only when a test
 * has opted in — never in a normal user session.
 */
export function isCommitProbeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__BLOCKGAME_COMMIT_PROBE_ENABLED__ === true) return true;
  try {
    return window.localStorage.getItem(FLAG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Get (installing on first use) the shared window commit counter. */
export function getCommitProbe(): CommitProbe {
  const w = window;
  if (!w.__BLOCKGAME_COMMIT_PROBE__) {
    const probe: CommitProbe = {
      count: 0,
      firstAt: null,
      lastAt: null,
      reset() {
        this.count = 0;
        this.firstAt = null;
        this.lastAt = null;
      },
    };
    w.__BLOCKGAME_COMMIT_PROBE__ = probe;
  }
  return w.__BLOCKGAME_COMMIT_PROBE__;
}

/**
 * React Profiler onRender handler. Counts every commit of the wrapped subtree
 * (mount + update) and stamps the wall clock so a spec can compute a rate.
 */
export function recordCommit(): void {
  const probe = getCommitProbe();
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (probe.firstAt === null) probe.firstAt = now;
  probe.lastAt = now;
  probe.count += 1;
}

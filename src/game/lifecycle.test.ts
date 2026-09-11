// RED (task 5.1): foreground clock, latest-only progress, and normalized
// lifecycle transitions. Must fail because ./lifecycle and ./progressPersistence
// do not exist yet.
//
// Contract:
//   - a foreground clock accumulates ONLY foreground wall time (duplicate or
//     long background intervals are excluded);
//   - a pending-progress store keeps only the NEWEST unacknowledged revision
//     per account; a stale ack cannot resurrect an older revision;
//   - an account switch / auth-generation change isolates pending progress;
//   - offline/failed saves are retained for retry; out-of-order acks are safe.

import { describe, it, expect } from 'vitest';
import { createForegroundClock } from './lifecycle';
import { createPendingProgress } from './progressPersistence';

describe('foreground clock', () => {
  it('accumulates only foreground intervals, excluding background time', () => {
    let now = 1000;
    const clock = createForegroundClock({ now: () => now });
    clock.enterForeground(); // t=1000
    now = 4000;
    clock.enterBackground(); // +3000 foreground
    now = 10000; // 6s in background — excluded
    clock.enterForeground();
    now = 12000;
    clock.enterBackground(); // +2000 foreground
    expect(clock.foregroundSeconds()).toBe(5); // (3000 + 2000) ms
  });

  it('coalesces duplicate foreground/background events (no double counting)', () => {
    let now = 0;
    const clock = createForegroundClock({ now: () => now });
    clock.enterForeground();
    clock.enterForeground(); // duplicate — ignored
    now = 2000;
    clock.enterBackground();
    clock.enterBackground(); // duplicate — ignored
    expect(clock.foregroundSeconds()).toBe(2);
  });

  it('reports live foreground time while still in the foreground', () => {
    let now = 0;
    const clock = createForegroundClock({ now: () => now });
    clock.enterForeground();
    now = 5000;
    expect(clock.foregroundSeconds()).toBe(5);
  });
});

describe('pending progress store', () => {
  it('keeps only the newest revision per account', () => {
    const store = createPendingProgress();
    store.record('acct-1', { rev: 1, score: 10 });
    store.record('acct-1', { rev: 2, score: 25 });
    expect(store.peek('acct-1')).toMatchObject({ rev: 2, score: 25 });
  });

  it('a stale (older-rev) record does not overwrite a newer one', () => {
    const store = createPendingProgress();
    store.record('acct-1', { rev: 5, score: 50 });
    store.record('acct-1', { rev: 3, score: 30 }); // arrives late, older
    expect(store.peek('acct-1')).toMatchObject({ rev: 5, score: 50 });
  });

  it('acknowledging the current revision clears it; an older ack does not', () => {
    const store = createPendingProgress();
    store.record('acct-1', { rev: 4, score: 40 });
    store.acknowledge('acct-1', 2); // stale ack — ignored
    expect(store.peek('acct-1')).toMatchObject({ rev: 4 });
    store.acknowledge('acct-1', 4); // current ack — clears
    expect(store.peek('acct-1')).toBeNull();
  });

  it('a newer record after an ack is retained (not swallowed by the ack)', () => {
    const store = createPendingProgress();
    store.record('acct-1', { rev: 4, score: 40 });
    store.acknowledge('acct-1', 4);
    store.record('acct-1', { rev: 5, score: 55 });
    expect(store.peek('acct-1')).toMatchObject({ rev: 5, score: 55 });
  });

  it('isolates pending progress per account (no cross-account bleed)', () => {
    const store = createPendingProgress();
    store.record('acct-1', { rev: 1, score: 10 });
    store.record('acct-2', { rev: 1, score: 99 });
    expect(store.peek('acct-1')).toMatchObject({ score: 10 });
    expect(store.peek('acct-2')).toMatchObject({ score: 99 });
  });

  it('lists accounts with pending unacknowledged progress for retry', () => {
    const store = createPendingProgress();
    store.record('acct-1', { rev: 1, score: 10 });
    store.record('acct-2', { rev: 1, score: 20 });
    store.acknowledge('acct-2', 1);
    expect(store.pendingAccounts().sort()).toEqual(['acct-1']);
  });
});

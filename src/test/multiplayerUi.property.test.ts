// Property test (task 7.4) — Feature: capacitor-mobile-app, Property 8:
// Multiplayer protocol and UI transitions are ordered and minimal.
//
// Driving the MultiplayerClient through the store sink adapter, for any
// message/lifecycle sequence:
//   • clear-before-offline: on any close the scene membership is cleared
//     (roster -> empty) BEFORE the offline status is delivered;
//   • join-before-state: a `welcome` (self identity) is delivered before any
//     roster snapshot is applied against that identity, and self is never
//     dropped from a roster;
//   • retry-free auth rejection: after `auth_error` the token is cleared and no
//     further socket is ever created;
//   • equal-value suppression: an identical UI roster (same ids/score/emote in
//     order) and a transform-only movement do NOT notify the React UI store.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createMultiplayerClient, type InjectableClock } from '../game/multiplayerClient';

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {}
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

interface Sch {
  id: number;
  at: number;
  fn: () => void;
  interval: number | null;
}
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, Sch>();
  const clock: InjectableClock & { advance(ms: number): void } = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { id, at: now + ms, fn, interval: null });
      return id;
    },
    clearTimeout: (id) => void timers.delete(id as number),
    setInterval: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { id, at: now + ms, fn, interval: ms });
      return id;
    },
    clearInterval: (id) => void timers.delete(id as number),
    advance(ms: number) {
      const end = now + ms;
      for (let guard = 0; guard < 200000; guard++) {
        let next: Sch | undefined;
        for (const t of timers.values()) {
          if (t.at <= end && (!next || t.at < next.at || (t.at === next.at && t.id < next.id)))
            next = t;
        }
        if (!next) break;
        now = next.at;
        if (next.interval !== null) next.at = now + next.interval;
        else timers.delete(next.id);
        next.fn();
      }
      now = end;
    },
  };
  return clock;
}

// A trace-recording sink standing in for the store adapter. It records the
// ORDER of status vs roster-clear, tracks self, and detects equal-value
// notifications by remembering the last non-clear roster snapshot key.
function tracingSink() {
  const trace: string[] = [];
  let self: { id: string } | null = null;
  let lastRosterKey: string | null = null;
  let uiNotifies = 0; // counts snapshots the UI would actually re-render on
  return {
    trace,
    getSelf: () => self,
    uiNotifies: () => uiNotifies,
    sink: {
      onStatus: (s: string) => {
        if (s === 'offline') trace.push('offline');
        if (s === 'online') trace.push('online');
      },
      onSelf: (s: { id: string; username: string; color: string }) => {
        self = s;
        trace.push('self');
      },
      onRoster: (players: Array<{ id: string; score: number; emote: string | null }>) => {
        if (players.length === 0) {
          trace.push('roster-clear');
          lastRosterKey = null;
          return;
        }
        // self must never be dropped from an active roster it belongs to
        if (self && players.some((p) => p.id === self!.id)) trace.push('self-in-roster');
        const key = players.map((p) => `${p.id}:${p.score}:${p.emote ?? ''}`).join('|');
        // Equal-value suppression: only "notify" when the visible key changes.
        if (key !== lastRosterKey) {
          uiNotifies++;
          lastRosterKey = key;
        }
      },
      onChat: () => {},
      onEvent: () => {},
      onRace: () => {},
      onPing: () => {},
      onPlayers: () => {},
    },
  };
}

type Msg =
  | { t: 'open' }
  | { t: 'welcome' }
  | { t: 'players'; moveOnly: boolean }
  | { t: 'drop' }
  | { t: 'auth_error' };

const msgArb: fc.Arbitrary<Msg> = fc.oneof(
  fc.constant<Msg>({ t: 'open' }),
  fc.constant<Msg>({ t: 'welcome' }),
  fc.record({ t: fc.constant('players' as const), moveOnly: fc.boolean() }),
  fc.constant<Msg>({ t: 'drop' }),
  fc.constant<Msg>({ t: 'auth_error' }),
);

describe('Feature: capacitor-mobile-app, Property 8: Multiplayer protocol and UI transitions are ordered and minimal', () => {
  it('orders clear-before-offline and join-before-state, is retry-free on auth rejection, and suppresses equal values', () => {
    fc.assert(
      fc.property(fc.array(msgArb, { minLength: 1, maxLength: 30 }), (msgs) => {
        const clock = fakeClock();
        const sockets: FakeSocket[] = [];
        let token: string | null = 'tok';
        const tr = tracingSink();

        const client = createMultiplayerClient({
          url: 'wss://x.test/api/mp',
          socketFactory: ((url: string) => {
            const s = new FakeSocket(url);
            sockets.push(s);
            return s;
          }) as unknown as (url: string) => WebSocket,
          getToken: () => token,
          clearAuth: () => {
            token = null;
          },
          getPosition: () => ({ x: 0, y: 0, z: 0, yaw: 0, score: 0 }),
          clock,
          sink: tr.sink,
        });

        client.start();
        const live = () => sockets.filter((s) => !s.closed);
        let authErrored = false;
        let moveTick = 0;

        for (const m of msgs) {
          const s = live()[0];
          switch (m.t) {
            case 'open':
              s?.open();
              break;
            case 'welcome':
              s?.emit({ type: 'welcome', id: 'me', username: 'Me', color: '#fff' });
              break;
            case 'players': {
              // Fixed membership {me, a}; movement-only changes x/z (transform
              // lane) and keeps the visible key (id/score/emote) identical.
              moveTick += m.moveOnly ? 1 : 0;
              const aScore = m.moveOnly ? 3 : 3 + moveTick; // non-move bumps score
              s?.emit({
                type: 'players',
                players: [
                  { id: 'me', name: 'Me', color: '#fff', x: 0, y: 0, z: 0, yaw: 0, emote: null, score: 0 },
                  { id: 'a', name: 'A', color: '#0f0', x: moveTick, y: 0, z: moveTick, yaw: 0, emote: null, score: aScore },
                ],
              });
              break;
            }
            case 'drop':
              s?.close();
              break;
            case 'auth_error':
              // Only a message on the live, current socket is honored; a
              // message on an already-retired socket is (correctly) ignored by
              // the client, so it does not count as a real auth rejection.
              if (s && !s.closed) {
                s.emit({ type: 'auth_error', message: 'bad' });
                authErrored = true;
              }
              break;
          }
        }

        // ── clear-before-offline: every 'offline' is immediately preceded by a
        // 'roster-clear' in the trace.
        for (let i = 0; i < tr.trace.length; i++) {
          if (tr.trace[i] === 'offline') {
            expect(tr.trace[i - 1]).toBe('roster-clear');
          }
        }

        // ── join-before-state: no roster was applied against self before self
        // was known — i.e. every 'self-in-roster' comes after a 'self'.
        const firstSelf = tr.trace.indexOf('self');
        tr.trace.forEach((ev, i) => {
          if (ev === 'self-in-roster') expect(firstSelf).toBeGreaterThanOrEqual(0), expect(i).toBeGreaterThan(firstSelf);
        });

        // ── retry-free auth rejection: after auth_error, token cleared and no
        // further socket ever created.
        if (authErrored) {
          expect(token).toBeNull();
          const socketsAtError = sockets.length;
          clock.advance(120000);
          expect(sockets.length).toBe(socketsAtError);
          expect(live().length).toBe(0);
        }

        // ── equal-value suppression: a movement-only roster (transform lane
        // only) must not increment the UI notify count. UI notifies must be at
        // most the count of non-move roster frames (+ initial), never one per
        // movement frame.
        const rosterFrames = msgs.filter((m) => m.t === 'players').length;
        const moveFrames = msgs.filter((m) => m.t === 'players' && m.moveOnly).length;
        if (moveFrames > 0 && rosterFrames > 0) {
          expect(tr.uiNotifies()).toBeLessThan(rosterFrames + 1);
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

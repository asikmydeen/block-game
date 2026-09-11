// Property test (task 7.3) — Feature: capacitor-mobile-app, Property 7:
// Multiplayer lifecycle maintains one eligible transport.
//
// For any interleaving of game start/stop, auth availability, visibility, and
// network signals, plus server-driven socket opens/closes, the MultiplayerClient
// upholds:
//   • at most one live socket and at most one publisher + reconnect timer;
//   • no live socket while backgrounded (an intentional suspend has no retry);
//   • it only dials when eligible (started, not terminal, foreground, online);
//   • a publisher only exists alongside a live socket.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createMultiplayerClient, type InjectableClock } from '../game/multiplayerClient';

// ── Fake socket + clock (mirrors the unit harness, kept local) ──────────────
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
  const clock: InjectableClock & {
    advance(ms: number): void;
    intervalCount(): number;
    timeoutCount(): number;
  } = {
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
    intervalCount: () => [...timers.values()].filter((t) => t.interval !== null).length,
    timeoutCount: () => [...timers.values()].filter((t) => t.interval === null).length,
  };
  return clock;
}

type Op =
  | { k: 'start' }
  | { k: 'stop' }
  | { k: 'fg'; v: boolean }
  | { k: 'net'; v: boolean }
  | { k: 'open' }
  | { k: 'welcome' }
  | { k: 'drop' }
  | { k: 'advance'; ms: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constant<Op>({ k: 'start' }),
  fc.constant<Op>({ k: 'stop' }),
  fc.record({ k: fc.constant('fg' as const), v: fc.boolean() }),
  fc.record({ k: fc.constant('net' as const), v: fc.boolean() }),
  fc.constant<Op>({ k: 'open' }),
  fc.constant<Op>({ k: 'welcome' }),
  fc.constant<Op>({ k: 'drop' }),
  fc.record({ k: fc.constant('advance' as const), ms: fc.integer({ min: 1, max: 40000 }) }),
);

const noopSink = () => ({
  onStatus: () => {},
  onSelf: () => {},
  onRoster: () => {},
  onChat: () => {},
  onEvent: () => {},
  onRace: () => {},
  onPing: () => {},
  onPlayers: () => {},
});

describe('Feature: capacitor-mobile-app, Property 7: Multiplayer lifecycle maintains one eligible transport', () => {
  it('never exceeds one socket/publisher/reconnect-timer and honors eligibility', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        const clock = fakeClock();
        const sockets: FakeSocket[] = [];
        let foreground = true;
        let online = true;
        let started = false;
        const terminal = false; // no auth_error injected in this property

        const client = createMultiplayerClient({
          url: 'wss://x.test/api/mp',
          socketFactory: ((url: string) => {
            const s = new FakeSocket(url);
            sockets.push(s);
            return s;
          }) as unknown as (url: string) => WebSocket,
          getToken: () => 'tok',
          clearAuth: () => {},
          getPosition: () => ({ x: 0, y: 0, z: 0, yaw: 0, score: 0 }),
          clock,
          sink: noopSink(),
        });

        const live = () => sockets.filter((s) => !s.closed);

        for (const op of ops) {
          switch (op.k) {
            case 'start':
              started = true;
              client.start();
              break;
            case 'stop':
              started = false;
              client.stop();
              break;
            case 'fg':
              foreground = op.v;
              client.setForeground(op.v);
              break;
            case 'net':
              online = op.v;
              client.setOnline(op.v);
              break;
            case 'open':
              live()[0]?.open();
              break;
            case 'welcome':
              live()[0]?.emit({ type: 'welcome', id: 'me', username: 'Me', color: '#fff' });
              break;
            case 'drop':
              live()[0]?.close();
              break;
            case 'advance':
              clock.advance(op.ms);
              break;
          }

          const eligible = started && !terminal && foreground && online;

          // INVARIANT 1: at most one live socket.
          expect(live().length).toBeLessThanOrEqual(1);
          // INVARIANT 2: at most one publisher and at most one reconnect timer.
          expect(clock.intervalCount()).toBeLessThanOrEqual(1);
          expect(clock.timeoutCount()).toBeLessThanOrEqual(1);
          // INVARIANT 3: no live socket while backgrounded.
          if (!foreground) expect(live().length).toBe(0);
          // INVARIANT 4: no reconnect timer armed while ineligible.
          if (!eligible) expect(clock.timeoutCount()).toBe(0);
          // INVARIANT 5: a publisher only exists alongside a live socket.
          if (clock.intervalCount() > 0) expect(live().length).toBe(1);
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

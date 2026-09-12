// RED (task 7.1): the headless MultiplayerClient transport contract. Must fail
// because ./multiplayerClient does not exist yet.
//
// The client owns exactly one WebSocket, one 100ms publisher, and one
// reconnect timer at a time. Everything is injected — a fake socket factory, a
// fake clock/timer scheduler, a token getter, and lifecycle/network signals —
// so no real WebSocket or wall clock is touched.
//
// Invariants under test:
//  - at most one socket / publisher / reconnect-timer alive at any moment;
//  - a background signal cancels/closes immediately with NO background retry;
//  - only an eligible (foreground + network-up) signal reconnects;
//  - reconnect backoff is EXACTLY 1s,2s,4s,8s,16s,30s then stays 30s;
//  - stale callbacks from a superseded generation are ignored;
//  - position is published only AFTER `welcome`;
//  - `auth_error` is terminal — clears auth and never retries;
//  - `kicked`/duplicate is terminal;
//  - the roster is cleared BEFORE the offline status is emitted.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMultiplayerClient, type MultiplayerClient } from './multiplayerClient';

// ── Fake WebSocket ─────────────────────────────────────────────────────────
const OPEN = 1;

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
  // Test helpers
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  emit(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  raw(data: string) {
    this.onmessage?.({ data });
  }
}

// ── Fake timer scheduler + clock ────────────────────────────────────────────
interface Scheduled {
  id: number;
  at: number;
  fn: () => void;
  interval: number | null; // ms for setInterval, null for setTimeout
}

function makeFakeClock() {
  let nowMs = 0;
  let nextId = 1;
  const timers = new Map<number, Scheduled>();
  return {
    now: () => nowMs,
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { id, at: nowMs + ms, fn, interval: null });
      return id;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
    setInterval: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { id, at: nowMs + ms, fn, interval: ms });
      return id;
    },
    clearInterval: (id: number) => {
      timers.delete(id);
    },
    // advance virtual time, firing due timers in order
    advance(ms: number) {
      const end = nowMs + ms;
      // Fire in time order; guard against runaway intervals.
      for (let guard = 0; guard < 100000; guard++) {
        let next: Scheduled | undefined;
        for (const t of timers.values()) {
          if (t.at <= end && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) {
            next = t;
          }
        }
        if (!next) break;
        nowMs = next.at;
        if (next.interval !== null) {
          next.at = nowMs + next.interval;
        } else {
          timers.delete(next.id);
        }
        next.fn();
      }
      nowMs = end;
    },
    pending: () => [...timers.values()],
    timeoutCount: () => [...timers.values()].filter((t) => t.interval === null).length,
    intervalCount: () => [...timers.values()].filter((t) => t.interval !== null).length,
  };
}

// ── Harness ─────────────────────────────────────────────────────────────────
function harness(opts: { token?: string | null } = {}) {
  const clock = makeFakeClock();
  const sockets: FakeSocket[] = [];
  const socketFactory = vi.fn((url: string) => {
    const s = new FakeSocket(url);
    sockets.push(s);
    return s;
  });
  let token: string | null = opts.token ?? 'tok-1';
  const clearAuth = vi.fn(() => {
    token = null;
  });

  const events: string[] = [];
  const sink = {
    onStatus: vi.fn((s: string, count: number) => {
      events.push(`status:${s}:${count}`);
    }),
    onSelf: vi.fn(),
    onRoster: vi.fn(),
    onChat: vi.fn(),
    onEvent: vi.fn(),
    onRace: vi.fn(),
    onPing: vi.fn(),
    onPlayers: vi.fn(),
  };

  const client: MultiplayerClient = createMultiplayerClient({
    url: 'wss://example.test/api/mp',
    socketFactory: socketFactory as unknown as (url: string) => WebSocket,
    getToken: () => token,
    clearAuth,
    clock: {
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      setInterval: clock.setInterval,
      clearInterval: clock.clearInterval,
    },
    getPosition: () => ({ x: 1, y: 2, z: 3, yaw: 0.5, score: 7 }),
    sink,
  });

  const live = () => sockets.filter((s) => !s.closed);
  return { clock, sockets, socketFactory, sink, client, events, live, clearAuth, getToken: () => token };
}

describe('MultiplayerClient transport', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it('opens exactly one socket on start and reports connecting', () => {
    h.client.start();
    expect(h.socketFactory).toHaveBeenCalledTimes(1);
    expect(h.live().length).toBe(1);
    expect(h.events).toContain('status:connecting:0');
    expect(h.client.diagnostics().sockets).toBe(1);
  });

  it('joins with the token only after connect, and publishes position only AFTER welcome', () => {
    h.client.start();
    const s = h.sockets[0];
    s.open();
    // join sent immediately on open
    const first = JSON.parse(s.sent[0]);
    expect(first).toEqual({ type: 'join', token: 'tok-1' });
    // No position published before welcome, even as the publish interval fires.
    h.clock.advance(350);
    expect(s.sent.filter((m) => JSON.parse(m).type === 'state').length).toBe(0);
    // After welcome, the publisher emits state frames.
    s.emit({ type: 'welcome', id: 'me', username: 'Me', color: '#fff' });
    expect(h.sink.onSelf).toHaveBeenCalledWith({ id: 'me', username: 'Me', color: '#fff' });
    h.clock.advance(100);
    const states = s.sent.filter((m) => JSON.parse(m).type === 'state');
    expect(states.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(states[0])).toMatchObject({ type: 'state', x: 1, y: 2, z: 3, yaw: 0.5, score: 7 });
  });

  it('keeps at most one socket and one publisher across a full connect', () => {
    h.client.start();
    h.sockets[0].open();
    h.sockets[0].emit({ type: 'welcome', id: 'me', username: 'Me', color: '#fff' });
    h.clock.advance(500);
    expect(h.live().length).toBe(1);
    expect(h.clock.intervalCount()).toBe(1); // exactly one 100ms publisher
    expect(h.client.diagnostics().timers).toBeLessThanOrEqual(2);
  });

  it('backoff is exactly 1s,2s,4s,8s,16s,30s then stays 30s', () => {
    h.client.start();
    // Each connection attempt fails via close; measure the delay to the next socket.
    const delays: number[] = [];
    let attempt = h.sockets.length; // 1 after start
    for (let i = 0; i < 8; i++) {
      const s = h.sockets[h.sockets.length - 1];
      s.close(); // connection dropped after being eligible (foreground/online)
      // exactly one reconnect timer should be pending
      expect(h.clock.timeoutCount()).toBe(1);
      const before = h.sockets.length;
      // advance until the next socket appears, tracking how far.
      let waited = 0;
      const step = 1000;
      while (h.sockets.length === before && waited < 60000) {
        h.clock.advance(step);
        waited += step;
      }
      delays.push(waited);
      attempt = h.sockets.length;
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    void attempt;
  });

  it('a background signal closes immediately and does NOT retry', () => {
    h.client.start();
    h.sockets[0].open();
    h.sockets[0].emit({ type: 'welcome', id: 'me', username: 'Me', color: '#fff' });
    h.client.setForeground(false);
    // socket closed, publisher gone, and crucially no reconnect timer armed.
    expect(h.live().length).toBe(0);
    expect(h.clock.intervalCount()).toBe(0);
    expect(h.clock.timeoutCount()).toBe(0);
    // Even after a long wait, no new socket is created while backgrounded.
    h.clock.advance(120000);
    expect(h.live().length).toBe(0);
  });

  it('reconnects when it returns to the foreground', () => {
    h.client.start();
    h.sockets[0].open();
    h.client.setForeground(false);
    const before = h.sockets.length;
    h.client.setForeground(true);
    // Foreground resume reconnects promptly (no long backoff on an intentional suspend).
    h.clock.advance(1000);
    expect(h.sockets.length).toBeGreaterThan(before);
    expect(h.live().length).toBe(1);
  });

  it('does not reconnect while the network is offline, and reconnects when it returns', () => {
    h.client.start();
    h.sockets[0].open();
    h.client.setOnline(false);
    h.sockets[0].close();
    h.clock.advance(60000);
    // offline: no socket should have been created by the reconnect path
    expect(h.live().length).toBe(0);
    const before = h.sockets.length;
    h.client.setOnline(true);
    h.clock.advance(1000);
    expect(h.sockets.length).toBeGreaterThan(before);
  });

  it('ignores stale callbacks from a superseded socket generation', () => {
    h.client.start();
    const stale = h.sockets[0];
    stale.open();
    // Force a new generation by backgrounding then foregrounding.
    h.client.setForeground(false);
    h.client.setForeground(true);
    h.clock.advance(1000);
    const fresh = h.sockets[h.sockets.length - 1];
    expect(fresh).not.toBe(stale);
    h.sink.onSelf.mockClear();
    // A late message from the stale socket must be ignored.
    stale.emit({ type: 'welcome', id: 'ghost', username: 'Ghost', color: '#000' });
    expect(h.sink.onSelf).not.toHaveBeenCalled();
    // A late state publish from the stale generation must not be sent.
    const staleSentBefore = stale.sent.length;
    h.clock.advance(200);
    expect(stale.sent.length).toBe(staleSentBefore);
  });

  it('auth_error is terminal: clears auth, closes, no retry', () => {
    h.client.start();
    h.sockets[0].open();
    h.sockets[0].emit({ type: 'auth_error', message: 'bad token' });
    expect(h.clearAuth).toHaveBeenCalledTimes(1);
    expect(h.getToken()).toBeNull();
    expect(h.live().length).toBe(0);
    expect(h.clock.timeoutCount()).toBe(0);
    h.clock.advance(120000);
    // still no reconnect socket
    expect(h.live().length).toBe(0);
    expect(h.sink.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'system', text: 'bad token' }),
    );
  });

  it('kicked / duplicate is terminal: closes, no retry', () => {
    h.client.start();
    h.sockets[0].open();
    h.sockets[0].emit({ type: 'kicked', message: 'signed in elsewhere' });
    expect(h.live().length).toBe(0);
    h.clock.advance(120000);
    expect(h.live().length).toBe(0);
    expect(h.sink.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'system', text: 'signed in elsewhere' }),
    );
  });

  it('clears the roster BEFORE emitting offline status on an unexpected close', () => {
    h.client.start();
    h.sockets[0].open();
    h.sockets[0].emit({ type: 'welcome', id: 'me', username: 'Me', color: '#fff' });
    h.sockets[0].emit({
      type: 'players',
      players: [
        { id: 'me', name: 'Me', color: '#fff', x: 0, y: 0, z: 0, yaw: 0, emote: null, score: 0 },
        { id: 'a', name: 'A', color: '#0f0', x: 1, y: 0, z: 1, yaw: 0, emote: null, score: 3 },
      ],
    });
    const order: string[] = [];
    h.sink.onRoster.mockImplementation((list: unknown[]) => {
      if (Array.isArray(list) && list.length === 0) order.push('roster-clear');
    });
    h.sink.onStatus.mockImplementation((s: string, _count: number) => {
      if (s === 'offline') order.push('offline');
    });
    h.sockets[0].close();
    expect(order[0]).toBe('roster-clear');
    expect(order).toContain('offline');
  });

  it('routes chat, event, emote, race, and ping messages to the sink', () => {
    h.client.start();
    const s = h.sockets[0];
    s.open();
    s.emit({ type: 'welcome', id: 'me', username: 'Me', color: '#fff' });
    s.emit({ type: 'chat', from: 'A', color: '#0f0', text: 'hi', ts: 111 });
    expect(h.sink.onChat).toHaveBeenCalledWith({ from: 'A', color: '#0f0', text: 'hi', ts: 111 });
    s.emit({ type: 'system', text: 'server note' });
    expect(h.sink.onChat).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'system', text: 'server note', system: true }),
    );
    s.emit({ type: 'event', kind: 'join', text: 'A joined', ts: 222 });
    expect(h.sink.onEvent).toHaveBeenCalledWith({ kind: 'join', text: 'A joined', ts: 222 });
    s.emit({ type: 'emote', from: 'A', emote: 'wave', ts: 333 });
    expect(h.sink.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'emote', text: 'A waves', ts: 333 }),
    );
    s.emit({ type: 'race', phase: 'active', levelId: 'lvl1', endsAt: 999, winner: null });
    expect(h.sink.onRace).toHaveBeenCalledWith({ phase: 'active', levelId: 'lvl1', endsAt: 999, winner: null });
    s.emit({ type: 'ping', from: 'A', x: 1, y: 2, z: 3 });
    expect(h.sink.onPing).toHaveBeenCalledWith({ from: 'A', x: 1, y: 2, z: 3 });
  });

  it('ignores malformed messages without throwing', () => {
    h.client.start();
    h.sockets[0].open();
    expect(() => h.sockets[0].raw('not json{')).not.toThrow();
  });

  it('send() serializes chat/emote/kill/level/ping through the open socket', () => {
    h.client.start();
    const s = h.sockets[0];
    s.open();
    s.emit({ type: 'welcome', id: 'me', username: 'Me', color: '#fff' });
    expect(h.client.send({ type: 'chat', text: 'yo' })).toBe(true);
    expect(s.sent.some((m) => m === JSON.stringify({ type: 'chat', text: 'yo' }))).toBe(true);
  });

  it('send() returns false when there is no open socket', () => {
    h.client.start();
    // not opened yet
    expect(h.client.send({ type: 'chat', text: 'yo' })).toBe(false);
  });

  it('stop() closes everything and does not reconnect', () => {
    h.client.start();
    h.sockets[0].open();
    h.client.stop();
    expect(h.live().length).toBe(0);
    expect(h.clock.timeoutCount()).toBe(0);
    expect(h.clock.intervalCount()).toBe(0);
    h.clock.advance(120000);
    expect(h.live().length).toBe(0);
  });

  it('exposes bounded diagnostic counters (sockets, timers, reconnect attempt)', () => {
    h.client.start();
    const d = h.client.diagnostics();
    expect(typeof d.sockets).toBe('number');
    expect(typeof d.timers).toBe('number');
    expect(typeof d.reconnectAttempt).toBe('number');
    expect(d.sockets).toBeLessThanOrEqual(1);
    expect(d.reconnectAttempt).toBeGreaterThanOrEqual(0);
  });
});

// MultiplayerClient (task 7.2): the headless owner of the multiplayer
// transport. It holds exactly one WebSocket, one 100ms position publisher, and
// one reconnect timer at a time, and it is fully injectable — socket factory,
// clock/timer scheduler, token getter, and the auth-clear hook — so it runs
// under a fake clock in tests and never touches a real WebSocket or wall clock.
//
// The React layer (RemotePlayers / SocialUI / Game) no longer owns any of this.
// The client pushes decoded protocol events into a sink; the exact wire message
// shapes are unchanged from the previous inline implementation.
//
// Lifecycle rules:
//  - A background signal cancels the publisher and reconnect timer and closes
//    the socket IMMEDIATELY, with NO background retry.
//  - Only an eligible signal (foreground AND network-up) reconnects. Returning
//    to eligibility reconnects promptly (the backoff clock is for server-side
//    drops, not for an intentional suspend).
//  - Reconnect backoff on an unexpected drop is EXACTLY 1s,2s,4s,8s,16s,30s and
//    then stays at 30s.
//  - Every socket carries a generation id; a callback from a superseded socket
//    is ignored, so a late welcome/close/state can never corrupt live state.
//  - Position is published only AFTER a `welcome` frame.
//  - `auth_error` clears the token and is terminal; `kicked`/duplicate is
//    terminal. Neither retries.
//  - On a normal (non-terminal) close the roster is cleared BEFORE the offline
//    status is emitted.

export interface MpSelf {
  id: string;
  username: string;
  color: string;
}

export interface MpRosterPlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  emote: string | null;
  score: number;
}

export interface MpChat {
  from: string;
  color: string;
  text: string;
  ts: number;
  system?: boolean;
}

export interface MpFeedEvent {
  kind: string;
  text: string;
  ts: number;
}

export interface MpRace {
  phase: 'idle' | 'active' | 'won' | 'failed';
  levelId: string | null;
  endsAt: number;
  winner: string | null;
}

export interface MpPing {
  from: string;
  x: number;
  y: number;
  z: number;
}

export interface MpPlayerInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

export type MpStatus = 'connecting' | 'online' | 'offline';

/** Sink the client pushes decoded protocol events into. */
export interface MultiplayerSink {
  onStatus(status: MpStatus, count: number): void;
  onSelf(self: MpSelf): void;
  /** Full roster including self (the store filters self out). */
  onRoster(players: MpRosterPlayer[]): void;
  onChat(chat: MpChat): void;
  onEvent(event: MpFeedEvent): void;
  onRace(race: MpRace): void;
  onPing(ping: MpPing): void;
  onPlayers?(players: MpPlayerInfo[]): void;
}

export interface InjectableClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

export interface MultiplayerClientOptions {
  url: string;
  socketFactory: (url: string) => WebSocket;
  getToken: () => string | null;
  /** Called on auth_error, before the terminal close, to drop the bad token. */
  clearAuth: () => void;
  getPosition: () => { x: number; y: number; z: number; yaw: number; score: number };
  sink: MultiplayerSink;
  clock?: InjectableClock;
}

export interface MultiplayerDiagnostics {
  sockets: number;
  timers: number;
  reconnectAttempt: number;
}

export interface MultiplayerClient {
  start(): void;
  stop(): void;
  setForeground(foreground: boolean): void;
  setOnline(online: boolean): void;
  send(msg: unknown): boolean;
  diagnostics(): MultiplayerDiagnostics;
}

const PUBLISH_INTERVAL_MS = 100;
// Exactly six steps then a plateau at the last value.
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const WS_OPEN = 1;

function defaultClock(): InjectableClock {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms) as unknown as number,
    clearInterval: (id) => clearInterval(id as unknown as ReturnType<typeof setInterval>),
  };
}

export function createMultiplayerClient(opts: MultiplayerClientOptions): MultiplayerClient {
  const clock = opts.clock ?? defaultClock();

  let started = false;
  let terminal = false; // auth_error / kicked — never reconnect
  let foreground = true;
  let online = true;

  let socket: WebSocket | null = null;
  let generation = 0; // bumped every time a socket is retired
  let welcomed = false;
  let publishTimer: number | null = null;
  let reconnectTimer: number | null = null;
  let reconnectAttempt = 0; // index into BACKOFF_MS for the NEXT unexpected drop

  let socketCount = 0;

  const eligible = () => started && !terminal && foreground && online;

  function timerCount(): number {
    return (publishTimer !== null ? 1 : 0) + (reconnectTimer !== null ? 1 : 0);
  }

  function clearPublish() {
    if (publishTimer !== null) {
      clock.clearInterval(publishTimer);
      publishTimer = null;
    }
  }

  function clearReconnect() {
    if (reconnectTimer !== null) {
      clock.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  /** Retire the current socket without emitting status; bumps the generation so
   *  any in-flight callback from it is ignored. */
  function retireSocket() {
    clearPublish();
    welcomed = false;
    if (socket) {
      generation++;
      const s = socket;
      socket = null;
      // Detach handlers before closing so a synchronous onclose from close()
      // cannot re-enter the live path.
      s.onopen = null;
      s.onmessage = null;
      s.onclose = null;
      s.onerror = null;
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  }

  function scheduleReconnect(delayMs: number) {
    clearReconnect();
    reconnectTimer = clock.setTimeout(() => {
      reconnectTimer = null;
      if (eligible()) connect();
    }, delayMs);
  }

  function connect() {
    if (!eligible()) return;
    clearReconnect();
    retireSocket();

    const myGen = generation; // the generation this socket belongs to
    opts.sink.onStatus('connecting', 0);

    const s = opts.socketFactory(opts.url);
    socket = s;
    socketCount++;

    s.onopen = () => {
      if (myGen !== generation || socket !== s) return; // stale
      s.send(JSON.stringify({ type: 'join', token: opts.getToken() }));
      // The 100ms publisher exists for the life of the socket, but only
      // publishes state once `welcome` has arrived.
      clearPublish();
      publishTimer = clock.setInterval(() => {
        if (myGen !== generation || socket !== s) return;
        if (!welcomed) return;
        if (s.readyState !== WS_OPEN) return;
        const p = opts.getPosition();
        s.send(
          JSON.stringify({ type: 'state', x: p.x, y: p.y, z: p.z, yaw: p.yaw, score: p.score }),
        );
      }, PUBLISH_INTERVAL_MS);
    };

    s.onmessage = (ev: MessageEvent) => {
      if (myGen !== generation || socket !== s) return; // stale generation
      handleMessage((ev as unknown as { data: string }).data);
    };

    s.onclose = () => {
      if (myGen !== generation || socket !== s) return; // stale
      onUnexpectedClose();
    };

    s.onerror = () => {
      if (myGen !== generation || socket !== s) return;
      try {
        s.close();
      } catch {
        /* ignore */
      }
    };
  }

  function onUnexpectedClose() {
    clearPublish();
    welcomed = false;
    socket = null;
    generation++;
    // Roster MUST clear before the offline status is emitted.
    opts.sink.onRoster([]);
    opts.sink.onStatus('offline', 0);
    if (terminal || !eligible()) return;
    // Back off on a server/network drop, then plateau at 30s.
    const delay = BACKOFF_MS[Math.min(reconnectAttempt, BACKOFF_MS.length - 1)];
    reconnectAttempt++;
    scheduleReconnect(delay);
  }

  function goTerminal(message: string) {
    terminal = true;
    clearReconnect();
    clearPublish();
    welcomed = false;
    opts.sink.onEvent({ kind: 'system', text: message, ts: clock.now() });
    opts.sink.onRoster([]);
    opts.sink.onStatus('offline', 0);
    if (socket) {
      generation++;
      const s = socket;
      socket = null;
      s.onopen = null;
      s.onmessage = null;
      s.onclose = null;
      s.onerror = null;
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  }

  function handleMessage(data: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
    } catch {
      return; // ignore malformed
    }
    switch (msg.type) {
      case 'welcome': {
        welcomed = true;
        reconnectAttempt = 0; // a successful session resets the backoff ladder
        opts.sink.onSelf({
          id: String(msg.id),
          username: String(msg.username),
          color: String(msg.color),
        });
        break;
      }
      case 'auth_error': {
        opts.clearAuth();
        goTerminal(String(msg.message ?? 'Authentication failed'));
        break;
      }
      case 'kicked': {
        goTerminal(String(msg.message ?? 'Disconnected'));
        break;
      }
      case 'chat': {
        opts.sink.onChat({
          from: String(msg.from),
          color: String(msg.color),
          text: String(msg.text),
          ts: Number(msg.ts),
        });
        break;
      }
      case 'system': {
        opts.sink.onChat({
          from: 'system',
          color: '#8a94a5',
          text: String(msg.text),
          ts: clock.now(),
          system: true,
        });
        break;
      }
      case 'event': {
        opts.sink.onEvent({ kind: String(msg.kind), text: String(msg.text), ts: Number(msg.ts) });
        break;
      }
      case 'emote': {
        opts.sink.onEvent({
          kind: 'emote',
          text: `${msg.from} ${msg.emote}s`,
          ts: Number(msg.ts),
        });
        break;
      }
      case 'players': {
        const players = (msg.players as MpRosterPlayer[]) ?? [];
        opts.sink.onStatus('online', players.length);
        opts.sink.onRoster(players);
        opts.sink.onPlayers?.(
          players.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, z: p.z })),
        );
        break;
      }
      case 'race': {
        opts.sink.onRace({
          phase: (msg.phase as MpRace['phase']) ?? 'idle',
          levelId: typeof msg.levelId === 'string' ? msg.levelId : null,
          endsAt: Number(msg.endsAt) || 0,
          winner: typeof msg.winner === 'string' ? msg.winner : null,
        });
        break;
      }
      case 'ping': {
        opts.sink.onPing({
          from: String(msg.from ?? 'player'),
          x: Number(msg.x) || 0,
          y: Number(msg.y) || 0,
          z: Number(msg.z) || 0,
        });
        break;
      }
      default:
        break; // ignore unknown types
    }
  }

  return {
    start() {
      if (started) return;
      started = true;
      terminal = false;
      reconnectAttempt = 0;
      if (eligible()) connect();
    },
    stop() {
      started = false;
      clearReconnect();
      retireSocket();
    },
    setForeground(next: boolean) {
      if (foreground === next) return;
      foreground = next;
      if (!foreground) {
        // Immediate suspend: cancel timers + close, NO retry.
        clearReconnect();
        retireSocket();
        opts.sink.onRoster([]);
        opts.sink.onStatus('offline', 0);
      } else if (eligible() && !socket) {
        // Prompt reconnect on an intentional resume (no backoff wait).
        connect();
      }
    },
    setOnline(next: boolean) {
      if (online === next) return;
      online = next;
      if (!online) {
        clearReconnect();
        // Do not close a live socket on a spurious offline flap; the socket's
        // own close path will fire if the network truly dropped. But cancel
        // any pending reconnect so we don't dial into a dead network.
      } else if (eligible() && !socket) {
        connect();
      }
    },
    send(msg: unknown): boolean {
      if (!socket || socket.readyState !== WS_OPEN) return false;
      socket.send(JSON.stringify(msg));
      return true;
    },
    diagnostics(): MultiplayerDiagnostics {
      return {
        sockets: socket ? 1 : 0,
        timers: timerCount(),
        reconnectAttempt,
      };
    },
    // Expose for diagnostics/testing of the monotonic socket counter.
    get _socketCount() {
      return socketCount;
    },
  } as MultiplayerClient & { readonly _socketCount: number };
}

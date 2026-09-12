import { WebSocketServer } from 'ws';
import * as db from './db.mjs';
import { LEVEL_TIME, isLevelId } from './levels.mjs';

// Realtime hub: presence, chat, emotes, a shared event feed and timed level
// races. Identity always comes from the account session token, so usernames on
// the roster and in chat cannot be spoofed by a client.

const TICK_MS = 100;
const STALE_MS = 30_000;
const PING_COOLDOWN_MS = 2000;
const RESULT_MS = 6_000;
const EMOTE_MS = 2600; // how long an emote stays visible to others

const CHAT_MAX_LEN = 180;
const CHAT_BURST = 5; // messages...
const CHAT_WINDOW_MS = 6000; // ...allowed per window
const EMOTE_COOLDOWN_MS = 1200;

const EMOTES = new Set(['wave', 'dance', 'cheer', 'sit']);

// Strip control characters and collapse runs of whitespace. Chat is rendered as
// plain text in React (no dangerouslySetInnerHTML), so this is about hygiene
// rather than XSS defence.
function cleanChat(raw) {
  return String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX_LEN);
}

function clamp(v, limit) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-limit, Math.min(limit, n)) : 0;
}

export function setupMultiplayer(server, { log = console, originPolicy = null } = {}) {
  // The HTTP server owns the `upgrade` event so the origin policy can decide
  // before any socket is created. We accept only pre-approved upgrades.
  const wss = new WebSocketServer({ noServer: true });
  const players = new Map();

  if (server && originPolicy) {
    server.on('upgrade', (req, socket, head) => {
      const origin = req.headers.origin;
      const path = (req.url || '').split('?')[0];
      const decision = originPolicy.decideUpgrade({ origin, path });
      if (!decision.allowed) {
        log.warn?.({ reason: decision.reason, path }, 'mp: upgrade refused');
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });
  }

  const race = {
    phase: 'idle', // idle | active | won | failed
    levelId: null,
    endsAt: 0,
    winner: null,
    finished: new Set(),
  };

  const raceSnapshot = () => ({
    type: 'race',
    phase: race.phase,
    levelId: race.levelId,
    endsAt: race.endsAt,
    winner: race.winner,
  });

  const resetRace = () => {
    race.phase = 'idle';
    race.levelId = null;
    race.endsAt = 0;
    race.winner = null;
    race.finished = new Set();
  };

  const tickRace = () => {
    const now = Date.now();
    if (race.phase === 'active' && now >= race.endsAt) {
      race.phase = race.winner ? 'won' : 'failed';
      race.endsAt = now + RESULT_MS;
      broadcast(raceSnapshot());
    } else if ((race.phase === 'won' || race.phase === 'failed') && now >= race.endsAt) {
      resetRace();
      broadcast(raceSnapshot());
    }
  };

  const now = () => Date.now();

  const broadcast = (payload, { exclude } = {}) => {
    const data = JSON.stringify(payload);
    for (const [ws, p] of players) {
      if (!p.joined || ws === exclude) continue;
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  };

  const sendEvent = (kind, text) =>
    broadcast({ type: 'event', kind, text, ts: now() });

  const roster = () =>
    Array.from(players.values())
      .filter((p) => p.joined)
      .map((p) => ({
        id: p.playerId,
        name: p.username,
        color: p.color,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        // Emotes expire on the server so a disconnect can't leave someone
        // dancing forever.
        emote: p.emoteUntil > now() ? p.emote : null,
        score: p.score,
      }));

  wss.on('connection', (ws) => {
    const state = {
      joined: false,
      playerId: null,
      username: null,
      color: '#ff8800',
      x: 8,
      y: 15,
      z: 8,
      yaw: 0,
      score: 0,
      emote: null,
      emoteUntil: 0,
      lastEmoteAt: 0,
      chatTimes: [],
      lastSeen: now(),
      lastPing: 0,
    };
    players.set(ws, state);

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      state.lastSeen = now();

      // ── join: authenticate and announce ──────────────────────────────
      if (msg.type === 'join') {
        const token = typeof msg.token === 'string' ? msg.token : '';
        let player = null;
        try {
          if (token) {
            const session = await db.findSession(token);
            if (session) player = await db.findPlayerById(session.player_id);
          }
        } catch (err) {
          log.warn?.({ err: String(err) }, 'mp: session lookup failed');
        }

        if (!player) {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Sign in to play multiplayer' }));
          ws.close(4401, 'unauthenticated');
          return;
        }

        for (const [otherWs, other] of players) {
          if (otherWs !== ws && other.playerId === player.id) {
            try {
              otherWs.send(JSON.stringify({ type: 'kicked', message: 'Signed in from another window' }));
              otherWs.close(4409, 'duplicate');
            } catch {
              /* ignore */
            }
            players.delete(otherWs);
          }
        }

        state.joined = true;
        state.playerId = player.id;
        state.username = player.username;
        state.color = player.color || '#ff8800';
        state.score = player.score ?? 0;

        log.info?.({ username: player.username }, 'mp: player joined');
        ws.send(
          JSON.stringify({
            type: 'welcome',
            id: player.id,
            username: player.username,
            color: state.color,
            emotes: [...EMOTES],
          })
        );
        ws.send(JSON.stringify(raceSnapshot()));
        sendEvent('join', `${player.username} joined the world`);
        return;
      }

      if (!state.joined) return; // everything below requires an identity

      // ── state: position/orientation ──────────────────────────────────
      if (msg.type === 'state') {
        state.x = clamp(msg.x, 100000);
        state.y = clamp(msg.y, 1000);
        state.z = clamp(msg.z, 100000);
        state.yaw = clamp(msg.yaw, 10);
        if (Number.isFinite(Number(msg.score))) {
          state.score = Math.max(0, Math.min(10_000_000, Math.floor(Number(msg.score))));
        }
        return;
      }

      // ── level races ──────────────────────────────────────────────────
      if (msg.type === 'level_start') {
        const id = typeof msg.id === 'string' ? msg.id : '';
        if (!isLevelId(id)) return;
        if (race.phase === 'active') return;
        const secs = LEVEL_TIME[id];
        race.phase = 'active';
        race.levelId = id;
        race.winner = null;
        race.finished = new Set();
        race.endsAt = Date.now() + secs * 1000;
        log.info?.({ username: state.username, id }, 'mp: level race started');
        broadcast(raceSnapshot());
        return;
      }

      if (msg.type === 'level_complete') {
        const id = typeof msg.id === 'string' ? msg.id : '';
        if (race.phase !== 'active' || id !== race.levelId) return;
        if (race.finished.has(state.playerId)) return;
        race.finished.add(state.playerId);
        if (!race.winner) {
          race.winner = state.username;
          race.phase = 'won';
          race.endsAt = Date.now() + RESULT_MS;
          log.info?.({ username: state.username, id }, 'mp: level race won');
        }
        broadcast(raceSnapshot());
        return;
      }

      if (msg.type === 'ping') {
        const now = Date.now();
        if (now - state.lastPing < PING_COOLDOWN_MS) return;
        state.lastPing = now;
        broadcast({
          type: 'ping',
          from: state.username,
          x: clamp(msg.x, 100000),
          y: clamp(msg.y, 1000),
          z: clamp(msg.z, 100000),
        });
        return;
      }

      // ── chat ─────────────────────────────────────────────────────────
      if (msg.type === 'chat') {
        const text = cleanChat(msg.text);
        if (!text) return;

        // Sliding-window rate limit.
        state.chatTimes = state.chatTimes.filter((t) => now() - t < CHAT_WINDOW_MS);
        if (state.chatTimes.length >= CHAT_BURST) {
          ws.send(JSON.stringify({ type: 'system', text: 'Slow down a moment…' }));
          return;
        }
        state.chatTimes.push(now());

        broadcast({
          type: 'chat',
          from: state.username,
          color: state.color,
          text,
          ts: now(),
        });
        return;
      }

      // ── emote ────────────────────────────────────────────────────────
      if (msg.type === 'emote') {
        const name = String(msg.emote ?? '');
        if (!EMOTES.has(name)) return;
        if (now() - state.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
        state.lastEmoteAt = now();
        state.emote = name;
        state.emoteUntil = now() + EMOTE_MS;
        broadcast({ type: 'emote', from: state.username, emote: name, ts: now() });
        return;
      }

      // ── kill feed: client reports its own zombie kills ───────────────
      if (msg.type === 'kill') {
        // Cosmetic only — nothing in the game economy trusts this.
        sendEvent('kill', `${state.username} took down a zombie`);
        return;
      }
    });

    ws.on('close', () => {
      if (state.joined && state.username) {
        log.info?.({ username: state.username }, 'mp: player left');
        players.delete(ws);
        sendEvent('leave', `${state.username} left the world`);
        return;
      }
      players.delete(ws);
    });
    ws.on('error', () => players.delete(ws));
  });

  const timer = setInterval(() => {
    const t = now();
    tickRace();
    for (const [ws, p] of players) {
      if (t - p.lastSeen > STALE_MS) {
        try {
          ws.close(4408, 'idle');
        } catch {
          /* ignore */
        }
        players.delete(ws);
      }
    }
    if (players.size === 0) return;
    const payload = JSON.stringify({ type: 'players', players: roster() });
    for (const [ws, p] of players) {
      if (p.joined && ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }, TICK_MS);

  wss.on('close', () => clearInterval(timer));
  return wss;
}

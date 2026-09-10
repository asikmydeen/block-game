import { WebSocketServer } from 'ws';
import * as db from './db.mjs';
import { LEVEL_TIME, isLevelId } from './levels.mjs';

// Realtime presence + timed level races. Identity comes from the session token.

const TICK_MS = 100;
const STALE_MS = 30_000;
const PING_COOLDOWN_MS = 2000;
const RESULT_MS = 6_000;

function clamp(v, limit) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-limit, Math.min(limit, n)) : 0;
}

export function setupMultiplayer(server, { log = console } = {}) {
  const wss = new WebSocketServer({ server, path: '/api/mp' });
  const players = new Map();

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

  const broadcast = (obj) => {
    const payload = JSON.stringify(obj);
    for (const ws of players.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  };

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
      lastSeen: Date.now(),
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
      state.lastSeen = Date.now();

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
        log.info?.({ username: player.username }, 'mp: player joined');
        ws.send(
          JSON.stringify({
            type: 'welcome',
            id: player.id,
            username: player.username,
            color: state.color,
          })
        );
        ws.send(JSON.stringify(raceSnapshot()));
        return;
      }

      if (!state.joined) return;

      if (msg.type === 'state') {
        state.x = clamp(msg.x, 100000);
        state.y = clamp(msg.y, 1000);
        state.z = clamp(msg.z, 100000);
        state.yaw = clamp(msg.yaw, 10);
        return;
      }

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
      }
    });

    ws.on('close', () => {
      if (state.username) log.info?.({ username: state.username }, 'mp: player left');
      players.delete(ws);
    });
    ws.on('error', () => players.delete(ws));
  });

  const timer = setInterval(() => {
    const now = Date.now();
    tickRace();
    for (const [ws, p] of players) {
      if (now - p.lastSeen > STALE_MS) {
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
    for (const ws of players.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }, TICK_MS);

  wss.on('close', () => clearInterval(timer));
  return wss;
}

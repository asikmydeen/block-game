import { WebSocketServer, WebSocket } from 'ws';
import * as db from './db.mjs';

// Realtime presence hub. Identity comes from the account session token, so the
// roster carries real usernames instead of client-supplied nicknames.

const TICK_MS = 100; // roster broadcast rate (10/s)
const STALE_MS = 30_000;

export function setupMultiplayer(server, { log = console } = {}) {
  const wss = new WebSocketServer({ server, path: '/api/mp' });
  const players = new Map(); // ws -> state

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
    };
    players.set(ws, state);

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return; // ignore malformed
      }
      state.lastSeen = Date.now();

      if (msg.type === 'join') {
        // Authenticate with the account session token.
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

        // One live connection per account: kick the older one.
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
        return;
      }

      if (msg.type === 'state' && state.joined) {
        const clamp = (v, limit) => {
          const n = Number(v);
          return Number.isFinite(n) ? Math.max(-limit, Math.min(limit, n)) : 0;
        };
        state.x = clamp(msg.x, 100000);
        state.y = clamp(msg.y, 1000);
        state.z = clamp(msg.z, 100000);
        state.yaw = clamp(msg.yaw, 10);
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

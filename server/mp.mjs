import { WebSocketServer } from 'ws';
import * as db from './db.mjs';

// Realtime presence hub. Identity comes from the account session token, so the
// roster carries real usernames instead of client-supplied nicknames.
// Also hosts a session-only Night Raid (shared kill goal, local zombies).

const TICK_MS = 100; // roster broadcast rate (10/s)
const STALE_MS = 30_000;
const PING_COOLDOWN_MS = 2000;

const RAID_WAVES = [
  { goal: 15, durationMs: 75_000 },
  { goal: 25, durationMs: 75_000 },
  { goal: 40, durationMs: 75_000 },
];
const REST_MS = 12_000;
const RESULT_MS = 8_000;

function clamp(v, limit) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-limit, Math.min(limit, n)) : 0;
}

export function setupMultiplayer(server, { log = console } = {}) {
  const wss = new WebSocketServer({ server, path: '/api/mp' });
  const players = new Map(); // ws -> state

  const raid = {
    phase: 'idle', // idle | active | rest | won | failed
    wave: 0,
    kills: 0,
    goal: 0,
    endsAt: 0,
  };

  const raidSnapshot = () => ({
    type: 'raid',
    phase: raid.phase,
    wave: raid.wave,
    kills: raid.kills,
    goal: raid.goal,
    endsAt: raid.endsAt,
  });

  const broadcast = (obj) => {
    const payload = JSON.stringify(obj);
    for (const ws of players.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  };

  const startWave = (n) => {
    const spec = RAID_WAVES[n - 1];
    raid.phase = 'active';
    raid.wave = n;
    raid.kills = 0;
    raid.goal = spec.goal;
    raid.endsAt = Date.now() + spec.durationMs;
  };

  const resetRaid = () => {
    raid.phase = 'idle';
    raid.wave = 0;
    raid.kills = 0;
    raid.goal = 0;
    raid.endsAt = 0;
  };

  const tickRaid = () => {
    const now = Date.now();
    if (raid.phase === 'active' && now >= raid.endsAt) {
      if (raid.kills >= raid.goal) {
        if (raid.wave >= RAID_WAVES.length) {
          raid.phase = 'won';
          raid.endsAt = now + RESULT_MS;
        } else {
          raid.phase = 'rest';
          raid.endsAt = now + REST_MS;
        }
      } else {
        raid.phase = 'failed';
        raid.endsAt = now + RESULT_MS;
      }
      broadcast(raidSnapshot());
    } else if (raid.phase === 'rest' && now >= raid.endsAt) {
      startWave(raid.wave + 1);
      broadcast(raidSnapshot());
    } else if ((raid.phase === 'won' || raid.phase === 'failed') && now >= raid.endsAt) {
      resetRaid();
      broadcast(raidSnapshot());
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
        return; // ignore malformed
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
        ws.send(JSON.stringify(raidSnapshot()));
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

      if (msg.type === 'raid_start') {
        if (raid.phase === 'active' || raid.phase === 'rest') return;
        startWave(1);
        log.info?.({ username: state.username }, 'mp: night raid started');
        broadcast(raidSnapshot());
        return;
      }

      if (msg.type === 'raid_kill') {
        if (raid.phase !== 'active') return;
        raid.kills += 1;
        if (raid.kills >= raid.goal) {
          const now = Date.now();
          if (raid.wave >= RAID_WAVES.length) {
            raid.phase = 'won';
            raid.endsAt = now + RESULT_MS;
          } else {
            raid.phase = 'rest';
            raid.endsAt = now + REST_MS;
          }
        }
        broadcast(raidSnapshot());
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
    tickRaid();
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

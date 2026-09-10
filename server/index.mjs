import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.mjs';
import * as auth from './auth.mjs';
import { setupMultiplayer } from './mp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(__dirname, '..', 'dist', 'public');
const port = Number(process.env.PORT ?? 3000);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[api]', req.method, req.path, String(err));
  res.status(500).json({ error: 'internal_error' });
});

// ── Health ────────────────────────────────────────────────────────────────
app.get('/api/healthz', (_req, res) => {
  res.json({ status: 'ok', db: db.dbConfigured ? 'configured' : 'missing_env' });
});

// ── Auth ──────────────────────────────────────────────────────────────────

// Silent resume for a known browser: no username prompt if we've seen it.
app.post('/api/auth/resume', wrap(async (req, res) => {
  const deviceId = String(req.body?.deviceId ?? '').slice(0, 64);
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  const result = await auth.loginWithDevice(deviceId);
  if (!result) return res.status(404).json({ error: 'unknown_device' });
  res.json(result);
}));

// Log in / register by username. Passwordless for now, by design.
app.post('/api/auth/login', wrap(async (req, res) => {
  const username = req.body?.username;
  const deviceId = String(req.body?.deviceId ?? '').slice(0, 64) || null;
  const result = await auth.loginWithUsername(username, deviceId);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(result);
}));

// A free username suggestion for the "generate one for me" button.
app.get('/api/auth/suggest', wrap(async (_req, res) => {
  for (let i = 0; i < 8; i++) {
    const candidate = auth.suggestUsername();
    if (!(await db.findPlayerByUsername(candidate))) {
      return res.json({ username: candidate });
    }
  }
  res.json({ username: `${auth.suggestUsername()}${Math.floor(Math.random() * 900 + 100)}` });
}));

app.get('/api/auth/me', wrap(async (req, res) => {
  const ctx = await auth.playerFromRequest(req);
  if (!ctx) return res.status(401).json({ error: 'unauthenticated' });
  await db.touchSession(ctx.token);
  res.json({ player: auth.publicPlayer(ctx.player) });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const ctx = await auth.playerFromRequest(req);
  if (ctx) await db.deleteSession(ctx.token);
  res.json({ ok: true });
}));

// ── Progress ──────────────────────────────────────────────────────────────

// Save run progress. Monotonic where it matters: best_score/kills/deaths only
// ever climb, so a stale client can't erase earned progress.
app.post('/api/profile/progress', wrap(async (req, res) => {
  const ctx = await auth.playerFromRequest(req);
  if (!ctx) return res.status(401).json({ error: 'unauthenticated' });

  const b = req.body ?? {};
  const num = (v, max) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
  };

  const patch = { last_seen_at: new Date().toISOString() };
  const score = num(b.score, 10_000_000);
  if (score !== null) {
    patch.score = score;
    patch.best_score = Math.max(score, ctx.player.best_score ?? 0);
  }
  const kills = num(b.zombieKills, 10_000_000);
  if (kills !== null) patch.zombie_kills = Math.max(kills, ctx.player.zombie_kills ?? 0);
  const deaths = num(b.deaths, 10_000_000);
  if (deaths !== null) patch.deaths = Math.max(deaths, ctx.player.deaths ?? 0);
  const secs = num(b.playSeconds, 100_000_000);
  if (secs !== null) patch.play_seconds = Math.max(secs, ctx.player.play_seconds ?? 0);

  if (Array.isArray(b.ownedWeapons)) {
    const allowed = new Set(['hand', 'sword', 'axe', 'katana', 'blaster', 'shotgun', 'rifle']);
    const owned = [...new Set(b.ownedWeapons.filter((w) => allowed.has(w)))];
    // Never lose a purchased weapon.
    for (const w of ctx.player.owned_weapons ?? []) if (!owned.includes(w)) owned.push(w);
    if (owned.length) patch.owned_weapons = owned;
  }

  if (Array.isArray(b.missionsCompleted)) {
    const allowed = new Set([
      'park',
      'firstblood',
      'scavenger',
      'wheels',
      'nightwatch',
      'streets',
      'rooftop',
      'laststand',
    ]);
    const incoming = b.missionsCompleted.filter((id) => allowed.has(id));
    const prev = ctx.player.missions_completed ?? [];
    patch.missions_completed = [...new Set([...prev, ...incoming])];
  }

  const updated = await db.updatePlayerStats(ctx.player.id, patch);
  res.json({ player: auth.publicPlayer(updated ?? ctx.player) });
}));

app.get('/api/leaderboard', wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const rows = await db.leaderboard(limit);
  res.json({
    leaders: rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      bestScore: r.best_score ?? 0,
      zombieKills: r.zombie_kills ?? 0,
      deaths: r.deaths ?? 0,
    })),
  });
}));

// ── Static frontend + SPA fallback ────────────────────────────────────────
// Hashed assets are safe to cache; index.html must not be, or a stale shell
// keeps pointing at asset hashes that no longer exist after a deploy.
app.use(express.static(STATIC_DIR, { maxAge: '1h', index: false }));

app.get('/api/*splat', (_req, res) => res.status(404).json({ error: 'not_found' }));

const sendIndex = (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
};
// Express 5's '/*splat' does not match the root path, so '/' is explicit.
app.get('/', sendIndex);
app.get('/*splat', sendIndex);

const server = createServer(app);
setupMultiplayer(server, { log: console });

server.listen(port, () => {
  console.log(
    `[block-game] listening on ${port} · static=${STATIC_DIR} · db=${db.dbConfigured ? 'ok' : 'MISSING SUPABASE ENV'}`
  );
});

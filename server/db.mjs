// Supabase REST data access (service_role key — bypasses RLS).
// Kept as plain fetch calls so the server has no heavy SDK dependency.

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  '';

export const dbConfigured = Boolean(SUPABASE_URL && SERVICE_KEY);

// ── Local in-memory fallback ────────────────────────────────────────────────
// When no Supabase env is present (local dev / testing), back the same data
// functions with process-memory maps so auth, persistence, leaderboard, and
// multiplayer identity all work without an external database. This branch is
// only ever reached when `dbConfigured` is false, so production (env present)
// behavior is unchanged. Data lives only for the lifetime of the process.
const mem = {
  playersById: new Map(),
  playersByUsernameLower: new Map(),
  sessions: new Map(),
  devices: new Map(),
  seq: 0,
};

if (!dbConfigured) {
  console.warn(
    '[db] SUPABASE env missing — using in-memory store. Accounts/progress persist only until the server restarts.'
  );
}

function clonePlayer(p) {
  return p ? { ...p, owned_weapons: [...(p.owned_weapons || [])], missions_completed: [...(p.missions_completed || [])] } : p;
}

function memFindPlayerByUsername(username) {
  return clonePlayer(mem.playersByUsernameLower.get(username.toLowerCase()) || null);
}

function memFindPlayerById(id) {
  return clonePlayer(mem.playersById.get(id) || null);
}

function memCreatePlayer(username, color) {
  const now = new Date().toISOString();
  const player = {
    id: `mem-${++mem.seq}`,
    username,
    color,
    score: 0,
    best_score: 0,
    zombie_kills: 0,
    deaths: 0,
    owned_weapons: [],
    play_seconds: 0,
    created_at: now,
    last_seen_at: now,
    missions_completed: [],
  };
  mem.playersById.set(player.id, player);
  mem.playersByUsernameLower.set(username.toLowerCase(), player);
  return clonePlayer(player);
}

function memUpdatePlayerStats(id, patch) {
  const player = mem.playersById.get(id);
  if (!player) return null;
  Object.assign(player, patch);
  return clonePlayer(player);
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path, init = {}) {
  if (!dbConfigured) throw new Error('supabase_not_configured');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: headers(init.headers),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const PLAYER_COLS_CORE =
  'id,username,color,score,best_score,zombie_kills,deaths,owned_weapons,play_seconds,created_at,last_seen_at';
let playerCols = `${PLAYER_COLS_CORE},missions_completed`;
let missionsColumn = true;

function dropMissionsColumn(err) {
  const msg = String(err);
  if (missionsColumn && /missions_completed/i.test(msg)) {
    missionsColumn = false;
    playerCols = PLAYER_COLS_CORE;
    return true;
  }
  return false;
}

export function missionsColumnEnabled() {
  return missionsColumn;
}

export async function findPlayerByUsername(username) {
  if (!dbConfigured) return memFindPlayerByUsername(username);
  try {
    const rows = await rest(
      `bg_players?select=${playerCols}&username_lower=eq.${encodeURIComponent(username.toLowerCase())}&limit=1`
    );
    return rows?.[0] || null;
  } catch (err) {
    if (dropMissionsColumn(err)) return findPlayerByUsername(username);
    throw err;
  }
}

export async function findPlayerById(id) {
  if (!dbConfigured) return memFindPlayerById(id);
  try {
    const rows = await rest(`bg_players?select=${playerCols}&id=eq.${encodeURIComponent(id)}&limit=1`);
    return rows?.[0] || null;
  } catch (err) {
    if (dropMissionsColumn(err)) return findPlayerById(id);
    throw err;
  }
}

export async function createPlayer(username, color) {
  if (!dbConfigured) return memCreatePlayer(username, color);
  try {
    const rows = await rest(`bg_players?select=${playerCols}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ username, color }]),
    });
    return rows?.[0] || null;
  } catch (err) {
    if (dropMissionsColumn(err)) return createPlayer(username, color);
    throw err;
  }
}

export async function touchPlayer(id) {
  if (!dbConfigured) {
    const p = mem.playersById.get(id);
    if (p) p.last_seen_at = new Date().toISOString();
    return;
  }
  await rest(`bg_players?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  });
}

export async function updatePlayerStats(id, patch) {
  if (!dbConfigured) return memUpdatePlayerStats(id, patch);
  const body = { ...patch };
  if (!missionsColumn) delete body.missions_completed;
  try {
    const rows = await rest(`bg_players?id=eq.${encodeURIComponent(id)}&select=${playerCols}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    return rows?.[0] || null;
  } catch (err) {
    if (dropMissionsColumn(err)) return updatePlayerStats(id, patch);
    throw err;
  }
}

export async function createSession(token, playerId, deviceId) {
  if (!dbConfigured) {
    mem.sessions.set(token, { token, player_id: playerId, device_id: deviceId || null });
    return;
  }
  await rest('bg_sessions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{ token, player_id: playerId, device_id: deviceId || null }]),
  });
}

export async function findSession(token) {
  if (!dbConfigured) return mem.sessions.get(token) || null;
  const rows = await rest(
    `bg_sessions?select=token,player_id,device_id&token=eq.${encodeURIComponent(token)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function touchSession(token) {
  if (!dbConfigured) return;
  await rest(`bg_sessions?token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  });
}

export async function deleteSession(token) {
  if (!dbConfigured) {
    mem.sessions.delete(token);
    return;
  }
  await rest(`bg_sessions?token=eq.${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

// device -> player mapping ("same computer, same account")
export async function upsertDevice(deviceId, playerId) {
  if (!dbConfigured) {
    mem.devices.set(deviceId, { device_id: deviceId, player_id: playerId });
    return;
  }
  await rest('bg_devices?on_conflict=device_id', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify([{ device_id: deviceId, player_id: playerId, updated_at: new Date().toISOString() }]),
  });
}

export async function findDevice(deviceId) {
  if (!dbConfigured) return mem.devices.get(deviceId) || null;
  const rows = await rest(
    `bg_devices?select=device_id,player_id&device_id=eq.${encodeURIComponent(deviceId)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function leaderboard(limit = 10) {
  if (!dbConfigured) {
    return [...mem.playersById.values()]
      .sort((a, b) => b.best_score - a.best_score)
      .slice(0, Number(limit) || 10)
      .map((p) => ({
        username: p.username,
        best_score: p.best_score,
        zombie_kills: p.zombie_kills,
        deaths: p.deaths,
      }));
  }
  return (
    (await rest(
      `bg_players?select=username,best_score,zombie_kills,deaths&order=best_score.desc&limit=${Number(limit) || 10}`
    )) || []
  );
}

// Supabase REST data access (service_role key — bypasses RLS).
// Kept as plain fetch calls so the server has no heavy SDK dependency.

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  '';

export const dbConfigured = Boolean(SUPABASE_URL && SERVICE_KEY);

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
  try {
    const rows = await rest(`bg_players?select=${playerCols}&id=eq.${encodeURIComponent(id)}&limit=1`);
    return rows?.[0] || null;
  } catch (err) {
    if (dropMissionsColumn(err)) return findPlayerById(id);
    throw err;
  }
}

export async function createPlayer(username, color) {
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
  await rest(`bg_players?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  });
}

export async function updatePlayerStats(id, patch) {
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
  await rest('bg_sessions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{ token, player_id: playerId, device_id: deviceId || null }]),
  });
}

export async function findSession(token) {
  const rows = await rest(
    `bg_sessions?select=token,player_id,device_id&token=eq.${encodeURIComponent(token)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function touchSession(token) {
  await rest(`bg_sessions?token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  });
}

export async function deleteSession(token) {
  await rest(`bg_sessions?token=eq.${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

// device -> player mapping ("same computer, same account")
export async function upsertDevice(deviceId, playerId) {
  await rest('bg_devices?on_conflict=device_id', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify([{ device_id: deviceId, player_id: playerId, updated_at: new Date().toISOString() }]),
  });
}

export async function findDevice(deviceId) {
  const rows = await rest(
    `bg_devices?select=device_id,player_id&device_id=eq.${encodeURIComponent(deviceId)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function leaderboard(limit = 10) {
  return (
    (await rest(
      `bg_players?select=username,best_score,zombie_kills,deaths&order=best_score.desc&limit=${Number(limit) || 10}`
    )) || []
  );
}

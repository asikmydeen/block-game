import { randomBytes, randomUUID } from 'node:crypto';
import * as db from './db.mjs';

// ── Username rules ────────────────────────────────────────────────────────
// 3-16 chars, letters/digits/_/-. Case is preserved for display but uniqueness
// is case-insensitive (enforced by the generated username_lower unique index).
const USERNAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
const RESERVED = new Set(['admin', 'root', 'system', 'server', 'null', 'undefined', 'me']);

export function validateUsername(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return { ok: false, error: 'Username required' };
  if (!USERNAME_RE.test(name)) {
    return { ok: false, error: '3-16 characters, letters/numbers/_/- only' };
  }
  if (RESERVED.has(name.toLowerCase())) return { ok: false, error: 'That username is reserved' };
  return { ok: true, name };
}

const ADJECTIVES = ['Swift', 'Brave', 'Blocky', 'Neon', 'Rusty', 'Turbo', 'Shadow', 'Crimson', 'Golden', 'Wild'];
const NOUNS = ['Miner', 'Digger', 'Crafter', 'Rider', 'Ranger', 'Hunter', 'Nomad', 'Builder', 'Pilot', 'Scout'];

export function suggestUsername() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a}${n}${Math.floor(Math.random() * 90 + 10)}`;
}

const COLORS = ['#ff6b5a', '#5ad1ff', '#8affc1', '#ffd24d', '#e0aaff', '#f9c74f', '#48cae4', '#ff8fa3'];
export function pickColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function newToken() {
  return randomBytes(32).toString('hex');
}

export function newDeviceId() {
  return randomUUID();
}

export function publicPlayer(p) {
  if (!p) return null;
  return {
    id: p.id,
    username: p.username,
    color: p.color,
    score: p.score ?? 0,
    bestScore: p.best_score ?? 0,
    zombieKills: p.zombie_kills ?? 0,
    deaths: p.deaths ?? 0,
    ownedWeapons: p.owned_weapons ?? ['hand', 'sword', 'blaster'],
    playSeconds: p.play_seconds ?? 0,
    missionsCompleted: Array.isArray(p.missions_completed) ? p.missions_completed : [],
  };
}

// Resolve the caller from an Authorization: Bearer <token> header, falling back
// to a token in the JSON body (navigator.sendBeacon cannot set headers, and the
// client uses it for a final save on pagehide).
export async function playerFromRequest(req) {
  const header = req.headers?.authorization || '';
  let token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  if (!token && typeof req.body?.token === 'string') token = req.body.token.trim();
  if (!token) return null;
  const session = await db.findSession(token);
  if (!session) return null;
  const player = await db.findPlayerById(session.player_id);
  if (!player) return null;
  return { token, player };
}

// Log in (or register) by username. Passwordless by design for now: claiming a
// username is enough. The device is remembered so the same browser silently
// resumes the same account next visit.
export async function loginWithUsername(rawUsername, deviceId) {
  const v = validateUsername(rawUsername);
  if (!v.ok) return { error: v.error, status: 400 };

  let player = await db.findPlayerByUsername(v.name);
  let created = false;
  if (!player) {
    try {
      player = await db.createPlayer(v.name, pickColor());
      created = true;
    } catch (err) {
      // Lost a race on the unique index — re-read the winner.
      player = await db.findPlayerByUsername(v.name);
      if (!player) throw err;
    }
  }

  const token = newToken();
  const device = deviceId || newDeviceId();
  await db.createSession(token, player.id, device);
  await db.upsertDevice(device, player.id);
  await db.touchPlayer(player.id);

  return { token, deviceId: device, player: publicPlayer(player), created };
}

// Silent resume: this browser has been here before.
export async function loginWithDevice(deviceId) {
  if (!deviceId) return null;
  const mapping = await db.findDevice(deviceId);
  if (!mapping) return null;
  const player = await db.findPlayerById(mapping.player_id);
  if (!player) return null;
  const token = newToken();
  await db.createSession(token, player.id, deviceId);
  await db.touchPlayer(player.id);
  return { token, deviceId, player: publicPlayer(player), created: false };
}

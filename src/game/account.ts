// Account client: passwordless username login with device memory.
//
// Same computer -> same account: a random deviceId is stored in localStorage on
// first visit and mapped to the account server-side, so return visits resume
// silently. Entering a username switches to (or claims) that account.

export interface Account {
  id: string;
  username: string;
  color: string;
  score: number;
  bestScore: number;
  zombieKills: number;
  deaths: number;
  ownedWeapons: string[];
  playSeconds: number;
  missionsCompleted: string[];
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  bestScore: number;
  zombieKills: number;
  deaths: number;
}

const DEVICE_KEY = 'blockgame.deviceId';
const TOKEN_KEY = 'blockgame.token';

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode — session stays in memory only */
  }
}

function clearLocal(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getDeviceId(): string {
  let id = readLocal(DEVICE_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `dev-${Math.random().toString(36).slice(2)}${Date.now()}`);
    writeLocal(DEVICE_KEY, id);
  }
  return id;
}

let token: string | null = readLocal(TOKEN_KEY);
export function getToken(): string | null {
  return token;
}

function setToken(next: string | null) {
  token = next;
  if (next) writeLocal(TOKEN_KEY, next);
  else clearLocal(TOKEN_KEY);
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body?.error || `request failed (${res.status})`);
  return body as T;
}

type AuthResponse = { token: string; deviceId: string; player: Account; created: boolean };

/** Silent resume for a returning browser. Returns null if unknown. */
export async function resume(): Promise<Account | null> {
  const deviceId = getDeviceId();

  // An existing token is the fastest path.
  if (token) {
    try {
      const { player } = await api<{ player: Account }>('/api/auth/me');
      return player;
    } catch {
      setToken(null); // expired/unknown — fall through to device resume
    }
  }

  try {
    const res = await api<AuthResponse>('/api/auth/resume', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    });
    setToken(res.token);
    return res.player;
  } catch {
    return null; // new device: show the username prompt
  }
}

/** Log in or register with a username (no password by design, for now). */
export async function login(username: string): Promise<{ account: Account; created: boolean }> {
  const res = await api<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, deviceId: getDeviceId() }),
  });
  setToken(res.token);
  writeLocal(DEVICE_KEY, res.deviceId);
  return { account: res.player, created: res.created };
}

export async function suggestUsername(): Promise<string> {
  const { username } = await api<{ username: string }>('/api/auth/suggest');
  return username;
}

export async function logout(): Promise<void> {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* best effort */
  }
  setToken(null);
}

export interface ProgressPatch {
  score?: number;
  zombieKills?: number;
  deaths?: number;
  playSeconds?: number;
  ownedWeapons?: string[];
  missionsCompleted?: string[];
}

/** Persist run progress. Server keeps monotonic maxima, so this is safe to retry. */
export async function saveProgress(patch: ProgressPatch): Promise<Account | null> {
  if (!token) return null;
  try {
    const { player } = await api<{ player: Account }>('/api/profile/progress', {
      method: 'POST',
      body: JSON.stringify(patch),
    });
    return player;
  } catch {
    return null; // offline or transient — the next autosave retries
  }
}

export async function fetchLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  try {
    const { leaders } = await api<{ leaders: LeaderboardEntry[] }>(`/api/leaderboard?limit=${limit}`);
    return leaders;
  } catch {
    return [];
  }
}

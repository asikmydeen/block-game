# Craftworld (block-game)

A blocky 3D voxel world — build and mine, drive cars that obey traffic lights, ride
animals, fight zombies for points, buy weapons, and see other players in real time.

Live: https://block-game.asikmydeen.com

## Stack

| Layer | Choice |
|---|---|
| Client | React 19 + Vite + three.js (React Three Fiber) |
| Server | Node + Express 5 (single service: serves the built client **and** the API) |
| Realtime | `ws` WebSocket at `/api/mp` |
| Data | Supabase Postgres via REST (service-role key, server-side only) |
| Deploy | Dokploy on TrueNAS, public via Cloudflare Tunnel |

One service serves everything, so the frontend, API, and WebSocket all share an
origin and no CORS or cross-host config is needed.

## Accounts (passwordless, by design for now)

- **Same computer → same account.** On first visit the browser stores a random
  `deviceId`; the server maps it to your player row. Return visits resume silently
  with no prompt.
- **Log in anywhere by username.** Typing an existing username picks that account
  back up. There is deliberately **no password yet** — claiming a name is enough.
- Usernames are 3–16 chars (`A–Z a–z 0–9 _ -`), unique case-insensitively.
- A session token (opaque, random) is issued on login and stored in
  `localStorage`; API calls send it as `Authorization: Bearer <token>`.

> Security note: because there are no passwords, anyone who knows a username can
> assume that account. Fine for a game among friends; add passwords (or an OAuth
> provider) before treating identity as trustworthy.

## Persistence

Score, best score, zombie kills, deaths, unlocked weapons, and playtime are saved
to the account. Writes are debounced (~2s) and **monotonic on the server** —
`best_score`, kills, deaths, playtime only ever increase, and purchased weapons are
never removed — so a stale or offline client can't erase earned progress. A
`pagehide` beacon does a final save when you close the tab.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/healthz` | Liveness + whether Supabase env is present |
| POST | `/api/auth/resume` | Silent login from `{ deviceId }` |
| POST | `/api/auth/login` | Login/register `{ username, deviceId }` |
| GET | `/api/auth/suggest` | An unused username suggestion |
| GET | `/api/auth/me` | Current player (Bearer token) |
| POST | `/api/auth/logout` | Invalidate the session |
| POST | `/api/profile/progress` | Save run progress (monotonic) |
| GET | `/api/leaderboard?limit=10` | Top players by best score |
| WS | `/api/mp` | Multiplayer presence; join with `{ type:'join', token }` |

Multiplayer identity is resolved **server-side from the session token**, so the
roster carries real usernames — clients can't spoof a name. One live connection per
account; a second sign-in kicks the older one.

## Database

Three tables (applied to Supabase Postgres):

- `bg_players` — identity + stats (`username_lower` generated column carries the
  case-insensitive unique index)
- `bg_sessions` — issued session tokens
- `bg_devices` — `deviceId → player` map that powers "same computer, same account"

RLS is enabled on all three; the server uses the service-role key, which bypasses
it. No anon-key access is granted, so the browser can only reach data through the
API above.

## Local development

```bash
npm install
cp .env.example .env      # fill in SUPABASE_SERVICE_ROLE_KEY
npm run dev               # vite on :5173 + api on :3000 (vite proxies /api, WS included)
```

Then open http://localhost:5173.

Production build (what Dokploy runs):

```bash
npm run build             # vite -> dist/public
npm start                 # express serves dist/public + /api + /api/mp
```

## Controls

WASD move · Space jump · Mouse look · Left click break/attack · Right click place ·
1–9 blocks · Q weapon · B weapon shop · V camera · N day/night · E car or animal ·
R repair car · Space handbrake while driving.

Lamplight repels zombies at night. You can fight from animal-back.

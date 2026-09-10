# Craftworld (block-game)

A blocky 3D voxel world — build and mine, drive cars that obey traffic lights, ride
animals, fight zombies for points, run a short city campaign, buy weapons, and
fight Night Raids with other players.

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

Score, best score, zombie kills, deaths, unlocked weapons, completed missions, and
playtime are saved to the account. Writes are debounced (~2s) and **monotonic on
the server** — `best_score`, kills, deaths, playtime only ever increase, purchased
weapons are never removed, and mission ids are a union — so a stale or offline
client can't erase earned progress. A `pagehide` beacon does a final save when you
close the tab. Completed missions are also cached in `localStorage` per account.

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
  case-insensitive unique index). Add missions with:

  ```sql
  alter table bg_players
    add column if not exists missions_completed text[] not null default '{}';
  ```

  The API falls back if the column is missing so login still works before you
  migrate; mission progress then lives in `localStorage` until the column exists.
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
1–9 blocks · Q weapon · B weapon shop · Esc pause (camera, day/night, missions) ·
E car or animal · R repair car · Space handbrake while driving.

On a phone: joystick to move, drag to look, JUMP / ATK on the right. Fight/Build
switch sits under the joystick with the current weapon or block. Drive / Ride /
Fix appear only when something is nearby. ☰ opens pause (missions, camera,
day/night, touch/mouse). 🛒 is the shop.

Lamplight repels zombies at night. You can fight from animal-back.

## Missions

Eight sequential jobs in the existing city (park, kills, chest, drive, night
survive, night hunt, rooftop, last stand). Open ☰ → Missions, or accept the
first-run prompt. Completing one auto-starts the next. Rewards are shop points.

## Multiplayer Night Raid

Any joined player can start a Night Raid from pause. The server tracks a shared
kill goal across three night waves; each client still simulates its own zombies
and reports kills. Win a wave for bonus points. Pause also has a ping (beacon
others can see) and a nearby-player list.

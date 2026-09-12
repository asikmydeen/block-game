import { defineConfig, devices } from '@playwright/test';

// Task 14.7 — browser regression + commit-rate suite.
//
// The suite runs against the PRODUCTION web build served by the app's own
// Express server (server/index.mjs, `npm start`). No Supabase env is passed, so
// db.mjs falls back to its ephemeral in-memory store: accounts, progress, the
// leaderboard and multiplayer identity all work and reset when the process
// exits, making every run deterministic and independent.
//
// The origin allowlist is set to the exact test origin so the server's
// origin-policy middleware admits same-origin REST + the WebSocket upgrade.
// Everything binds to 127.0.0.1 only.

const HOST = '127.0.0.1';
const PORT = 3100; // avoid clashing with a dev server on 3000
const ORIGIN = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // one shared in-memory server; keep account state predictable
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
    // Headless chromium; the game force-disables the WebGL performance caveat,
    // and swiftshader gives a usable GL context in CI.
    headless: true,
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Build the web bundle with NODE_ENV=development before serving. `vite
    // build` forces import.meta.env.PROD=true regardless of --mode, and a
    // production endpoint resolution (task 2) rejects an HTTP loopback origin by
    // design. NODE_ENV=development flips PROD=false so the resolver takes its
    // non-production branch and admits the same-origin loopback test origin —
    // exercising the identical app code, just built with the dev flag.
    command: 'NODE_ENV=development npx vite build --mode development && node server/index.mjs',
    url: `${ORIGIN}/api/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      ORIGIN_ALLOWLIST: ORIGIN,
      // Force the ephemeral in-memory backend even if a local .env exports these.
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_SERVICE_KEY: '',
      SUPABASE_KEY: '',
    },
  },
});

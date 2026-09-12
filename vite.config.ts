import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

import {
  API_VAR,
  TARGET_VAR,
  WS_VAR,
  validateEndpointPair,
} from './scripts/native/validate-endpoints.mjs';

// In dev, vite serves the client on 5173 and proxies /api (including the
// multiplayer WebSocket upgrade) to the API server on 3000. In production the
// API server serves the built client itself, so no proxy is involved.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

// A native build embeds its backend endpoints at bundle time and has no
// browser-origin fallback. Before Vite transforms a single client module for a
// `native` build, assert the endpoint pair is complete, absolute, and (for a
// production build) secure — failing closed with a message that names the
// offending variable rather than shipping an app pointed at the wrong or an
// insecure backend. Web/default builds resolve against the browser origin at
// runtime and need no build-time overrides, so they skip the gate entirely.
//
// Overrides may arrive from a `.env.<mode>` source or from an explicit process
// variable, so resolve through Vite's loadEnv (which reads `.env*` for the
// mode) and let process.env win for anything set directly on the invocation.
function assertNativeEndpointsForBuild(mode: string): void {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const readVar = (name: string): string | undefined => process.env[name] ?? fileEnv[name];

  const target = readVar(TARGET_VAR) ?? 'web';
  if (target !== 'native') return;

  const production = mode !== 'development' && process.env.NODE_ENV !== 'development';
  const result = validateEndpointPair({
    apiBaseUrl: readVar(API_VAR),
    webSocketUrl: readVar(WS_VAR),
    target,
    production,
  });
  if (result.ok) return;

  const details = result.diagnostics
    .map(({ variable, message }) => `  - [${variable}] ${message}`)
    .join('\n');
  throw new Error(
    `Native endpoint configuration is invalid; aborting before Vite transforms any module:\n${details}`,
  );
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    assertNativeEndpointsForBuild(mode);
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
      dedupe: ['react', 'react-dom'],
    },
    build: {
      outDir: 'dist/public',
      emptyOutDir: true,
    },
    server: {
      port: Number(process.env.PORT ?? 5173),
      host: '0.0.0.0',
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, ws: true },
      },
    },
  };
});

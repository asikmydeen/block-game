import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// In dev, vite serves the client on 5173 and proxies /api (including the
// multiplayer WebSocket upgrade) to the API server on 3000. In production the
// API server serves the built client itself, so no proxy is involved.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
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
});

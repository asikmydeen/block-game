import { defineConfig } from 'vitest/config';
import path from 'node:path';

// One-shot (non-watch) unit/property test runner for the shared client code.
//
// Node built-in tests under scripts/native/__tests__ run separately via
// `npm run test:node`; they are intentionally excluded here so a single Vitest
// invocation only owns the browser/client TypeScript suites.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    // jsdom gives the client suites a `window`/`navigator`/`Blob` surface that
    // matches the browser runtime the code targets.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Explicit imports (no global test API) keep the strict production
    // tsconfig unchanged.
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});

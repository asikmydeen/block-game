#!/usr/bin/env node

// `build:native` wrapper (task 13.2): produce the bundled web assets that
// Capacitor copies into the native projects. This is the web build itself —
// dist/public is the bundled webDir — and requires no native toolchain, so it
// runs everywhere. Native endpoint validation runs first when a native target
// is requested (VITE_BUILD_TARGET=native) via the vite.config gate.

import { pathToFileURL } from 'node:url';
import { buildWeb } from './native-exec.mjs';

function main() {
  const status = buildWeb();
  process.exit(status);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

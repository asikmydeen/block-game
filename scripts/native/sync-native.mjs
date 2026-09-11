#!/usr/bin/env node

// `sync:native` wrapper (task 13.2): build the web bundle, then copy it into and
// update the checked-in native projects with `npx cap sync`. Accepts an optional
// platform argument (`ios` | `android`); with none it syncs all present
// platforms. It builds BEFORE syncing so the native projects always receive the
// freshly built dist/public.
//
// Platform-specific sync must never touch the other platform's project: when a
// platform is named we pass exactly that platform to `cap sync`. When a platform
// (or its toolchain) is absent we SKIP cleanly rather than hard-failing, so this
// runs green on a CLT-only / no-Android-SDK host.

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildWeb, hasCapacitorCli, run, skip } from './native-exec.mjs';

const PLATFORM_DIR = { ios: 'ios', android: 'android' };

function main() {
  const requested = process.argv[2];
  if (requested && !(requested in PLATFORM_DIR)) {
    console.error(`[native] unknown platform '${requested}' (expected ios | android)`);
    process.exit(2);
  }

  if (!hasCapacitorCli()) {
    skip('Capacitor CLI not resolvable; run npm ci first');
  }

  const platforms = requested ? [requested] : ['ios', 'android'];
  const present = platforms.filter((p) => existsSync(PLATFORM_DIR[p]));
  if (present.length === 0) {
    skip(
      `no native project generated for ${platforms.join(', ')} (run npx cap add <platform> with the toolchain installed)`,
    );
  }

  const built = buildWeb();
  if (built !== 0) process.exit(built);

  for (const platform of present) {
    // Explicit per-platform argv — never a shell string, never the other platform.
    const status = run('npx', ['--no-install', 'cap', 'sync', platform]);
    if (status !== 0) process.exit(status);
  }
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

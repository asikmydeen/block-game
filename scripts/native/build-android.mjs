#!/usr/bin/env node

// `build:android` wrapper (task 13.2): produce an Android release AAB bundle.
//
// Requires an Android SDK AND a generated android/ project. When either is
// absent this exits 0 with a clear skip line. Signing material is taken from
// the environment only; nothing is tracked.

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasAndroidSdk, run, skip } from './native-exec.mjs';

function main() {
  if (!existsSync('android')) {
    skip('android project not generated (run npx cap add android with the Android SDK installed)');
  }
  if (!hasAndroidSdk()) {
    skip('Android SDK not found (set ANDROID_HOME / ANDROID_SDK_ROOT)');
  }

  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  // Explicit argv; run from the android/ project dir via cwd (no shell string).
  const status = run(gradlew, ['bundleRelease'], { cwd: 'android' });
  process.exit(status);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

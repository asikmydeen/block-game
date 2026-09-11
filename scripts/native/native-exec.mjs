// Shared helpers for the native command wrappers (task 13.2).
//
// Every wrapper runs its underlying tool with an explicit ARGUMENT ARRAY (never
// a shell string) so there is no shell interpolation, and every wrapper detects
// a missing native toolchain and exits CLEARLY (code 0, a `skipped-...` line)
// rather than hard-failing on a machine without Xcode / the Android SDK. That
// keeps `npm run` chains and the idempotence check green on a CLT-only host
// while still driving the real tool where the toolchain is present.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const SKIP_TOOLCHAIN = 'skipped-toolchain-absent';

/** Run a command with an explicit argv array. Returns the exit status. */
export function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    ...opts,
  });
  if (result.error) {
    console.error(`[native] failed to spawn ${command}: ${result.error.message}`);
    return 127;
  }
  return result.status ?? 1;
}

/** True when a full Xcode toolchain (xcodebuild) is present. */
export function hasXcode(env = process.env) {
  if (env.XCODEBUILD_PATH && existsSync(env.XCODEBUILD_PATH)) return true;
  // `xcode-select -p` points at CommandLineTools when only CLT is installed;
  // a real Xcode install lives under an .app bundle with Developer/usr/bin.
  const probe = spawnSync('xcodebuild', ['-version'], { encoding: 'utf8' });
  return probe.status === 0;
}

/** True when an Android SDK is present (ANDROID_HOME / ANDROID_SDK_ROOT). */
export function hasAndroidSdk(env = process.env) {
  const home = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  return Boolean(home) && existsSync(home);
}

/** True when the Capacitor CLI is resolvable in this project. */
export function hasCapacitorCli() {
  const probe = spawnSync('npx', ['--no-install', 'cap', '--version'], { encoding: 'utf8' });
  return probe.status === 0;
}

/** Emit a clean skip line and exit 0 (never a hard failure). */
export function skip(reason) {
  console.log(`[native] ${SKIP_TOOLCHAIN}: ${reason}`);
  process.exit(0);
}

/** Run the Vite web build that produces the bundled dist/public assets. */
export function buildWeb() {
  console.log('[native] building web bundle (vite build) into dist/public');
  return run('npx', ['--no-install', 'vite', 'build']);
}

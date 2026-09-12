#!/usr/bin/env node

// Native project / configuration smoke validator (task 13.1).
//
// Before generating or accepting Capacitor projects, this validator asserts the
// deterministic contract that the checked-in native surface must satisfy:
//
//   - `capacitor.config.ts` exists and declares the fixed app id / name, the
//     bundled web directory `dist/public`, localhost schemes, a manual splash
//     hide, and NO production remote `server.url`.
//   - a checked-in metadata file records the OS floors (iOS 17, Android min SDK
//     31), landscape-only orientation on both platforms, Android `adjustResize`,
//     configured plugin + privacy metadata, and signing PLACEHOLDERS with no
//     secrets.
//   - the generated `ios/App` and `android` project trees and the icon/splash
//     master assets are present.
//
// It is intentionally self-contained (no TypeScript import) so it can run in a
// clean Node environment ahead of any bundling / scaffolding step. Checks that
// genuinely require the native toolchain (Xcode / Android SDK) — i.e. the
// generated `ios/App` and `android` project trees — are reported as
// `skipped-toolchain-absent` rather than hard failures when the toolchain is
// not installed, so the host-checkable configuration contract can still be
// verified deterministically. The rules mirror the design doc; both the
// validator and its fixtures are covered by tests to prevent drift.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const APP_ID = 'com.asikmydeen.craftworld';
export const APP_NAME = 'Craftworld';
export const WEB_DIR = 'dist/public';
export const IOS_DEPLOYMENT_TARGET = '17.0';
export const ANDROID_MIN_SDK = 31;
export const LANDSCAPE_ORIENTATIONS = ['landscape-left', 'landscape-right'];
export const REQUIRED_PLUGINS = [
  'App',
  'Network',
  'Preferences',
  'SecureStorage',
  'ScreenOrientation',
  'StatusBar',
  'SplashScreen',
];

// Secret-shaped tokens that must never appear in tracked native metadata.
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bp8:[A-Za-z0-9]/,
  /\baws_secret_access_key\b/i,
  /\bkeystorePassword\s*[:=]\s*["'][^"']+["']/i,
  /\bstorePassword\s*[:=]\s*["'][^"']+["']/i,
];

function pushSkip(diagnostics, area, message) {
  diagnostics.push({ area, status: 'skipped-toolchain-absent', message });
}

function pushFail(diagnostics, area, message) {
  diagnostics.push({ area, status: 'fail', message });
}

function looksLikeSecret(text) {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/**
 * Validate the Capacitor config source text (host-checkable, no toolchain).
 *
 * @param {string|null} configSource raw text of capacitor.config.ts, or null if absent
 * @param {Array} diagnostics accumulator
 */
export function validateCapacitorConfig(configSource, diagnostics) {
  if (configSource == null) {
    pushFail(diagnostics, 'capacitor.config.ts', 'capacitor.config.ts is missing');
    return;
  }
  const src = String(configSource);

  if (!src.includes(APP_ID)) {
    pushFail(diagnostics, 'capacitor.config.ts', `appId must be exactly ${APP_ID}`);
  }
  if (!new RegExp(`appName\\s*:\\s*["']${APP_NAME}["']`).test(src)) {
    pushFail(diagnostics, 'capacitor.config.ts', `appName must be exactly ${APP_NAME}`);
  }
  if (!new RegExp(`webDir\\s*:\\s*["']${WEB_DIR.replace('/', '\\/')}["']`).test(src)) {
    pushFail(diagnostics, 'capacitor.config.ts', `webDir must be '${WEB_DIR}'`);
  }
  // localhost schemes for both platforms.
  if (!/iosScheme\s*:\s*["']capacitor["']|hostname\s*:\s*["']localhost["']/.test(src)) {
    pushFail(
      diagnostics,
      'capacitor.config.ts',
      "server config must pin hostname 'localhost' (capacitor iOS scheme, https Android scheme)",
    );
  }
  if (!/androidScheme\s*:\s*["']https["']/.test(src)) {
    pushFail(diagnostics, 'capacitor.config.ts', "androidScheme must be 'https' for a localhost origin");
  }
  // Manual splash hide: launchAutoHide must be disabled so the app dismisses it.
  if (!/launchAutoHide\s*:\s*false/.test(src)) {
    pushFail(
      diagnostics,
      'capacitor.config.ts',
      'SplashScreen.launchAutoHide must be false (the app hides the splash manually after readiness)',
    );
  }
  // No production remote server.url — a `url:` under `server` pointing off-device.
  const serverUrlMatch = src.match(/server\s*:\s*\{[^}]*\burl\s*:\s*["']([^"']+)["']/s);
  if (serverUrlMatch) {
    pushFail(
      diagnostics,
      'capacitor.config.ts',
      `server.url must not be set for a production build (found ${serverUrlMatch[1]})`,
    );
  }
  if (looksLikeSecret(src)) {
    pushFail(diagnostics, 'capacitor.config.ts', 'capacitor.config.ts must not contain secrets');
  }
}

/**
 * Validate the checked-in native metadata JSON (host-checkable, no toolchain).
 *
 * @param {object|null} metadata parsed native-config.json, or null if absent
 * @param {Array} diagnostics accumulator
 */
export function validateNativeMetadata(metadata, diagnostics) {
  if (metadata == null) {
    pushFail(diagnostics, 'native-config.json', 'validation/mobile/native-config.json is missing');
    return;
  }

  const ios = metadata.ios ?? {};
  const android = metadata.android ?? {};

  if (ios.deploymentTarget !== IOS_DEPLOYMENT_TARGET) {
    pushFail(diagnostics, 'ios', `ios.deploymentTarget must be ${IOS_DEPLOYMENT_TARGET}`);
  }
  const iosOrient = Array.isArray(ios.orientations) ? [...ios.orientations].sort() : [];
  if (JSON.stringify(iosOrient) !== JSON.stringify([...LANDSCAPE_ORIENTATIONS].sort())) {
    pushFail(diagnostics, 'ios', `ios.orientations must be exactly ${LANDSCAPE_ORIENTATIONS.join(', ')}`);
  }

  if (android.minSdk !== ANDROID_MIN_SDK) {
    pushFail(diagnostics, 'android', `android.minSdk must be ${ANDROID_MIN_SDK}`);
  }
  const androidOrient = Array.isArray(android.orientations) ? [...android.orientations].sort() : [];
  if (JSON.stringify(androidOrient) !== JSON.stringify([...LANDSCAPE_ORIENTATIONS].sort())) {
    pushFail(
      diagnostics,
      'android',
      `android.orientations must be exactly ${LANDSCAPE_ORIENTATIONS.join(', ')}`,
    );
  }
  if (android.windowSoftInputMode !== 'adjustResize') {
    pushFail(diagnostics, 'android', "android.windowSoftInputMode must be 'adjustResize'");
  }

  // Plugin metadata: every required plugin must be configured.
  const plugins = metadata.plugins ?? {};
  for (const plugin of REQUIRED_PLUGINS) {
    if (!(plugin in plugins)) {
      pushFail(diagnostics, 'plugins', `plugin metadata missing for ${plugin}`);
    }
  }
  // Secure storage cloud sync must be explicitly disabled.
  if (plugins.SecureStorage && plugins.SecureStorage.icloudSync !== false) {
    pushFail(diagnostics, 'plugins', 'SecureStorage.icloudSync must be false (cloud sync disabled)');
  }

  // Privacy metadata (App Store privacy manifest / Android permissions rationale).
  if (!metadata.privacy || typeof metadata.privacy !== 'object') {
    pushFail(diagnostics, 'privacy', 'privacy metadata block is required');
  } else {
    if (!('iosPrivacyManifest' in metadata.privacy)) {
      pushFail(diagnostics, 'privacy', 'privacy.iosPrivacyManifest is required');
    }
    if (!Array.isArray(metadata.privacy.dataCategories)) {
      pushFail(diagnostics, 'privacy', 'privacy.dataCategories must be an array');
    }
  }

  // Signing must be placeholders only, never real secrets.
  const signing = metadata.signing ?? {};
  if (signing.mode !== 'placeholder') {
    pushFail(diagnostics, 'signing', "signing.mode must be 'placeholder' (no tracked signing material)");
  }
  if (looksLikeSecret(JSON.stringify(metadata))) {
    pushFail(diagnostics, 'signing', 'native metadata must not contain secrets');
  }
}

/**
 * Validate deterministic command wrappers exist as files.
 *
 * @param {(rel: string) => boolean} fileExists
 * @param {Array} diagnostics accumulator
 */
export function validateDeterministicCommands(fileExists, diagnostics) {
  const required = [
    'scripts/native/build-native.mjs',
    'scripts/native/sync-native.mjs',
    'scripts/native/build-ios.mjs',
    'scripts/native/build-android.mjs',
    'scripts/native/verify-idempotent.mjs',
  ];
  for (const rel of required) {
    if (!fileExists(rel)) {
      pushFail(diagnostics, 'commands', `deterministic command wrapper missing: ${rel}`);
    }
  }
}

/**
 * Validate icon/splash master assets exist (host-checkable — the *masters*, not
 * the generated platform outputs).
 */
export function validateAssetMasters(fileExists, diagnostics) {
  const required = [
    'resources/icon.png',
    'resources/icon-foreground.png',
    'resources/icon-background.png',
    'resources/splash.png',
  ];
  for (const rel of required) {
    if (!fileExists(rel)) {
      pushFail(diagnostics, 'assets', `asset master missing: ${rel}`);
    }
  }
}

/**
 * Validate the generated native project trees. These REQUIRE the native
 * toolchain to generate, so when they are absent this reports
 * `skipped-toolchain-absent` (never a hard failure) so the host-checkable
 * contract can still pass on a CLT-only / no-Android-SDK machine.
 */
export function validateGeneratedProjects(fileExists, diagnostics, { toolchainAvailable = false, readGenerated = () => null } = {}) {
  const iosPresent = fileExists('ios/App');
  const androidPresent = fileExists('android');

  if (iosPresent) {
    if (!fileExists('ios/App/App.xcodeproj') && !fileExists('ios/App/App.xcworkspace')) {
      pushFail(diagnostics, 'ios-project', 'ios/App exists but has no Xcode project/workspace');
    }
    // Assert the GENERATED project actually carries the spec settings — the
    // config metadata declaring them is not enough; `cap add` seeds cap
    // defaults (iOS 14, portrait+landscape) that must be corrected.
    const pbxproj = readGenerated('ios/App/App.xcodeproj/project.pbxproj');
    if (pbxproj !== null) {
      const targets = [...pbxproj.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+);/g)].map((m) => m[1]);
      const wrong = targets.filter((t) => t !== IOS_DEPLOYMENT_TARGET);
      if (targets.length === 0) {
        pushFail(diagnostics, 'ios-project', 'no IPHONEOS_DEPLOYMENT_TARGET found in project.pbxproj');
      } else if (wrong.length > 0) {
        pushFail(
          diagnostics,
          'ios-project',
          `IPHONEOS_DEPLOYMENT_TARGET must be ${IOS_DEPLOYMENT_TARGET} everywhere; found ${[...new Set(wrong)].join(', ')}`,
        );
      }
    }
    const infoPlist = readGenerated('ios/App/App/Info.plist');
    if (infoPlist !== null) {
      const hasPortrait = /UIInterfaceOrientationPortrait(?!Upside)/.test(infoPlist);
      const hasLandscapeL = /UIInterfaceOrientationLandscapeLeft/.test(infoPlist);
      const hasLandscapeR = /UIInterfaceOrientationLandscapeRight/.test(infoPlist);
      if (hasPortrait) {
        pushFail(diagnostics, 'ios-project', 'Info.plist must not allow portrait (landscape-only)');
      }
      if (!hasLandscapeL || !hasLandscapeR) {
        pushFail(diagnostics, 'ios-project', 'Info.plist must allow both landscape orientations');
      }
    }
  } else if (toolchainAvailable) {
    pushFail(diagnostics, 'ios-project', 'ios/App is missing (toolchain present — run npx cap add ios)');
  } else {
    pushSkip(diagnostics, 'ios-project', 'ios/App not generated (Xcode toolchain absent)');
  }

  if (androidPresent) {
    if (!fileExists('android/settings.gradle') && !fileExists('android/build.gradle')) {
      pushFail(diagnostics, 'android-project', 'android exists but has no Gradle project');
    }
  } else if (toolchainAvailable) {
    pushFail(diagnostics, 'android-project', 'android is missing (toolchain present — run npx cap add android)');
  } else {
    pushSkip(diagnostics, 'android-project', 'android not generated (Android SDK toolchain absent)');
  }
}

/**
 * Detect whether the native toolchain is available. iOS needs a full Xcode
 * (xcodebuild), Android needs an SDK (ANDROID_HOME / ANDROID_SDK_ROOT).
 */
export function detectToolchain(env = process.env, fileExists = existsSync) {
  const iosToolchain = Boolean(env.XCODEBUILD_PATH) && fileExists(env.XCODEBUILD_PATH);
  const androidHome = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  const androidToolchain = Boolean(androidHome) && fileExists(androidHome);
  return { iosToolchain, androidToolchain, available: iosToolchain && androidToolchain };
}

/**
 * Run the full native-project validation against a project root.
 *
 * @param {{ root: string, toolchainAvailable?: boolean, readFile?: fn, fileExists?: fn }} input
 * @returns {{ ok: boolean, diagnostics: Array, failures: Array, skipped: Array }}
 */
export function validateNativeProjects({
  root,
  toolchainAvailable = false,
  readFile,
  fileExists,
} = {}) {
  const resolve = (rel) => path.join(root, rel);
  const exists = fileExists ?? ((rel) => existsSync(resolve(rel)));
  const read = readFile ?? ((rel) => (existsSync(resolve(rel)) ? readFileSync(resolve(rel), 'utf8') : null));

  const diagnostics = [];

  validateCapacitorConfig(exists('capacitor.config.ts') ? read('capacitor.config.ts') : null, diagnostics);

  let metadata = null;
  if (exists('validation/mobile/native-config.json')) {
    try {
      metadata = JSON.parse(read('validation/mobile/native-config.json'));
    } catch {
      pushFail(diagnostics, 'native-config.json', 'validation/mobile/native-config.json is not valid JSON');
    }
  }
  validateNativeMetadata(metadata, diagnostics);
  validateDeterministicCommands(exists, diagnostics);
  validateAssetMasters(exists, diagnostics);
  validateGeneratedProjects(exists, diagnostics, { toolchainAvailable, readGenerated: read });

  const failures = diagnostics.filter((d) => d.status === 'fail');
  const skipped = diagnostics.filter((d) => d.status === 'skipped-toolchain-absent');
  return { ok: failures.length === 0, diagnostics, failures, skipped };
}

function main() {
  const root = process.cwd();
  const toolchain = detectToolchain();
  const result = validateNativeProjects({ root, toolchainAvailable: toolchain.available });

  for (const { area, status, message } of result.skipped) {
    console.log(`  ~ [${area}] ${status}: ${message}`);
  }

  if (result.ok) {
    console.log(
      `Native project configuration OK` +
        (result.skipped.length ? ` (${result.skipped.length} toolchain-gated check(s) skipped).` : '.'),
    );
    return;
  }

  console.error('Native project configuration is invalid:');
  for (const { area, message } of result.failures) {
    console.error(`  - [${area}] ${message}`);
  }
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

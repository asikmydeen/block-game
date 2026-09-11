import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ANDROID_MIN_SDK,
  APP_ID,
  APP_NAME,
  IOS_DEPLOYMENT_TARGET,
  LANDSCAPE_ORIENTATIONS,
  REQUIRED_PLUGINS,
  WEB_DIR,
  validateNativeProjects,
} from '../validate-projects.mjs';

// A complete in-memory fixture that satisfies every host-checkable contract.
const GOOD_CONFIG = `import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: '${APP_ID}',
  appName: '${APP_NAME}',
  webDir: '${WEB_DIR}',
  server: { androidScheme: 'https', iosScheme: 'capacitor', hostname: 'localhost' },
  plugins: { SplashScreen: { launchAutoHide: false } },
};
export default config;
`;

const GOOD_METADATA = {
  ios: { deploymentTarget: IOS_DEPLOYMENT_TARGET, orientations: LANDSCAPE_ORIENTATIONS },
  android: {
    minSdk: ANDROID_MIN_SDK,
    orientations: LANDSCAPE_ORIENTATIONS,
    windowSoftInputMode: 'adjustResize',
  },
  plugins: Object.fromEntries(
    REQUIRED_PLUGINS.map((p) => [p, p === 'SecureStorage' ? { icloudSync: false } : {}]),
  ),
  privacy: { iosPrivacyManifest: 'ios/App/App/PrivacyInfo.xcprivacy', dataCategories: [] },
  signing: { mode: 'placeholder' },
};

const GOOD_FILES = new Set([
  'capacitor.config.ts',
  'validation/mobile/native-config.json',
  'scripts/native/build-native.mjs',
  'scripts/native/sync-native.mjs',
  'scripts/native/build-ios.mjs',
  'scripts/native/build-android.mjs',
  'scripts/native/verify-idempotent.mjs',
  'resources/icon.png',
  'resources/icon-foreground.png',
  'resources/icon-background.png',
  'resources/splash.png',
]);

function fixtureValidator(overrides = {}) {
  const files = overrides.files ?? new Set(GOOD_FILES);
  const config = overrides.config ?? GOOD_CONFIG;
  const metadata = overrides.metadata ?? GOOD_METADATA;
  const toolchainAvailable = overrides.toolchainAvailable ?? false;
  return validateNativeProjects({
    root: '/fixture',
    toolchainAvailable,
    fileExists: (rel) => files.has(rel),
    readFile: (rel) => {
      if (rel === 'capacitor.config.ts') return config;
      if (rel === 'validation/mobile/native-config.json') return metadata == null ? null : JSON.stringify(metadata);
      return null;
    },
  });
}

function areas(result) {
  return new Set(result.failures.map((d) => d.area));
}

describe('native project validator — fixtures', () => {
  test('a complete config/metadata/asset fixture passes with only toolchain-gated skips', () => {
    const result = fixtureValidator();
    assert.equal(result.ok, true, JSON.stringify(result.failures));
    // ios/android project trees are reported skipped, not failed, on a host with no toolchain.
    const skipAreas = new Set(result.skipped.map((d) => d.area));
    assert.ok(skipAreas.has('ios-project'));
    assert.ok(skipAreas.has('android-project'));
    assert.ok(result.skipped.every((d) => d.status === 'skipped-toolchain-absent'));
  });

  test('a missing capacitor.config.ts fails', () => {
    const files = new Set(GOOD_FILES);
    files.delete('capacitor.config.ts');
    const result = fixtureValidator({ files });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('capacitor.config.ts'));
  });

  test('a wrong app id fails', () => {
    const result = fixtureValidator({ config: GOOD_CONFIG.replace(APP_ID, 'com.other.app') });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('capacitor.config.ts'));
  });

  test('a production remote server.url fails', () => {
    const bad = GOOD_CONFIG.replace(
      "server: {",
      "server: { url: 'https://prod.example.com',",
    );
    const result = fixtureValidator({ config: bad });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('capacitor.config.ts'));
  });

  test('launchAutoHide not false fails (manual splash hide required)', () => {
    const result = fixtureValidator({
      config: GOOD_CONFIG.replace('launchAutoHide: false', 'launchAutoHide: true'),
    });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('capacitor.config.ts'));
  });

  test('wrong iOS deployment target fails', () => {
    const result = fixtureValidator({
      metadata: { ...GOOD_METADATA, ios: { deploymentTarget: '16.0', orientations: LANDSCAPE_ORIENTATIONS } },
    });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('ios'));
  });

  test('wrong Android minSdk fails', () => {
    const result = fixtureValidator({
      metadata: {
        ...GOOD_METADATA,
        android: { minSdk: 24, orientations: LANDSCAPE_ORIENTATIONS, windowSoftInputMode: 'adjustResize' },
      },
    });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('android'));
  });

  test('missing adjustResize fails', () => {
    const result = fixtureValidator({
      metadata: {
        ...GOOD_METADATA,
        android: { minSdk: ANDROID_MIN_SDK, orientations: LANDSCAPE_ORIENTATIONS, windowSoftInputMode: 'adjustPan' },
      },
    });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('android'));
  });

  test('non-landscape orientation fails on both platforms', () => {
    const result = fixtureValidator({
      metadata: {
        ...GOOD_METADATA,
        ios: { deploymentTarget: IOS_DEPLOYMENT_TARGET, orientations: ['portrait'] },
        android: { minSdk: ANDROID_MIN_SDK, orientations: ['portrait'], windowSoftInputMode: 'adjustResize' },
      },
    });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('ios'));
    assert.ok(areas(result).has('android'));
  });

  test('a missing required plugin fails', () => {
    const plugins = { ...GOOD_METADATA.plugins };
    delete plugins.Network;
    const result = fixtureValidator({ metadata: { ...GOOD_METADATA, plugins } });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('plugins'));
  });

  test('secure storage cloud sync enabled fails', () => {
    const result = fixtureValidator({
      metadata: {
        ...GOOD_METADATA,
        plugins: { ...GOOD_METADATA.plugins, SecureStorage: { icloudSync: true } },
      },
    });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('plugins'));
  });

  test('missing privacy metadata fails', () => {
    const md = { ...GOOD_METADATA };
    delete md.privacy;
    const result = fixtureValidator({ metadata: md });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('privacy'));
  });

  test('non-placeholder signing or tracked secret fails', () => {
    const result = fixtureValidator({
      metadata: { ...GOOD_METADATA, signing: { mode: 'inline', storePassword: 'hunter2secret!' } },
    });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('signing'));
  });

  test('missing deterministic command wrappers fail', () => {
    const files = new Set(GOOD_FILES);
    files.delete('scripts/native/sync-native.mjs');
    const result = fixtureValidator({ files });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('commands'));
  });

  test('missing asset masters fail', () => {
    const files = new Set(GOOD_FILES);
    files.delete('resources/icon.png');
    const result = fixtureValidator({ files });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('assets'));
  });

  test('with toolchain present, missing ios/android project trees are hard failures (not skips)', () => {
    const result = fixtureValidator({ toolchainAvailable: true });
    assert.equal(result.ok, false);
    assert.ok(areas(result).has('ios-project'));
    assert.ok(areas(result).has('android-project'));
    assert.equal(result.skipped.length, 0);
  });
});

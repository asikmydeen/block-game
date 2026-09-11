#!/usr/bin/env node

// `build:ios` wrapper (task 13.2): produce an iOS Release build/archive.
//
// Requires a full Xcode toolchain (xcodebuild) AND a generated ios/App project.
// When either is absent this exits 0 with a clear skip line — a CLT-only host
// cannot build iOS, and that is a toolchain gate, not a repository defect.
// Signing material is taken from the environment only; nothing is tracked.

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasXcode, run, skip } from './native-exec.mjs';

function main() {
  if (!existsSync('ios/App')) {
    skip('ios/App not generated (run npx cap add ios with Xcode installed)');
  }
  if (!hasXcode()) {
    skip('Xcode (xcodebuild) not installed; only Command Line Tools present');
  }

  // Explicit argv array; scheme/config are fixed, signing comes from env/CI.
  const status = run('xcodebuild', [
    '-workspace',
    'ios/App/App.xcworkspace',
    '-scheme',
    'App',
    '-configuration',
    'Release',
    '-destination',
    'generic/platform=iOS',
    'archive',
    '-archivePath',
    'dist/native/ios/App.xcarchive',
  ]);
  process.exit(status);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

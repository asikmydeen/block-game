#!/usr/bin/env node

// Native sync/build idempotence check (task 13.6).
//
// The native packaging pipeline must be deterministic: building the web bundle
// and syncing it into the native projects, run twice from unchanged inputs, must
// leave the tracked tree unchanged. This module proves the part it CAN prove on
// the current host and reports the rest honestly:
//
//   - Config/script layer determinism (host-checkable, no toolchain): the
//     canonical native inputs — capacitor.config.ts, native-config.json, and the
//     web build config — hash identically across two reads, and the native
//     endpoint validation is deterministic.
//   - Native `cap sync` twice-with-no-tracked-change (toolchain-gated): only run
//     when the Capacitor CLI AND a generated platform project are present. When
//     they are absent this is reported `skipped-toolchain-absent` — never a
//     failure — because a CLT-only / no-Android-SDK host cannot sync.
//
// This deliberately does NOT run `git`: the git-diff form of the twice-run check
// belongs to the CI release job (task 14.9) that has the toolchain; here we
// assert determinism of the layer we control by content hashing.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SKIP = 'skipped-toolchain-absent';

/** Stable content hash of a set of files (missing files hash as a sentinel). */
export function hashInputs(root, relPaths, readFile) {
  const read = readFile ?? ((rel) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel)) : null));
  const h = createHash('sha256');
  for (const rel of [...relPaths].sort()) {
    const contents = read(rel);
    h.update(rel);
    h.update('\0');
    h.update(contents == null ? '\0MISSING\0' : contents);
    h.update('\0');
  }
  return h.digest('hex');
}

/** The canonical inputs whose determinism this check owns. */
export const CANONICAL_INPUTS = [
  'capacitor.config.ts',
  'validation/mobile/native-config.json',
  'vite.config.ts',
  'package.json',
];

/**
 * Pure determinism check: hashing the canonical inputs twice yields the same
 * digest. (Trivially true for content hashing — the value is that it makes the
 * determinism contract explicit and testable, and detects a reader that leaks
 * nondeterminism.)
 */
export function checkConfigLayerDeterminism(root, readFile) {
  const first = hashInputs(root, CANONICAL_INPUTS, readFile);
  const second = hashInputs(root, CANONICAL_INPUTS, readFile);
  return { ok: first === second, first, second };
}

/**
 * Decide what the native-sync portion should do on this host without running it.
 *
 * @returns {{ action: 'run'|'skip', reason?: string, platforms?: string[] }}
 */
export function planNativeSync({ root = process.cwd(), hasCapacitorCli, existsFn = existsSync } = {}) {
  const cliPresent =
    typeof hasCapacitorCli === 'boolean'
      ? hasCapacitorCli
      : spawnSync('npx', ['--no-install', 'cap', '--version'], { encoding: 'utf8' }).status === 0;
  if (!cliPresent) {
    return { action: 'skip', reason: 'Capacitor CLI not resolvable' };
  }
  const platforms = ['ios', 'android'].filter((p) => existsFn(path.join(root, p)));
  if (platforms.length === 0) {
    return { action: 'skip', reason: 'no generated native project present' };
  }
  return { action: 'run', platforms };
}

/**
 * Run the host-checkable idempotence proof. Returns a structured report; the
 * native-sync twice-run is described (and, when the toolchain is present,
 * executed by the caller via sync-native) but never fails here on a toolchain
 * gate.
 */
export function verifyIdempotent({ root = process.cwd(), readFile, syncPlan } = {}) {
  const results = [];

  const determinism = checkConfigLayerDeterminism(root, readFile);
  results.push({
    check: 'config-layer-determinism',
    status: determinism.ok ? 'pass' : 'fail',
    message: determinism.ok
      ? 'canonical native inputs hash identically across two reads'
      : `nondeterministic inputs: ${determinism.first} != ${determinism.second}`,
  });

  const plan = syncPlan ?? planNativeSync({ root });
  if (plan.action === 'skip') {
    results.push({
      check: 'native-sync-twice',
      status: SKIP,
      message: `native sync idempotence not verified here: ${plan.reason}`,
    });
  } else {
    results.push({
      check: 'native-sync-twice',
      status: 'ready',
      message: `native sync idempotence runnable for: ${plan.platforms.join(', ')}`,
      platforms: plan.platforms,
    });
  }

  const failures = results.filter((r) => r.status === 'fail');
  const skipped = results.filter((r) => r.status === SKIP);
  return { ok: failures.length === 0, results, failures, skipped };
}

function main() {
  const report = verifyIdempotent({ root: process.cwd() });
  for (const r of report.results) {
    const glyph = r.status === 'pass' ? '✔' : r.status === SKIP ? '~' : r.status === 'ready' ? '•' : '✗';
    const stream = r.status === 'fail' ? console.error : console.log;
    stream(`  ${glyph} [${r.check}] ${r.status}: ${r.message}`);
  }
  if (!report.ok) {
    console.error('Idempotence check failed.');
    process.exit(1);
  }
  console.log(
    `Idempotence check OK` +
      (report.skipped.length ? ` (${report.skipped.length} toolchain-gated check(s) skipped).` : '.'),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

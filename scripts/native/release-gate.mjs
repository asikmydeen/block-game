#!/usr/bin/env node

// Release evidence validation + all-or-nothing acceptance gate (task 14.2).
//
// This module is the single source of truth for whether a release candidate is
// ACCEPTED. It is intentionally self-contained (no TypeScript import) so it can
// run in a clean Node environment ahead of any bundling step.
//
// Two responsibilities, both pure and deterministic:
//
//   1. `validateReleaseManifest(manifest)` — the manifest carries the exact
//      Capacitor/secure-storage pins, compatibility source + check date,
//      qualifying upstream activity, endpoint HOSTS ONLY (never a full URL or a
//      secret), native versions, test commands, target devices/OS, the
//      automation identity, and artifact links + sha256 checksums. Any secret
//      anywhere in the manifest is a hard error.
//
//   2. `evaluateReleaseCandidate({ buildId, manifest, criteria })` — acceptance
//      is ALL-OR-NOTHING and fully DIAGNOSTIC: the candidate is accepted only
//      when the manifest is valid, the candidate's build ID matches the
//      manifest (no stale/mismatched evidence), and EVERY required criterion
//      (12.1–12.16) is present and passing. A rejection enumerates every failed
//      criterion ID and every missing required criterion ID — never just the
//      first.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Every release-acceptance criterion that must pass. 12.17 is the meta-rule
// ("mark not accepted and identify the failed criterion") that this gate
// implements, so it is not itself a checkable evidence line.
export const REQUIRED_CRITERIA = Object.freeze(
  Array.from({ length: 16 }, (_, i) => `12.${i + 1}`),
);

// An exact semver pin: digits.digits.digits with no range operator/qualifier.
const EXACT_PIN = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[0-9a-f]{64}$/i;
// A bare host: `example.com` or `sub.example.com[:port]` — never a scheme,
// path, credential, query, or fragment.
const BARE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

// Secret-shaped tokens that must never appear in tracked release evidence.
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bp8:[A-Za-z0-9]/,
  /\baws_secret_access_key\b/i,
  /\bSUPABASE_SERVICE_ROLE\b/i,
  /\bservice_role\b/i,
  /\beyJ[A-Za-z0-9_-]{20,}/, // JWT-shaped
  /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/_+-]{12,}/i,
];

function looksLikeSecret(text) {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

function requireString(obj, field, errors, ctx = 'manifest') {
  if (typeof obj?.[field] !== 'string' || obj[field].trim() === '') {
    errors.push(`${ctx}.${field} is required and must be a non-empty string`);
    return false;
  }
  return true;
}

/**
 * Validate a release manifest.
 *
 * @param {object|null} manifest
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateReleaseManifest(manifest) {
  const errors = [];
  if (manifest == null || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest is missing or not an object'] };
  }

  requireString(manifest, 'buildId', errors);

  if (requireString(manifest, 'capacitorVersion', errors) && !EXACT_PIN.test(manifest.capacitorVersion)) {
    errors.push(`manifest.capacitorVersion must be an exact pin (found ${manifest.capacitorVersion})`);
  }
  if (
    requireString(manifest, 'secureStorageVersion', errors) &&
    !EXACT_PIN.test(manifest.secureStorageVersion)
  ) {
    errors.push(`manifest.secureStorageVersion must be an exact pin (found ${manifest.secureStorageVersion})`);
  }

  const compat = manifest.compatibility;
  if (compat == null || typeof compat !== 'object') {
    errors.push('manifest.compatibility is required');
  } else {
    requireString(compat, 'source', errors, 'manifest.compatibility');
    if (requireString(compat, 'checkedAt', errors, 'manifest.compatibility')) {
      if (Number.isNaN(Date.parse(compat.checkedAt))) {
        errors.push('manifest.compatibility.checkedAt must be an ISO date');
      }
    }
    requireString(compat, 'qualifyingUpstreamActivity', errors, 'manifest.compatibility');
  }

  const hosts = manifest.endpointHosts;
  if (hosts == null || typeof hosts !== 'object') {
    errors.push('manifest.endpointHosts is required');
  } else {
    for (const key of ['api', 'webSocket']) {
      const v = hosts[key];
      if (typeof v !== 'string' || v.trim() === '') {
        errors.push(`manifest.endpointHosts.${key} is required`);
      } else if (!BARE_HOST.test(v)) {
        errors.push(`manifest.endpointHosts.${key} must be a bare host, not a URL (found ${v})`);
      }
    }
  }

  const nv = manifest.nativeVersions;
  if (nv == null || typeof nv !== 'object') {
    errors.push('manifest.nativeVersions is required');
  } else {
    if (typeof nv.ios !== 'string') errors.push('manifest.nativeVersions.ios is required');
    if (typeof nv.androidMinSdk !== 'number') errors.push('manifest.nativeVersions.androidMinSdk is required');
  }

  if (!Array.isArray(manifest.testCommands) || manifest.testCommands.length === 0) {
    errors.push('manifest.testCommands must be a non-empty array');
  }

  if (!Array.isArray(manifest.devices) || manifest.devices.length === 0) {
    errors.push('manifest.devices must be a non-empty array');
  } else {
    for (const d of manifest.devices) {
      if (!d || typeof d.platform !== 'string' || typeof d.model !== 'string' || typeof d.os !== 'string') {
        errors.push('each manifest.devices entry needs platform, model, and os');
      }
    }
  }

  requireString(manifest, 'automationIdentity', errors);

  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    errors.push('manifest.artifacts must be a non-empty array');
  } else {
    for (const a of manifest.artifacts) {
      if (!a || typeof a.name !== 'string' || typeof a.url !== 'string') {
        errors.push('each manifest.artifacts entry needs a name and url');
        continue;
      }
      if (typeof a.sha256 !== 'string' || !SHA256.test(a.sha256)) {
        errors.push(`artifact ${a.name} sha256 checksum must be a 64-char hex string`);
      }
    }
  }

  const hashes = manifest.hashes;
  if (hashes == null || typeof hashes !== 'object') {
    errors.push('manifest.hashes is required (lockfile + webBuild)');
  } else {
    for (const key of ['lockfile', 'webBuild']) {
      if (typeof hashes[key] !== 'string' || !SHA256.test(hashes[key])) {
        errors.push(`manifest.hashes.${key} must be a 64-char hex build/lock hash`);
      }
    }
  }

  // Nothing secret-shaped may be tracked in the manifest.
  if (looksLikeSecret(JSON.stringify(manifest))) {
    errors.push('manifest must not contain a secret (credential/token/service-role/private key)');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Evaluate a full release candidate. All-or-nothing and diagnostic.
 *
 * @param {{ buildId: string, manifest: object, criteria: Array<{id:string,status:string}> }} input
 * @returns {{ accepted: boolean, failedCriteria: string[], missingCriteria: string[], errors: string[] }}
 */
export function evaluateReleaseCandidate({ buildId, manifest, criteria } = {}) {
  const errors = [];

  const manifestResult = validateReleaseManifest(manifest);
  if (!manifestResult.ok) errors.push(...manifestResult.errors);

  // Stale/mismatched evidence: the candidate directory's build ID must match
  // the manifest's build ID exactly.
  if (manifest && typeof manifest.buildId === 'string' && buildId !== manifest.buildId) {
    errors.push(
      `stale evidence: candidate build id ${buildId} does not match manifest build id ${manifest.buildId}`,
    );
  }

  const results = Array.isArray(criteria) ? criteria : [];
  const byId = new Map();
  for (const c of results) {
    if (c && typeof c.id === 'string') byId.set(c.id, c);
  }

  const missingCriteria = [];
  const failedCriteria = [];
  for (const id of REQUIRED_CRITERIA) {
    const entry = byId.get(id);
    if (!entry) {
      missingCriteria.push(id);
    } else if (entry.status !== 'pass') {
      failedCriteria.push(id);
    }
  }

  const accepted =
    manifestResult.ok &&
    errors.length === 0 &&
    missingCriteria.length === 0 &&
    failedCriteria.length === 0;

  return {
    accepted,
    failedCriteria,
    missingCriteria,
    errors,
  };
}

function main() {
  const [, , buildId, manifestPath, criteriaPath] = process.argv;
  if (!buildId || !manifestPath || !criteriaPath) {
    console.error('usage: release-gate.mjs <buildId> <manifest.json> <criteria.json>');
    process.exit(2);
  }
  const read = (p) => JSON.parse(readFileSync(path.resolve(p), 'utf8'));
  if (!existsSync(manifestPath) || !existsSync(criteriaPath)) {
    console.error('manifest or criteria evidence file is missing');
    process.exit(1);
  }
  const result = evaluateReleaseCandidate({
    buildId,
    manifest: read(manifestPath),
    criteria: read(criteriaPath),
  });
  if (result.accepted) {
    console.log(`Release candidate ${buildId} ACCEPTED (all ${REQUIRED_CRITERIA.length} criteria pass).`);
    return;
  }
  console.error(`Release candidate ${buildId} NOT ACCEPTED:`);
  for (const e of result.errors) console.error(`  - ${e}`);
  if (result.missingCriteria.length) console.error(`  - missing criteria: ${result.missingCriteria.join(', ')}`);
  if (result.failedCriteria.length) console.error(`  - failed criteria: ${result.failedCriteria.join(', ')}`);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

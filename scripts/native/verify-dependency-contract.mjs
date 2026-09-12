#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CAPACITOR_VERSION = '7.4.4';
export const NODE_FLOOR_VERSION = '20.0.0';
export const SECURE_STORAGE_PACKAGE = '@aparajita/capacitor-secure-storage';

export const FIXED_VERSION_PINS = Object.freeze({
  '@capacitor/core': CAPACITOR_VERSION,
  '@capacitor/cli': CAPACITOR_VERSION,
  '@capacitor/ios': CAPACITOR_VERSION,
  '@capacitor/android': CAPACITOR_VERSION,
  [SECURE_STORAGE_PACKAGE]: '7.1.6',
});

export const REGISTRY_SELECTED_PACKAGES = Object.freeze([
  '@capacitor/app',
  '@capacitor/network',
  '@capacitor/preferences',
  '@capacitor/screen-orientation',
  '@capacitor/status-bar',
  '@capacitor/splash-screen',
  '@capacitor/assets',
  'vitest',
  'fast-check',
  'jsdom',
  '@testing-library/react',
  '@testing-library/user-event',
  '@playwright/test',
]);

const REQUIRED_PACKAGES = Object.freeze([
  ...Object.keys(FIXED_VERSION_PINS),
  ...REGISTRY_SELECTED_PACKAGES,
]);
const EVIDENCE_SCHEMA_VERSION = 1;
const EVIDENCE_MAX_AGE_MONTHS = 12;
const REGISTRY_BASE_URL = 'https://registry.npmjs.org';
const SECURE_STORAGE_COMMITS_URL =
  'https://api.github.com/repos/aparajita/capacitor-secure-storage/commits?per_page=1';
const FUTURE_DATE_TOLERANCE_MS = 5 * 60 * 1000;

function parseVersion(value) {
  const normalized = String(value).trim().replace(/^v/, '').split('+', 1)[0];
  const [core, prerelease = ''] = normalized.split('-', 2);
  const parts = core.split('.');

  if (parts.length > 3 || parts.some((part) => part !== '' && !/^\d+$/.test(part))) {
    return null;
  }

  while (parts.length < 3) {
    parts.push('0');
  }

  return {
    major: Number(parts[0]),
    minor: Number(parts[1]),
    patch: Number(parts[2]),
    prerelease,
    precision: core.split('.').length,
  };
}

function compareParsedVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }

  if (left.prerelease === right.prerelease) {
    return 0;
  }
  if (!left.prerelease) {
    return 1;
  }
  if (!right.prerelease) {
    return -1;
  }
  return left.prerelease.localeCompare(right.prerelease, 'en', { numeric: true });
}

function compareVersions(left, right) {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);

  if (!parsedLeft || !parsedRight) {
    throw new TypeError(`Cannot compare invalid versions ${left} and ${right}`);
  }

  return compareParsedVersions(parsedLeft, parsedRight);
}

function upperBoundForCaret(version) {
  if (version.major > 0) {
    return { major: version.major + 1, minor: 0, patch: 0, prerelease: '' };
  }
  if (version.minor > 0) {
    return { major: 0, minor: version.minor + 1, patch: 0, prerelease: '' };
  }
  return { major: 0, minor: 0, patch: version.patch + 1, prerelease: '' };
}

function upperBoundForTilde(version) {
  if (version.precision === 1) {
    return { major: version.major + 1, minor: 0, patch: 0, prerelease: '' };
  }
  return { major: version.major, minor: version.minor + 1, patch: 0, prerelease: '' };
}

function satisfiesComparator(parsedVersion, comparator) {
  const match = comparator.match(/^(\^|~|>=|<=|>|<|=)?\s*(v?\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?|[xX*](?:\.[xX*]){0,2}|\d+\.[xX*](?:\.[xX*])?)$/);
  if (!match) {
    return false;
  }

  const operator = match[1] ?? '';
  const operand = match[2];

  if (/[xX*]/.test(operand)) {
    const versionParts = [parsedVersion.major, parsedVersion.minor, parsedVersion.patch];
    const rangeParts = operand.split('.');
    return rangeParts.every(
      (part, index) => /^(?:x|\*)$/i.test(part) || Number(part) === versionParts[index],
    );
  }

  const parsedOperand = parseVersion(operand);
  if (!parsedOperand) {
    return false;
  }

  const comparison = compareParsedVersions(parsedVersion, parsedOperand);
  if (operator === '^') {
    return (
      comparison >= 0 &&
      compareParsedVersions(parsedVersion, upperBoundForCaret(parsedOperand)) < 0
    );
  }
  if (operator === '~') {
    return (
      comparison >= 0 &&
      compareParsedVersions(parsedVersion, upperBoundForTilde(parsedOperand)) < 0
    );
  }
  if (operator === '>=') return comparison >= 0;
  if (operator === '<=') return comparison <= 0;
  if (operator === '>') return comparison > 0;
  if (operator === '<') return comparison < 0;

  if (parsedOperand.precision === 1) {
    return parsedVersion.major === parsedOperand.major;
  }
  if (parsedOperand.precision === 2) {
    return (
      parsedVersion.major === parsedOperand.major && parsedVersion.minor === parsedOperand.minor
    );
  }
  return comparison === 0;
}

function satisfiesRangeBranch(parsedVersion, branch) {
  const hyphenRange = branch.match(/^\s*(\S+)\s+-\s+(\S+)\s*$/);
  if (hyphenRange) {
    const lower = parseVersion(hyphenRange[1]);
    const upper = parseVersion(hyphenRange[2]);
    return (
      Boolean(lower && upper) &&
      compareParsedVersions(parsedVersion, lower) >= 0 &&
      compareParsedVersions(parsedVersion, upper) <= 0
    );
  }

  const comparators = branch
    .replaceAll(',', ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return comparators.length > 0 && comparators.every((item) => satisfiesComparator(parsedVersion, item));
}

export function satisfiesVersionRange(version, range) {
  const parsedVersion = parseVersion(version);
  if (!parsedVersion || typeof range !== 'string' || range.trim() === '') {
    return false;
  }

  const normalizedRange = range.trim();
  if (normalizedRange === '*') {
    return true;
  }

  return normalizedRange
    .split('||')
    .some((branch) => satisfiesRangeBranch(parsedVersion, branch));
}

function isExactStableVersion(value) {
  return /^\d+\.\d+\.\d+$/.test(String(value));
}

function isStableVersion(value) {
  const parsed = parseVersion(value);
  return Boolean(parsed && !parsed.prerelease && /^\d+\.\d+\.\d+$/.test(value));
}

function metadataSupportsNode(metadata, nodeVersion) {
  const range = metadata.engines?.node;
  return range === undefined || satisfiesVersionRange(nodeVersion, range);
}

function metadataSupportsCapacitorCore(metadata, capacitorVersion) {
  const ranges = [
    metadata.peerDependencies?.['@capacitor/core'],
    metadata.dependencies?.['@capacitor/core'],
  ].filter(Boolean);

  return ranges.every((range) => satisfiesVersionRange(capacitorVersion, range));
}

function isPublishedBy(version, packument, checkedAt) {
  const publishedAt = packument.time?.[version];
  if (!publishedAt || checkedAt === undefined) {
    return true;
  }

  const publishedTime = Date.parse(publishedAt);
  const checkTime = Date.parse(checkedAt);
  return Number.isFinite(publishedTime) && Number.isFinite(checkTime) && publishedTime <= checkTime;
}

export function selectLatestCompatibleVersion(
  packageName,
  packument,
  {
    capacitorVersion = CAPACITOR_VERSION,
    nodeVersion = NODE_FLOOR_VERSION,
    checkedAt,
  } = {},
) {
  if (!packument || typeof packument.versions !== 'object') {
    throw new Error(`${packageName}: registry metadata is absent`);
  }

  const candidates = Object.entries(packument.versions)
    .filter(([version, metadata]) => {
      return (
        isStableVersion(version) &&
        !metadata.deprecated &&
        isPublishedBy(version, packument, checkedAt) &&
        metadataSupportsNode(metadata, nodeVersion) &&
        metadataSupportsCapacitorCore(metadata, capacitorVersion)
      );
    })
    .sort(([left], [right]) => compareVersions(right, left));

  const selected = candidates[0];
  if (!selected) {
    throw new Error(
      `${packageName}: no stable registry version supports Node ${nodeVersion} and Capacitor ${capacitorVersion}`,
    );
  }

  const [version, metadata] = selected;
  return {
    version,
    metadata,
    publishedAt: packument.time?.[version] ?? null,
  };
}

function normalizeRepositoryUrl(repository) {
  const rawUrl = typeof repository === 'string' ? repository : repository?.url;
  if (!rawUrl) {
    return null;
  }

  const normalized = rawUrl
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '');

  return normalized.startsWith('https://') ? normalized : null;
}

function registryPackumentUrl(packageName) {
  return `${REGISTRY_BASE_URL}/${encodeURIComponent(packageName)}`;
}

function registryVersionUrl(packageName, version) {
  return `${registryPackumentUrl(packageName)}/${version}`;
}

function npmVersionUrl(packageName, version) {
  return `https://www.npmjs.com/package/${packageName}/v/${version}`;
}

function uniqueHttpsUrls(urls) {
  return [...new Set(urls.filter((url) => typeof url === 'string' && url.startsWith('https://')))];
}

function createCapacitorContracts(packageName, metadata, selectedVersions) {
  const contracts = [];
  const bundledDependencies = [];

  for (const [dependencyName, range] of Object.entries(metadata.peerDependencies ?? {})) {
    if (!dependencyName.startsWith('@capacitor/') || !selectedVersions[dependencyName]) {
      continue;
    }

    contracts.push({
      relationship: 'peerDependency',
      packageName: dependencyName,
      range,
      selectedVersion: selectedVersions[dependencyName],
      satisfied: satisfiesVersionRange(selectedVersions[dependencyName], range),
    });
  }

  for (const [dependencyName, range] of Object.entries(metadata.dependencies ?? {})) {
    if (!dependencyName.startsWith('@capacitor/')) {
      continue;
    }

    if (packageName === SECURE_STORAGE_PACKAGE && selectedVersions[dependencyName]) {
      contracts.push({
        relationship: 'dependency',
        packageName: dependencyName,
        range,
        selectedVersion: selectedVersions[dependencyName],
        satisfied: satisfiesVersionRange(selectedVersions[dependencyName], range),
      });
    } else {
      bundledDependencies.push({
        packageName: dependencyName,
        range,
        resolution: 'nested-package-dependency',
      });
    }
  }

  return { contracts, bundledDependencies };
}

function assertFreshDate(value, now, label) {
  const occurredAt = new Date(value);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error(`${label} has an invalid date`);
  }
  if (!isWithinPriorMonths(occurredAt, now, EVIDENCE_MAX_AGE_MONTHS)) {
    throw new Error(`${label} is outside the prior ${EVIDENCE_MAX_AGE_MONTHS} months`);
  }
}

function isWithinPriorMonths(value, now, months) {
  const valueDate = value instanceof Date ? value : new Date(value);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(valueDate.getTime()) || Number.isNaN(nowDate.getTime())) {
    return false;
  }
  if (valueDate.getTime() > nowDate.getTime() + FUTURE_DATE_TOLERANCE_MS) {
    return false;
  }

  const cutoff = new Date(nowDate);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return valueDate >= cutoff;
}

function getFixedSelection(packageName, packument, version, checkedAt) {
  const metadata = packument?.versions?.[version];
  if (!metadata) {
    throw new Error(`${packageName}: required registry version ${version} is absent`);
  }
  if (!isPublishedBy(version, packument, checkedAt)) {
    throw new Error(`${packageName}@${version}: registry publication date is invalid or in the future`);
  }
  if (!metadataSupportsNode(metadata, NODE_FLOOR_VERSION)) {
    throw new Error(`${packageName}@${version}: does not support Node ${NODE_FLOOR_VERSION}`);
  }
  if (!metadataSupportsCapacitorCore(metadata, CAPACITOR_VERSION)) {
    const declaredRange =
      metadata.peerDependencies?.['@capacitor/core'] ??
      metadata.dependencies?.['@capacitor/core'] ??
      '(missing)';
    throw new Error(
      `${packageName}@${version}: @capacitor/core range ${declaredRange} does not accept ${CAPACITOR_VERSION}`,
    );
  }

  return {
    version,
    metadata,
    publishedAt: packument.time?.[version] ?? null,
  };
}

function assertSecureStorageContracts(contracts) {
  if (contracts.length === 0) {
    throw new Error('secure-storage Capacitor compatibility contracts are absent');
  }

  for (const contract of contracts) {
    if (!contract.satisfied) {
      throw new Error(
        `secure-storage ${contract.relationship} ${contract.packageName} range ${contract.range} does not accept ${contract.selectedVersion}`,
      );
    }
  }
}

export function buildCompatibilityEvidence({
  checkedAt,
  packuments,
  secureStorageUpstreamActivity,
}) {
  const checkDate = new Date(checkedAt);
  if (Number.isNaN(checkDate.getTime())) {
    throw new Error('Compatibility evidence check date is invalid');
  }

  const selections = {};
  for (const [packageName, version] of Object.entries(FIXED_VERSION_PINS)) {
    selections[packageName] = getFixedSelection(
      packageName,
      packuments[packageName],
      version,
      checkedAt,
    );
  }

  for (const packageName of REGISTRY_SELECTED_PACKAGES) {
    selections[packageName] = selectLatestCompatibleVersion(
      packageName,
      packuments[packageName],
      {
        capacitorVersion: CAPACITOR_VERSION,
        nodeVersion: NODE_FLOOR_VERSION,
        checkedAt,
      },
    );
  }

  const selectedVersions = Object.fromEntries(
    Object.entries(selections).map(([packageName, selection]) => [
      packageName,
      selection.version,
    ]),
  );
  const packages = {};

  for (const packageName of REQUIRED_PACKAGES) {
    const selection = selections[packageName];
    const repositoryUrl = normalizeRepositoryUrl(selection.metadata.repository);
    const { contracts, bundledDependencies } = createCapacitorContracts(
      packageName,
      selection.metadata,
      selectedVersions,
    );

    if (packageName === SECURE_STORAGE_PACKAGE) {
      assertSecureStorageContracts(contracts);
    } else {
      const incompatibleContract = contracts.find(({ satisfied }) => !satisfied);
      if (incompatibleContract) {
        throw new Error(
          `${packageName} ${incompatibleContract.relationship} ${incompatibleContract.packageName} range ${incompatibleContract.range} does not accept ${incompatibleContract.selectedVersion}`,
        );
      }
    }

    packages[packageName] = {
      selectedVersion: selection.version,
      publishedAt: selection.publishedAt,
      sourceUrls: uniqueHttpsUrls([
        registryVersionUrl(packageName, selection.version),
        npmVersionUrl(packageName, selection.version),
        repositoryUrl,
      ]),
      engines: selection.metadata.engines ?? {},
      peerDependencies: selection.metadata.peerDependencies ?? {},
      dependencies: selection.metadata.dependencies ?? {},
      compatibility: {
        nodeFloorAccepted: metadataSupportsNode(selection.metadata, NODE_FLOOR_VERSION),
        capacitorContracts: contracts,
        bundledCapacitorDependencies: bundledDependencies,
      },
    };
  }

  if (!secureStorageUpstreamActivity) {
    throw new Error('Secure-storage upstream activity evidence is absent');
  }
  assertFreshDate(
    secureStorageUpstreamActivity.occurredAt,
    checkDate,
    'Secure-storage upstream activity',
  );
  if (
    !secureStorageUpstreamActivity.ref ||
    !['commit', 'release'].includes(secureStorageUpstreamActivity.type) ||
    !secureStorageUpstreamActivity.sourceUrl?.startsWith('https://')
  ) {
    throw new Error('Secure-storage upstream activity evidence is incomplete');
  }

  const secureStorageEvidence = packages[SECURE_STORAGE_PACKAGE];
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    checkedAt: checkDate.toISOString(),
    compatibilityWindowMonths: EVIDENCE_MAX_AGE_MONTHS,
    targets: {
      capacitor: CAPACITOR_VERSION,
      nodeFloor: NODE_FLOOR_VERSION,
    },
    sourceUrls: [REGISTRY_BASE_URL, SECURE_STORAGE_COMMITS_URL],
    packages,
    secureStorage: {
      packageName: SECURE_STORAGE_PACKAGE,
      selectedVersion: FIXED_VERSION_PINS[SECURE_STORAGE_PACKAGE],
      capacitorCompatibility: {
        capacitorVersion: CAPACITOR_VERSION,
        sourceUrl: secureStorageEvidence.sourceUrls[0],
        contracts: secureStorageEvidence.compatibility.capacitorContracts,
      },
      latestQualifyingUpstreamActivity: { ...secureStorageUpstreamActivity },
    },
  };
}

function addDiagnostic(diagnostics, code, message, packageName) {
  diagnostics.push({ code, message, ...(packageName ? { packageName } : {}) });
}

function collectManifestDependencies(manifest, diagnostics) {
  const dependencies = manifest.dependencies ?? {};
  const devDependencies = manifest.devDependencies ?? {};
  const duplicates = Object.keys(dependencies).filter((name) => name in devDependencies);

  for (const packageName of duplicates) {
    addDiagnostic(
      diagnostics,
      'DUPLICATE_PIN',
      `${packageName} must appear in only one dependency section`,
      packageName,
    );
  }

  return { ...dependencies, ...devDependencies };
}

function validateManifestPins(manifest, evidence, diagnostics) {
  const dependencies = collectManifestDependencies(manifest, diagnostics);

  if (!satisfiesVersionRange(NODE_FLOOR_VERSION, manifest.engines?.node ?? '')) {
    addDiagnostic(
      diagnostics,
      'NODE_FLOOR_MISMATCH',
      `package.json engines.node must include Node ${NODE_FLOOR_VERSION}`,
    );
  }

  for (const [packageName, expectedVersion] of Object.entries(FIXED_VERSION_PINS)) {
    const actualVersion = dependencies[packageName];
    if (actualVersion === undefined) {
      addDiagnostic(
        diagnostics,
        'MISSING_PIN',
        `${packageName} is missing; pin it to exactly ${expectedVersion}`,
        packageName,
      );
    } else if (!isExactStableVersion(actualVersion)) {
      addDiagnostic(
        diagnostics,
        'NON_EXACT_PIN',
        `${packageName} must use exact version ${expectedVersion}; found ${actualVersion}`,
        packageName,
      );
    } else if (actualVersion !== expectedVersion) {
      addDiagnostic(
        diagnostics,
        'WRONG_FIXED_PIN',
        `${packageName} must be pinned to exactly ${expectedVersion}; found ${actualVersion}`,
        packageName,
      );
    }
  }

  for (const packageName of REGISTRY_SELECTED_PACKAGES) {
    const actualVersion = dependencies[packageName];
    const evidenceVersion = evidence?.packages?.[packageName]?.selectedVersion;
    if (actualVersion === undefined) {
      addDiagnostic(
        diagnostics,
        'MISSING_PIN',
        `${packageName} is missing; pin the exact registry-qualified version${
          evidenceVersion ? ` ${evidenceVersion}` : ' recorded in compatibility evidence'
        }`,
        packageName,
      );
    } else if (!isExactStableVersion(actualVersion)) {
      addDiagnostic(
        diagnostics,
        'NON_EXACT_PIN',
        `${packageName} must use an exact stable version; found ${actualVersion}`,
        packageName,
      );
    } else if (evidenceVersion && actualVersion !== evidenceVersion) {
      addDiagnostic(
        diagnostics,
        'EVIDENCE_VERSION_MISMATCH',
        `${packageName} is pinned to ${actualVersion}, but compatibility evidence selected ${evidenceVersion}`,
        packageName,
      );
    }
  }
}

function validatePackageEvidence(packageName, packageEvidence, diagnostics) {
  if (!packageEvidence || typeof packageEvidence !== 'object') {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_INCOMPLETE',
      `Compatibility evidence is missing package metadata for ${packageName}`,
      packageName,
    );
    return;
  }

  if (!isExactStableVersion(packageEvidence.selectedVersion)) {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_INCOMPLETE',
      `${packageName} evidence must contain an exact stable selectedVersion`,
      packageName,
    );
  }
  if (
    !Array.isArray(packageEvidence.sourceUrls) ||
    packageEvidence.sourceUrls.length < 2 ||
    packageEvidence.sourceUrls.some((sourceUrl) => !sourceUrl.startsWith('https://'))
  ) {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_INCOMPLETE',
      `${packageName} evidence must contain at least two HTTPS source URLs`,
      packageName,
    );
  }
  if (!packageEvidence.publishedAt || Number.isNaN(Date.parse(packageEvidence.publishedAt))) {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_INCOMPLETE',
      `${packageName} evidence must contain a valid registry publication date`,
      packageName,
    );
  }
  if (!metadataSupportsNode(packageEvidence, NODE_FLOOR_VERSION)) {
    addDiagnostic(
      diagnostics,
      'ENGINE_INCOMPATIBLE',
      `${packageName}@${packageEvidence.selectedVersion} excludes Node ${NODE_FLOOR_VERSION}`,
      packageName,
    );
  }
  if (!metadataSupportsCapacitorCore(packageEvidence, CAPACITOR_VERSION)) {
    addDiagnostic(
      diagnostics,
      'CAPACITOR_CONTRACT_INCOMPATIBLE',
      `${packageName}@${packageEvidence.selectedVersion} excludes Capacitor ${CAPACITOR_VERSION}`,
      packageName,
    );
  }
}

function validateSecureStorageEvidence(evidence, diagnostics) {
  const secureStorage = evidence.secureStorage;
  if (!secureStorage || typeof secureStorage !== 'object') {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_INCOMPLETE',
      'Secure-storage compatibility and maintenance evidence is absent',
      SECURE_STORAGE_PACKAGE,
    );
    return;
  }

  const compatibility = secureStorage.capacitorCompatibility;
  if (
    compatibility?.capacitorVersion !== CAPACITOR_VERSION ||
    !compatibility.sourceUrl?.startsWith('https://') ||
    !Array.isArray(compatibility.contracts) ||
    compatibility.contracts.length === 0
  ) {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_INCOMPLETE',
      'Required secure-storage Capacitor compatibility contracts are absent',
      SECURE_STORAGE_PACKAGE,
    );
  } else {
    for (const contract of compatibility.contracts) {
      if (
        !contract.satisfied ||
        !satisfiesVersionRange(contract.selectedVersion, contract.range)
      ) {
        addDiagnostic(
          diagnostics,
          'CAPACITOR_CONTRACT_INCOMPATIBLE',
          `Secure-storage ${contract.relationship} ${contract.packageName} range ${contract.range} excludes ${contract.selectedVersion}`,
          SECURE_STORAGE_PACKAGE,
        );
      }
    }
  }

  const activity = secureStorage.latestQualifyingUpstreamActivity;
  if (
    !activity ||
    !activity.ref ||
    !['commit', 'release'].includes(activity.type) ||
    !activity.sourceUrl?.startsWith('https://') ||
    Number.isNaN(Date.parse(activity.occurredAt))
  ) {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_INCOMPLETE',
      'Secure-storage upstream release or commit evidence is absent',
      SECURE_STORAGE_PACKAGE,
    );
  }
}

function validateEvidence(evidence, now, diagnostics) {
  if (!evidence) {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_ABSENT',
      'validation/mobile/dependency-compatibility.json is missing; registry and upstream evidence is required',
    );
    return;
  }

  if (
    evidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION ||
    evidence.targets?.capacitor !== CAPACITOR_VERSION ||
    evidence.targets?.nodeFloor !== NODE_FLOOR_VERSION
  ) {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_INCOMPLETE',
      `Compatibility evidence must use schema ${EVIDENCE_SCHEMA_VERSION}, Capacitor ${CAPACITOR_VERSION}, and Node ${NODE_FLOOR_VERSION}`,
    );
  }

  if (!isWithinPriorMonths(evidence.checkedAt, now, EVIDENCE_MAX_AGE_MONTHS)) {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_STALE',
      `Compatibility evidence check date must be within the prior ${EVIDENCE_MAX_AGE_MONTHS} months`,
    );
  }

  for (const packageName of REQUIRED_PACKAGES) {
    validatePackageEvidence(packageName, evidence.packages?.[packageName], diagnostics);
  }

  for (const [packageName, expectedVersion] of Object.entries(FIXED_VERSION_PINS)) {
    const selectedVersion = evidence.packages?.[packageName]?.selectedVersion;
    if (selectedVersion && selectedVersion !== expectedVersion) {
      addDiagnostic(
        diagnostics,
        'EVIDENCE_VERSION_MISMATCH',
        `${packageName} evidence must select fixed version ${expectedVersion}; found ${selectedVersion}`,
        packageName,
      );
    }
  }

  validateSecureStorageEvidence(evidence, diagnostics);
  const activityDate = evidence.secureStorage?.latestQualifyingUpstreamActivity?.occurredAt;
  if (activityDate && !isWithinPriorMonths(activityDate, now, EVIDENCE_MAX_AGE_MONTHS)) {
    addDiagnostic(
      diagnostics,
      'UPSTREAM_ACTIVITY_STALE',
      `Secure-storage latest upstream release or commit must be within the prior ${EVIDENCE_MAX_AGE_MONTHS} months`,
      SECURE_STORAGE_PACKAGE,
    );
  }
}

export function validateDependencyContract({ manifest, evidence, now = new Date() }) {
  const diagnostics = [];
  validateManifestPins(manifest, evidence, diagnostics);
  validateEvidence(evidence, now, diagnostics);
  return { ok: diagnostics.length === 0, diagnostics };
}

function metadataSnapshot(metadata) {
  return {
    dependencies: metadata.dependencies ?? {},
    engines: metadata.engines ?? {},
    peerDependencies: metadata.peerDependencies ?? {},
  };
}

export function validateRegistrySnapshot({ evidence, packuments }) {
  const diagnostics = [];
  if (!evidence?.packages) {
    addDiagnostic(
      diagnostics,
      'EVIDENCE_ABSENT',
      'Compatibility evidence is required before registry verification',
    );
    return { ok: false, diagnostics };
  }

  for (const [packageName, expectedVersion] of Object.entries(FIXED_VERSION_PINS)) {
    const metadata = packuments[packageName]?.versions?.[expectedVersion];
    if (!metadata) {
      addDiagnostic(
        diagnostics,
        'REGISTRY_VERSION_MISSING',
        `${packageName}@${expectedVersion} is no longer present in registry metadata`,
        packageName,
      );
      continue;
    }
    if (
      !metadataSupportsNode(metadata, NODE_FLOOR_VERSION) ||
      !metadataSupportsCapacitorCore(metadata, CAPACITOR_VERSION)
    ) {
      addDiagnostic(
        diagnostics,
        'REGISTRY_CONTRACT_CHANGED',
        `${packageName}@${expectedVersion} no longer satisfies the Node/Capacitor contract`,
        packageName,
      );
    }
  }

  for (const packageName of REGISTRY_SELECTED_PACKAGES) {
    try {
      const selection = selectLatestCompatibleVersion(packageName, packuments[packageName], {
        capacitorVersion: CAPACITOR_VERSION,
        nodeVersion: NODE_FLOOR_VERSION,
        checkedAt: evidence.checkedAt,
      });
      const recordedVersion = evidence.packages[packageName]?.selectedVersion;
      if (selection.version !== recordedVersion) {
        addDiagnostic(
          diagnostics,
          'OUTDATED_REGISTRY_SELECTION',
          `${packageName}: recorded ${recordedVersion ?? 'no version'}, but latest qualifying release is ${selection.version}`,
          packageName,
        );
      } else {
        const recordedSnapshot = metadataSnapshot(evidence.packages[packageName]);
        const liveSnapshot = metadataSnapshot(selection.metadata);
        if (JSON.stringify(recordedSnapshot) !== JSON.stringify(liveSnapshot)) {
          addDiagnostic(
            diagnostics,
            'REGISTRY_METADATA_CHANGED',
            `${packageName}@${selection.version} registry contract differs from recorded evidence`,
            packageName,
          );
        }
      }
    } catch (error) {
      addDiagnostic(
        diagnostics,
        'REGISTRY_CONTRACT_INCOMPATIBLE',
        error instanceof Error ? error.message : String(error),
        packageName,
      );
    }
  }

  return { ok: diagnostics.length === 0, diagnostics };
}

async function fetchJson(url, fetchImplementation) {
  const response = await fetchImplementation(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'block-game-dependency-contract-validator',
    },
  });
  if (!response.ok) {
    throw new Error(`Metadata request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function fetchPackuments(fetchImplementation) {
  const entries = await Promise.all(
    REQUIRED_PACKAGES.map(async (packageName) => {
      const packument = await fetchJson(registryPackumentUrl(packageName), fetchImplementation);
      return [packageName, packument];
    }),
  );
  return Object.fromEntries(entries);
}

function latestRegistryRelease(packument, now) {
  return Object.entries(packument.time ?? {})
    .filter(([version, publishedAt]) => {
      return (
        isStableVersion(version) &&
        Number.isFinite(Date.parse(publishedAt)) &&
        Date.parse(publishedAt) <= now.getTime()
      );
    })
    .sort(([, leftDate], [, rightDate]) => Date.parse(rightDate) - Date.parse(leftDate))[0];
}

async function fetchLatestSecureStorageActivity(packument, fetchImplementation, now) {
  const commits = await fetchJson(SECURE_STORAGE_COMMITS_URL, fetchImplementation);
  const latestCommit = Array.isArray(commits) ? commits[0] : null;
  const commitActivity = latestCommit?.sha
    ? {
        type: 'commit',
        ref: latestCommit.sha,
        occurredAt:
          latestCommit.commit?.committer?.date ?? latestCommit.commit?.author?.date ?? null,
        sourceUrl: latestCommit.html_url,
      }
    : null;

  const registryRelease = latestRegistryRelease(packument, now);
  const releaseActivity = registryRelease
    ? {
        type: 'release',
        ref: `v${registryRelease[0]}`,
        occurredAt: registryRelease[1],
        sourceUrl: npmVersionUrl(SECURE_STORAGE_PACKAGE, registryRelease[0]),
      }
    : null;

  const activities = [commitActivity, releaseActivity]
    .filter((activity) => activity && Number.isFinite(Date.parse(activity.occurredAt)))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));

  if (!activities[0]) {
    throw new Error('No secure-storage upstream release or commit evidence was found');
  }
  return activities[0];
}

export async function refreshCompatibilityEvidence({
  checkedAt = new Date(),
  fetchImplementation = globalThis.fetch,
} = {}) {
  if (typeof fetchImplementation !== 'function') {
    throw new Error('A fetch implementation is required to query registry metadata');
  }

  const checkDate = checkedAt instanceof Date ? checkedAt : new Date(checkedAt);
  const packuments = await fetchPackuments(fetchImplementation);
  const secureStorageUpstreamActivity = await fetchLatestSecureStorageActivity(
    packuments[SECURE_STORAGE_PACKAGE],
    fetchImplementation,
    checkDate,
  );
  const evidence = buildCompatibilityEvidence({
    checkedAt: checkDate.toISOString(),
    packuments,
    secureStorageUpstreamActivity,
  });
  const registryResult = validateRegistrySnapshot({ evidence, packuments });
  if (!registryResult.ok) {
    const detail = registryResult.diagnostics.map(({ message }) => message).join('; ');
    throw new Error(`Fresh registry evidence failed validation: ${detail}`);
  }

  return evidence;
}

function formatDiagnostics(diagnostics) {
  return diagnostics.map(({ code, message }) => `[${code}] ${message}`).join('\n');
}

async function readJsonFile(filePath, { allowMissing = false } = {}) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      throw new Error(`${filePath} contains invalid JSON: ${error.message}`);
    }
    throw error;
  }
}

function parseArguments(argv) {
  const options = {
    manifestPath: path.resolve('package.json'),
    evidencePath: path.resolve('validation/mobile/dependency-compatibility.json'),
    refreshEvidence: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--refresh-evidence') {
      options.refreshEvidence = true;
    } else if (argument === '--manifest' || argument === '--evidence') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a path`);
      }
      index += 1;
      if (argument === '--manifest') options.manifestPath = path.resolve(value);
      else options.evidencePath = path.resolve(value);
    } else if (argument === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/native/verify-dependency-contract.mjs [options]\n\nOptions:\n  --refresh-evidence  Query npm/GitHub and write fresh compatibility evidence\n  --manifest PATH     Read a package manifest other than ./package.json\n  --evidence PATH     Read/write evidence at a custom path\n  --help              Show this help`);
}

async function runCli(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  if (options.refreshEvidence) {
    const evidence = await refreshCompatibilityEvidence();
    await mkdir(path.dirname(options.evidencePath), { recursive: true });
    await writeFile(options.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`Wrote fresh dependency compatibility evidence to ${options.evidencePath}`);
    for (const packageName of REQUIRED_PACKAGES) {
      console.log(`${packageName}@${evidence.packages[packageName].selectedVersion}`);
    }
    return 0;
  }

  const [manifest, evidence] = await Promise.all([
    readJsonFile(options.manifestPath),
    readJsonFile(options.evidencePath, { allowMissing: true }),
  ]);
  const localResult = validateDependencyContract({ manifest, evidence, now: new Date() });
  if (!localResult.ok) {
    console.error(formatDiagnostics(localResult.diagnostics));
    return 1;
  }

  const packuments = await fetchPackuments(globalThis.fetch);
  const registryResult = validateRegistrySnapshot({ evidence, packuments });
  if (!registryResult.ok) {
    console.error(formatDiagnostics(registryResult.diagnostics));
    return 1;
  }

  console.log(
    `Dependency contract verified for Capacitor ${CAPACITOR_VERSION} and Node ${NODE_FLOOR_VERSION}`,
  );
  return 0;
}

const isMainModule =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  runCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[VALIDATOR_ERROR] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}

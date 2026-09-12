import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  CAPACITOR_VERSION,
  FIXED_VERSION_PINS,
  NODE_FLOOR_VERSION,
  REGISTRY_SELECTED_PACKAGES,
  buildCompatibilityEvidence,
  satisfiesVersionRange,
  selectLatestCompatibleVersion,
  validateDependencyContract,
  validateRegistrySnapshot,
} from '../verify-dependency-contract.mjs';

const CHECKED_AT = '2026-09-08T21:17:59.000Z';
const RECENT_ACTIVITY = {
  type: 'commit',
  ref: '43bc5c36cf80bc575b22b4ce849228f591b1b33b',
  occurredAt: '2026-02-12T18:22:28.000Z',
  sourceUrl:
    'https://github.com/aparajita/capacitor-secure-storage/commit/43bc5c36cf80bc575b22b4ce849228f591b1b33b',
};

const EXPECTED_REGISTRY_SELECTIONS = {
  '@capacitor/app': '7.1.2',
  '@capacitor/network': '7.0.4',
  '@capacitor/preferences': '7.0.4',
  '@capacitor/screen-orientation': '7.0.4',
  '@capacitor/status-bar': '7.0.6',
  '@capacitor/splash-screen': '7.0.5',
  '@capacitor/assets': '3.0.5',
  vitest: '4.1.11',
  'fast-check': '4.9.0',
  jsdom: '27.0.1',
  '@testing-library/react': '16.3.3',
  '@testing-library/user-event': '14.6.7',
  '@playwright/test': '1.63.0',
};

function createVersionMetadata(
  name,
  version,
  {
    dependencies = {},
    engines = {},
    peerDependencies = {},
    peerDependenciesMeta = {},
    repository = `https://github.com/example/${name.replaceAll('/', '-')}.git`,
  } = {},
) {
  return {
    name,
    version,
    dependencies,
    engines,
    peerDependencies,
    peerDependenciesMeta,
    repository: { type: 'git', url: repository },
    dist: {
      tarball: `https://registry.npmjs.org/${encodeURIComponent(name)}/-/${name.split('/').at(-1)}-${version}.tgz`,
    },
  };
}

function createPackument(name, versionDefinitions) {
  const versions = {};
  const time = {};

  for (const [version, definition] of Object.entries(versionDefinitions)) {
    const { publishedAt = '2026-01-15T12:00:00.000Z', ...metadata } = definition;
    versions[version] = createVersionMetadata(name, version, metadata);
    time[version] = publishedAt;
  }

  return {
    name,
    'dist-tags': { latest: Object.keys(versionDefinitions).at(-1) },
    versions,
    time,
  };
}

function createFixturePackuments() {
  const packuments = {
    '@capacitor/core': createPackument('@capacitor/core', {
      '7.4.4': {},
      '8.5.1': {},
    }),
    '@capacitor/cli': createPackument('@capacitor/cli', {
      '7.4.4': { engines: { node: '>=20.0.0' } },
      '8.5.1': { engines: { node: '>=22.0.0' } },
    }),
    '@capacitor/ios': createPackument('@capacitor/ios', {
      '7.4.4': { peerDependencies: { '@capacitor/core': '^7.4.0' } },
      '8.5.1': { peerDependencies: { '@capacitor/core': '^8.5.0' } },
    }),
    '@capacitor/android': createPackument('@capacitor/android', {
      '7.4.4': { peerDependencies: { '@capacitor/core': '^7.4.0' } },
      '8.5.1': { peerDependencies: { '@capacitor/core': '^8.5.0' } },
    }),
    '@aparajita/capacitor-secure-storage': createPackument(
      '@aparajita/capacitor-secure-storage',
      {
        '7.1.6': {
          engines: { node: '>=20.0.0' },
          dependencies: {
            '@capacitor/app': '^7.1.0',
            '@capacitor/ios': '^7.4.4',
            '@capacitor/core': '^7.4.4',
            '@capacitor/android': '^7.4.4',
          },
          repository: 'https://github.com/aparajita/capacitor-secure-storage.git',
        },
        '8.0.0': {
          engines: { node: '>=20.0.0' },
          dependencies: { '@capacitor/core': '^8.0.2' },
        },
      },
    ),
  };

  const capacitorPluginVersions = {
    '@capacitor/app': ['7.1.2', '8.1.1'],
    '@capacitor/network': ['7.0.4', '8.0.1'],
    '@capacitor/preferences': ['7.0.4', '8.0.1'],
    '@capacitor/screen-orientation': ['7.0.4', '8.0.1'],
    '@capacitor/status-bar': ['7.0.6', '8.0.3'],
    '@capacitor/splash-screen': ['7.0.5', '8.0.2'],
  };

  for (const [name, [compatibleVersion, incompatibleVersion]] of Object.entries(
    capacitorPluginVersions,
  )) {
    packuments[name] = createPackument(name, {
      [compatibleVersion]: { peerDependencies: { '@capacitor/core': '>=7.0.0 <8.0.0' } },
      [incompatibleVersion]: { peerDependencies: { '@capacitor/core': '>=8.0.0' } },
    });
  }

  Object.assign(packuments, {
    '@capacitor/assets': createPackument('@capacitor/assets', {
      '3.0.5': {
        engines: { node: '>=10.3.0' },
        dependencies: { '@capacitor/cli': '^5.3.0' },
        repository: 'https://github.com/ionic-team/capacitor-assets.git',
      },
    }),
    vitest: createPackument('vitest', {
      '4.1.11': {
        engines: { node: '^20.0.0 || ^22.0.0 || >=24.0.0' },
        peerDependencies: { vite: '^6.0.0 || ^7.0.0 || ^8.0.0' },
      },
      '5.0.0': { engines: { node: '^22.12.0 || ^24.0.0 || >=26.0.0' } },
    }),
    'fast-check': createPackument('fast-check', {
      '4.9.0': { engines: { node: '>=12.17.0' } },
    }),
    jsdom: createPackument('jsdom', {
      '27.0.1': { engines: { node: '>=20' } },
      '27.4.0': { engines: { node: '^20.19.0 || ^22.12.0 || >=24.0.0' } },
      '30.0.1': { engines: { node: '^22.22.2 || ^24.15.0 || >=26.0.0' } },
    }),
    '@testing-library/react': createPackument('@testing-library/react', {
      '16.3.3': {
        engines: { node: '>=18' },
        peerDependencies: {
          react: '^18.0.0 || ^19.0.0',
          'react-dom': '^18.0.0 || ^19.0.0',
          '@testing-library/dom': '^10.0.0',
        },
      },
    }),
    '@testing-library/user-event': createPackument('@testing-library/user-event', {
      '14.6.7': {
        engines: { node: '>=12' },
        peerDependencies: { '@testing-library/dom': '>=7.21.4' },
      },
    }),
    '@playwright/test': createPackument('@playwright/test', {
      '1.63.0': { engines: { node: '>=20' } },
    }),
  });

  return packuments;
}

function createValidEvidence(packuments = createFixturePackuments()) {
  return buildCompatibilityEvidence({
    checkedAt: CHECKED_AT,
    packuments,
    secureStorageUpstreamActivity: RECENT_ACTIVITY,
  });
}

function createValidManifest(evidence) {
  const devDependencies = { ...FIXED_VERSION_PINS };

  for (const name of REGISTRY_SELECTED_PACKAGES) {
    devDependencies[name] = evidence.packages[name].selectedVersion;
  }

  return {
    name: 'fixture',
    private: true,
    engines: { node: '>=20' },
    dependencies: {},
    devDependencies,
  };
}

function diagnosticCodes(result) {
  return new Set(result.diagnostics.map(({ code }) => code));
}

describe('version contract helpers', () => {
  test('should evaluate the npm ranges used by registry metadata against concrete versions', () => {
    const examples = [
      ['7.4.4', '^7.4.0', true],
      ['7.4.4', '>=7.0.0 <8.0.0', true],
      ['7.4.4', '>=8.0.0', false],
      ['20.0.0', '>=20', true],
      ['20.0.0', '^20.0.0 || ^22.0.0 || >=24.0.0', true],
      ['20.0.0', '^20.19.0 || ^22.12.0 || >=24.0.0', false],
      ['19.2.0', '^18.0.0 || ^19.0.0', true],
      ['5.9.2', '~5.9.2', true],
      ['6.0.0', '~5.9.2', false],
    ];

    for (const [version, range, expected] of examples) {
      assert.equal(
        satisfiesVersionRange(version, range),
        expected,
        `${version} ${expected ? 'should satisfy' : 'should not satisfy'} ${range}`,
      );
    }
  });

  test('should select the latest stable release compatible with Capacitor 7.4.4', () => {
    const packument = createFixturePackuments()['@capacitor/app'];

    const selected = selectLatestCompatibleVersion('@capacitor/app', packument, {
      capacitorVersion: CAPACITOR_VERSION,
      nodeVersion: NODE_FLOOR_VERSION,
    });

    assert.equal(selected.version, '7.1.2');
    assert.equal(selected.metadata.peerDependencies['@capacitor/core'], '>=7.0.0 <8.0.0');
  });

  test('should select the latest release that supports the full Node 20 floor', () => {
    const packuments = createFixturePackuments();

    assert.equal(
      selectLatestCompatibleVersion('vitest', packuments.vitest, {
        capacitorVersion: CAPACITOR_VERSION,
        nodeVersion: NODE_FLOOR_VERSION,
      }).version,
      '4.1.11',
    );
    assert.equal(
      selectLatestCompatibleVersion('jsdom', packuments.jsdom, {
        capacitorVersion: CAPACITOR_VERSION,
        nodeVersion: NODE_FLOOR_VERSION,
      }).version,
      '27.0.1',
    );
  });

  test('should reject a package when no stable version supports Node 20', () => {
    const packument = createPackument('node-22-only', {
      '1.0.0': { engines: { node: '>=22' } },
      '2.0.0-beta.1': { engines: { node: '>=20' } },
    });

    assert.throws(
      () =>
        selectLatestCompatibleVersion('node-22-only', packument, {
          capacitorVersion: CAPACITOR_VERSION,
          nodeVersion: NODE_FLOOR_VERSION,
        }),
      /no stable registry version supports Node 20\.0\.0/,
    );
  });
});

describe('compatibility evidence', () => {
  test('should record exact selections, source URLs, and secure-storage maintenance evidence', () => {
    const evidence = createValidEvidence();

    assert.equal(evidence.schemaVersion, 1);
    assert.equal(evidence.checkedAt, CHECKED_AT);
    assert.deepEqual(evidence.targets, {
      capacitor: CAPACITOR_VERSION,
      nodeFloor: NODE_FLOOR_VERSION,
    });

    for (const [name, version] of Object.entries({
      ...FIXED_VERSION_PINS,
      ...EXPECTED_REGISTRY_SELECTIONS,
    })) {
      const packageEvidence = evidence.packages[name];
      assert.equal(packageEvidence.selectedVersion, version, name);
      assert.ok(packageEvidence.sourceUrls.length >= 2, name);
      assert.ok(packageEvidence.sourceUrls.every((sourceUrl) => sourceUrl.startsWith('https://')));
    }

    assert.equal(
      evidence.packages['@capacitor/assets'].dependencies['@capacitor/cli'],
      '^5.3.0',
      'ordinary nested tool dependencies remain visible in evidence',
    );
    assert.ok(
      evidence.secureStorage.capacitorCompatibility.contracts.every(
        ({ satisfied }) => satisfied,
      ),
    );
    assert.deepEqual(evidence.secureStorage.latestQualifyingUpstreamActivity, RECENT_ACTIVITY);
  });

  test('should fail evidence generation when secure-storage runtime dependencies exclude the selected Capacitor set', () => {
    const packuments = createFixturePackuments();
    packuments['@aparajita/capacitor-secure-storage'].versions['7.1.6'].dependencies[
      '@capacitor/core'
    ] = '^8.0.0';

    assert.throws(
      () =>
        buildCompatibilityEvidence({
          checkedAt: CHECKED_AT,
          packuments,
          secureStorageUpstreamActivity: RECENT_ACTIVITY,
        }),
      /secure-storage.*@capacitor\/core.*does not accept 7\.4\.4/i,
    );
  });

  test('should detect when registry metadata has a newer qualifying release than recorded evidence', () => {
    const packuments = createFixturePackuments();
    const evidence = createValidEvidence(packuments);
    packuments['@capacitor/app'].versions['7.1.3'] = createVersionMetadata(
      '@capacitor/app',
      '7.1.3',
      { peerDependencies: { '@capacitor/core': '>=7.0.0 <8.0.0' } },
    );
    packuments['@capacitor/app'].time['7.1.3'] = '2026-08-01T00:00:00.000Z';

    const result = validateRegistrySnapshot({ evidence, packuments });

    assert.equal(result.ok, false);
    assert.ok(diagnosticCodes(result).has('OUTDATED_REGISTRY_SELECTION'));
    assert.match(
      result.diagnostics.find(({ packageName }) => packageName === '@capacitor/app').message,
      /recorded 7\.1\.2.*latest qualifying release is 7\.1\.3/,
    );
  });
});

describe('dependency contract validation', () => {
  test('should pass when every dependency is exact and the compatibility evidence is fresh', () => {
    const evidence = createValidEvidence();
    const manifest = createValidManifest(evidence);

    const result = validateDependencyContract({
      evidence,
      manifest,
      now: new Date(CHECKED_AT),
    });

    assert.deepEqual(result, { ok: true, diagnostics: [] });
  });

  test('should name every missing pin and missing evidence when the manifest is unprepared', () => {
    const result = validateDependencyContract({
      evidence: null,
      manifest: {
        name: 'unprepared',
        engines: { node: '>=20' },
        dependencies: {},
        devDependencies: {},
      },
      now: new Date(CHECKED_AT),
    });

    assert.equal(result.ok, false);
    assert.ok(diagnosticCodes(result).has('MISSING_PIN'));
    assert.ok(diagnosticCodes(result).has('EVIDENCE_ABSENT'));

    for (const name of [...Object.keys(FIXED_VERSION_PINS), ...REGISTRY_SELECTED_PACKAGES]) {
      assert.match(
        result.diagnostics.find(({ packageName }) => packageName === name).message,
        new RegExp(name.replaceAll('/', '\\/').replaceAll('@', '\\@')),
      );
    }
  });

  test('should reject fixed-version drift and every form of open direct dependency range', () => {
    const evidence = createValidEvidence();
    const manifest = createValidManifest(evidence);
    manifest.devDependencies['@capacitor/core'] = '^7.4.4';
    manifest.devDependencies['@aparajita/capacitor-secure-storage'] = '7.1.5';
    manifest.devDependencies['@capacitor/app'] = 'latest';

    const result = validateDependencyContract({
      evidence,
      manifest,
      now: new Date(CHECKED_AT),
    });

    assert.equal(result.ok, false);
    assert.ok(diagnosticCodes(result).has('NON_EXACT_PIN'));
    assert.ok(diagnosticCodes(result).has('WRONG_FIXED_PIN'));
    assert.match(
      result.diagnostics.find(
        ({ packageName }) => packageName === '@aparajita/capacitor-secure-storage',
      ).message,
      /exactly 7\.1\.6/,
    );
  });

  test('should fail closed when evidence is stale or its upstream activity leaves the prior 12 months', () => {
    const evidence = createValidEvidence();
    const manifest = createValidManifest(evidence);
    evidence.checkedAt = '2025-09-07T00:00:00.000Z';
    evidence.secureStorage.latestQualifyingUpstreamActivity.occurredAt =
      '2025-09-07T00:00:00.000Z';

    const result = validateDependencyContract({
      evidence,
      manifest,
      now: new Date(CHECKED_AT),
    });

    assert.equal(result.ok, false);
    assert.ok(diagnosticCodes(result).has('EVIDENCE_STALE'));
    assert.ok(diagnosticCodes(result).has('UPSTREAM_ACTIVITY_STALE'));
  });

  test('should fail closed when package sources or secure-storage compatibility evidence are absent', () => {
    const evidence = createValidEvidence();
    const manifest = createValidManifest(evidence);
    evidence.packages.vitest.sourceUrls = [];
    evidence.secureStorage.capacitorCompatibility.contracts = [];

    const result = validateDependencyContract({
      evidence,
      manifest,
      now: new Date(CHECKED_AT),
    });

    assert.equal(result.ok, false);
    assert.ok(diagnosticCodes(result).has('EVIDENCE_INCOMPLETE'));
    assert.ok(
      result.diagnostics.some(
        ({ packageName, message }) =>
          packageName === 'vitest' && message.includes('source URLs'),
      ),
    );
    assert.ok(
      result.diagnostics.some(({ message }) =>
        message.includes('secure-storage Capacitor compatibility contracts'),
      ),
    );
  });
});


describe('live metadata refresh boundaries', () => {
  test('should ignore a compatible release published after the evidence check date', () => {
    const packuments = createFixturePackuments();
    packuments['@capacitor/app'].versions['7.1.3'] = createVersionMetadata(
      '@capacitor/app',
      '7.1.3',
      { peerDependencies: { '@capacitor/core': '>=7.0.0 <8.0.0' } },
    );
    packuments['@capacitor/app'].time['7.1.3'] = '2026-09-09T00:00:00.000Z';

    const selected = selectLatestCompatibleVersion(
      '@capacitor/app',
      packuments['@capacitor/app'],
      {
        capacitorVersion: CAPACITOR_VERSION,
        nodeVersion: NODE_FLOOR_VERSION,
        checkedAt: CHECKED_AT,
      },
    );

    assert.equal(selected.version, '7.1.2');
  });

  test('should build fresh evidence from injected registry and upstream responses', async () => {
    const { refreshCompatibilityEvidence } = await import(
      '../verify-dependency-contract.mjs'
    );
    const packuments = createFixturePackuments();
    const requestedUrls = [];
    const fetchImplementation = async (url) => {
      requestedUrls.push(url);
      if (new URL(url).hostname === 'api.github.com') {
        return {
          ok: true,
          status: 200,
          async json() {
            return [
              {
                sha: RECENT_ACTIVITY.ref,
                html_url: RECENT_ACTIVITY.sourceUrl,
                commit: { committer: { date: RECENT_ACTIVITY.occurredAt } },
              },
            ];
          },
        };
      }

      const packageName = decodeURIComponent(new URL(url).pathname.slice(1));
      assert.ok(packuments[packageName], `unexpected registry request for ${packageName}`);
      return {
        ok: true,
        status: 200,
        async json() {
          return structuredClone(packuments[packageName]);
        },
      };
    };

    const evidence = await refreshCompatibilityEvidence({
      checkedAt: new Date(CHECKED_AT),
      fetchImplementation,
    });

    assert.equal(evidence.packages.vitest.selectedVersion, '4.1.11');
    assert.equal(evidence.packages.jsdom.selectedVersion, '27.0.1');
    assert.equal(
      evidence.secureStorage.latestQualifyingUpstreamActivity.ref,
      RECENT_ACTIVITY.ref,
    );
    assert.equal(
      requestedUrls.filter((url) => new URL(url).hostname === 'registry.npmjs.org').length,
      Object.keys(FIXED_VERSION_PINS).length + REGISTRY_SELECTED_PACKAGES.length,
    );
    assert.equal(
      requestedUrls.filter((url) => new URL(url).hostname === 'api.github.com').length,
      1,
    );
  });
});

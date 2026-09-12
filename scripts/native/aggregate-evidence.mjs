#!/usr/bin/env node

// Release evidence aggregator (task 14.2).
//
// Maps the nine evidence categories (command, build, browser, server, native,
// touch, lifecycle, network, performance) onto the deterministic criterion
// results (12.1-12.16) the release gate consumes. There is NO partial success:
// a criterion is `pass` only when every category backing it is present and
// passing; a failing category fails its criteria and a missing category leaves
// them `absent`. The output feeds directly into
// `scripts/native/release-gate.mjs`.

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const EVIDENCE_CATEGORIES = Object.freeze([
  'command',
  'build',
  'browser',
  'server',
  'native',
  'touch',
  'lifecycle',
  'network',
  'performance',
]);

// Each release criterion 12.1-12.16 is backed by one or more evidence
// categories. A criterion passes only when EVERY backing category passes.
const CRITERION_CATEGORIES = {
  '12.1': ['command', 'build'], // typecheck + web build
  '12.2': ['native'], // all-platform capacitor sync from clean checkout
  '12.3': ['native'], // iOS native release artifact
  '12.4': ['native'], // Android native release artifact
  '12.5': ['native'], // iOS install/launch/resume/play/multiplayer/relaunch
  '12.6': ['native'], // Android install/launch/... flow
  '12.7': ['browser'], // desktop Core Web Regression
  '12.8': ['native'], // secure-storage token + device-id routing
  '12.9': ['server', 'build'], // production endpoint inspection (no localhost/insecure)
  '12.10': ['server'], // HTTP + WS approved from each configured origin
  '12.11': ['server'], // HTTP + WS rejected from unapproved origins
  '12.12': ['lifecycle'], // five background/resume cycles, no dup save/socket, no lost state
  '12.13': ['network'], // recover REST + multiplayer after interruptions
  '12.14': ['touch'], // full touch-action matrix without keyboard/mouse
  '12.15': ['touch'], // touch targets inside safe area in both landscape rotations
  '12.16': ['performance'], // representative session + performance-validator evidence
};

function categoryStatus(evidence, category) {
  const entry = evidence?.[category];
  if (entry == null) return 'absent';
  return entry.status === 'pass' ? 'pass' : 'fail';
}

/**
 * Aggregate a category-keyed evidence bundle into criterion results.
 *
 * @param {Record<string, { status?: string }>} evidence
 * @returns {{ complete: boolean, criteria: Array<{id:string,status:string,categories:string[]}>, categoryStatuses: Record<string,string> }}
 */
export function aggregateEvidence(evidence = {}) {
  const categoryStatuses = {};
  for (const category of EVIDENCE_CATEGORIES) {
    categoryStatuses[category] = categoryStatus(evidence, category);
  }

  const criteria = [];
  for (const [id, categories] of Object.entries(CRITERION_CATEGORIES)) {
    const statuses = categories.map((c) => categoryStatuses[c]);
    let status;
    if (statuses.some((s) => s === 'absent')) {
      status = 'absent';
    } else if (statuses.some((s) => s === 'fail')) {
      status = 'fail';
    } else {
      status = 'pass';
    }
    criteria.push({ id, status, categories: [...categories] });
  }

  const complete = criteria.every((c) => c.status === 'pass');
  return { complete, criteria, categoryStatuses };
}

function main() {
  const evidencePath = process.argv[2];
  if (!evidencePath) {
    console.error('usage: aggregate-evidence.mjs <evidence-bundle.json>');
    process.exit(2);
  }
  const evidence = JSON.parse(readFileSync(path.resolve(evidencePath), 'utf8'));
  const result = aggregateEvidence(evidence);
  console.log(JSON.stringify(result, null, 2));
  if (!result.complete) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

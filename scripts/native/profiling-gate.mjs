#!/usr/bin/env node

// Profiling-gated advanced-meshing decision (task 14.5) — Requirement 13.
//
// This module is a PURE, decision-only validator. It consumes measured
// evidence (prerequisite requirement status, per-device FPS, and a ranked
// main-thread CPU profile) and emits exactly one machine-readable decision. It
// deliberately contains NO Worker or Greedy meshing implementation, and its
// output can only ever be a scope decision — never an instruction to implement
// either technique. That keeps advanced meshing out of this feature's scope
// (13.1) until objective evidence authorizes a separately scoped evaluation.

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const DECISIONS = Object.freeze([
  'deferred',
  'profile-required',
  'separate-meshing-evaluation-authorized',
  'optimize-largest-contributor',
]);

// The two frame-time contributors whose profile share can authorize a
// separately scoped meshing evaluation.
const MESHING_CONTRIBUTORS = new Set(['chunk-generation', 'mesh-construction']);
const THRESHOLD_PERCENT = 20;
const TOP_N = 3;

const FPS_TARGET = 45;

function prerequisitesMet(prerequisites = {}) {
  return Boolean(prerequisites.req8) && Boolean(prerequisites.req9) && Boolean(prerequisites.req10);
}

function anyDeviceMissesFps(fps = {}) {
  return Object.values(fps).some((v) => typeof v === 'number' && v < FPS_TARGET);
}

function rankContributors(contributors = []) {
  return [...contributors]
    .filter((c) => c && typeof c.name === 'string' && typeof c.percent === 'number')
    .sort((a, b) => b.percent - a.percent);
}

/**
 * Decide the advanced-meshing scope from measured evidence.
 *
 * @param {{
 *   prerequisites?: { req8?: boolean, req9?: boolean, req10?: boolean },
 *   fps?: Record<string, number>,
 *   profile?: { contributors?: Array<{ name: string, percent: number }> }
 * }} input
 * @returns {{ decision: string, reason: string, largestContributor: string|null }}
 */
export function decideAdvancedMeshing({ prerequisites = {}, fps = {}, profile } = {}) {
  // 13.4 / 13.2: without prerequisites met, meshing stays deferred and no
  // profiling is triggered — an early miss is not attributable to meshing.
  if (!prerequisitesMet(prerequisites)) {
    return { decision: 'deferred', reason: 'prerequisites-8-10-not-met', largestContributor: null };
  }

  // 13.1 / target met on both devices: nothing to profile, stays deferred.
  if (!anyDeviceMissesFps(fps)) {
    return { decision: 'deferred', reason: 'fps-target-met', largestContributor: null };
  }

  // A device misses FPS with prerequisites met. 13.2: a CPU profile is required
  // before any authorization can be made.
  const ranked = profile ? rankContributors(profile.contributors ?? []) : null;
  if (!ranked || ranked.length === 0) {
    return { decision: 'profile-required', reason: 'fps-missed-profile-not-collected', largestContributor: null };
  }

  const largestContributor = ranked[0].name;
  const topThree = new Set(ranked.slice(0, TOP_N).map((c) => c.name));

  // 13.3: authorize ONLY when chunk-generation OR mesh-construction is BOTH
  // top-three AND at least 20% of measured main-thread time.
  const authorized = ranked.some(
    (c) => MESHING_CONTRIBUTORS.has(c.name) && topThree.has(c.name) && c.percent >= THRESHOLD_PERCENT,
  );
  if (authorized) {
    return {
      decision: 'separate-meshing-evaluation-authorized',
      reason: 'meshing-contributor-top-three-and-over-threshold',
      largestContributor,
    };
  }

  // 13.4 / 13.5: threshold not met — keep meshing deferred and prioritize the
  // largest measured contributor.
  return {
    decision: 'optimize-largest-contributor',
    reason: 'meshing-threshold-not-met',
    largestContributor,
  };
}

function main() {
  const evidencePath = process.argv[2];
  if (!evidencePath) {
    console.error('usage: profiling-gate.mjs <profiling-evidence.json>');
    process.exit(2);
  }
  const evidence = JSON.parse(readFileSync(path.resolve(evidencePath), 'utf8'));
  const result = decideAdvancedMeshing(evidence);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

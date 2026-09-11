// RED/GREEN (task 14.2): the evidence aggregator maps the nine evidence
// categories (command, build, browser, server, native, touch, lifecycle,
// network, performance) to the deterministic criterion-result set the release
// gate consumes. It accepts NO partial success: a category with any failing or
// missing evidence contributes failing/absent criterion results, and the whole
// candidate is only acceptable when every category is complete and passing.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  EVIDENCE_CATEGORIES,
  aggregateEvidence,
} from '../aggregate-evidence.mjs';

// A complete, all-passing evidence bundle keyed by category.
function completeEvidence() {
  return {
    command: { status: 'pass' },
    build: { status: 'pass' },
    browser: { status: 'pass' },
    server: { status: 'pass' },
    native: { status: 'pass' },
    touch: { status: 'pass' },
    lifecycle: { status: 'pass' },
    network: { status: 'pass' },
    performance: { status: 'pass' },
  };
}

describe('release evidence aggregator', () => {
  test('exposes exactly the nine evidence categories', () => {
    assert.deepEqual(
      [...EVIDENCE_CATEGORIES].sort(),
      ['browser', 'build', 'command', 'lifecycle', 'native', 'network', 'performance', 'server', 'touch'].sort(),
    );
  });

  test('a complete all-passing bundle yields a pass for every required criterion 12.1-12.16', () => {
    const result = aggregateEvidence(completeEvidence());
    assert.equal(result.complete, true, JSON.stringify(result));
    const ids = result.criteria.map((c) => c.id).sort();
    const expected = Array.from({ length: 16 }, (_, i) => `12.${i + 1}`).sort();
    assert.deepEqual(ids, expected);
    assert.ok(result.criteria.every((c) => c.status === 'pass'));
  });

  test('a failing category marks its mapped criteria failed — no partial success', () => {
    const ev = completeEvidence();
    ev.performance = { status: 'fail' };
    const result = aggregateEvidence(ev);
    assert.equal(result.complete, false);
    // The performance category backs the performance-acceptance criterion 12.16.
    const perf = result.criteria.find((c) => c.id === '12.16');
    assert.equal(perf.status, 'fail');
  });

  test('a missing category is not silently treated as passing', () => {
    const ev = completeEvidence();
    delete ev.server;
    const result = aggregateEvidence(ev);
    assert.equal(result.complete, false);
    // Server-backed criteria must not be pass when the category is absent.
    const serverCriteria = result.criteria.filter((c) => ['12.9', '12.10', '12.11'].includes(c.id));
    assert.ok(serverCriteria.every((c) => c.status !== 'pass'));
  });

  test('every required criterion has at least one backing category', () => {
    const result = aggregateEvidence(completeEvidence());
    const expected = Array.from({ length: 16 }, (_, i) => `12.${i + 1}`);
    for (const id of expected) {
      assert.ok(result.criteria.some((c) => c.id === id), `criterion ${id} must be produced`);
    }
  });
});

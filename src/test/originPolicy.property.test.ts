// Property test (task 2.6) — Feature: capacitor-mobile-app, Property 2: Origin
// approval is exact membership.
//
// For any finite allowlist and any candidate origin, the policy approves the
// candidate if and only if its canonical form is an exact member of the
// allowlist. Substrings, suffixes, confusable hosts, and malformed values are
// never approved unless they canonicalize to an exact member.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
// The origin policy is plain ESM JS; import it directly.
import { createOriginPolicy } from '../../server/origin-policy.mjs';

const scheme = fc.constantFrom('https', 'http', 'capacitor', 'ionic');
const label = fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/);
const host = fc
  .array(label, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join('.'));
const port = fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined });

const originArb = fc.record({ scheme, host, port }).map(({ scheme: s, host: h, port: p }) => {
  // Drop default ports so the string matches the policy's canonical form.
  const isDefault = (s === 'https' && p === 443) || (s === 'http' && p === 80);
  return p !== undefined && !isDefault ? `${s}://${h}:${p}` : `${s}://${h}`;
});

describe('Feature: capacitor-mobile-app, Property 2: Origin approval is exact membership', () => {
  it('approves iff the candidate canonicalizes to an exact allowlist member', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(originArb, { minLength: 0, maxLength: 6 }),
        originArb,
        // Adversarial mutations that must NOT slip past exact membership.
        fc.constantFrom('suffix', 'substring', 'confusable', 'extra-port', 'as-is'),
        (allowlist, candidate, mutation) => {
          const policy = createOriginPolicy({ allowlist });

          let probe = candidate;
          if (mutation === 'suffix') probe = `${candidate}.evil.com`;
          else if (mutation === 'substring') probe = candidate.replace('://', '://a');
          else if (mutation === 'confusable') probe = `${candidate}\u200b`;
          else if (mutation === 'extra-port') probe = `${candidate}:1`;

          const expected = allowlist.includes(probe);
          const httpAllowed = policy.decideHttp({ origin: probe, method: 'GET' }).allowed;
          const wsAllowed = policy.decideUpgrade({ origin: probe, path: '/api/mp' }).allowed;

          // HTTP and WS share the same membership decision for a present origin.
          expect(httpAllowed).toBe(expected);
          expect(wsAllowed).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});

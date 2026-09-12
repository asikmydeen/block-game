import { describe, expect, it } from 'vitest';

// Minimal smoke test: proves the one-shot Vitest runner and strict test
// TypeScript pipeline are wired before any feature behavior exists. If a
// feature suite fails to import, this test still passes, isolating "runner
// broken" from "module missing".
describe('vitest one-shot runner', () => {
  it('executes deterministically', () => {
    expect(1 + 1).toBe(2);
  });
});

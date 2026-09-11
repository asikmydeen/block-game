import fc from 'fast-check';

// Every property test in this feature runs at least 100 generated cases and
// carries the standard label `Feature: capacitor-mobile-app, Property N: ...`.
fc.configureGlobal({ numRuns: 100 });

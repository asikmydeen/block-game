# Implementation Plan: Capacitor Mobile App

## Overview

Convert the existing Craftworld React/Vite/React Three Fiber client into one shared TypeScript codebase packaged by Capacitor 7.4.4 for iOS and Android, while preserving the Node ESM server, browser build, backend contract, and desktop presentation. Work proceeds in dependency order: establish exact dependency and test contracts, then implement endpoints/security, asynchronous auth, lifecycle persistence, multiplayer, bounded chunks, rendering/frame separation, touch parity, native packaging, and release validation.

## Mandatory Test-First Execution Contract

- Every behavior-changing slice has a mandatory `RED` task before its `GREEN` implementation task. The RED task must be run and must fail for the intended missing behavior before any production file named by that slice is edited.
- A GREEN task is complete only after its targeted test passes, affected suites pass, and `npm run typecheck` passes. At each checkpoint, run the full non-device test suite and `npm run build` in non-watch mode.
- If later validation exposes a defect, add and run the smallest failing regression test before changing production code; do not weaken, skip, or delete a failing test.
- Dependency manifests, generated Capacitor projects, native metadata, and generated assets use validator/smoke-test-first tasks. Their validators must fail before configuration or scaffolding is accepted.
- All new dependency versions must be exact in `package.json` and `package-lock.json`; no new caret, tilde, tag, or other open range is permitted.
- Worker meshing and greedy meshing remain outside this plan. The final profiling gate may only produce a machine-readable decision requiring a separately scoped evaluation.

## Tasks

- [ ] 1. Establish the verified dependency and testing foundation
  - [x] 1.1 Create and run a pre-install dependency-contract validator
    - Add `scripts/native/verify-dependency-contract.mjs` and Node built-in tests under `scripts/native/__tests__/` so verification can run before installing any test package.
    - Require `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, and `@capacitor/android` at exactly `7.4.4`, and `@aparajita/capacitor-secure-storage` at exactly `7.1.6`.
    - Query registry metadata before installation to select exact versions for `@capacitor/app`, `@capacitor/network`, `@capacitor/preferences`, `@capacitor/screen-orientation`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/assets`, Vitest, fast-check, jsdom, React Testing Library, user-event, and Playwright; reject any version whose peer/dependency contract is not aligned with Capacitor 7.4.4 or the repository's Node 20 floor.
    - Record source URLs, check date, secure-storage Capacitor compatibility evidence, and its latest qualifying upstream release or commit within the preceding 12 months in `validation/mobile/dependency-compatibility.json`; fail closed when evidence is absent or stale.
    - Run the validator against the current manifest and retain the expected RED result naming missing pins/evidence. Do not run `npm install` in this task.
    - **Completion:** the pre-install validator itself passes its fixture tests and fails against the unmodified dependency manifest for the expected reason.
    - _Requirements: 1.11, 3.14, 12.1, 12.8_

  - [x] 1.2 Pin and install the verified dependency set exactly
    - Update `package.json` and `package-lock.json` only after task 1.1 succeeds against registry/upstream metadata; use exact versions for every new runtime, native, asset, and test package.
    - Preserve the current dependency placement rule unless runtime loading requires otherwise, and keep signing material and service-role credentials out of both files.
    - Run the dependency-contract validator, `npm ci`, `npm run typecheck`, and `npm run build`; verify `dist/public` remains the web output and no new untyped `any` is introduced.
    - **Completion:** lockfile installation is reproducible, every new pin is exact, Capacitor packages are aligned to 7.4.4, secure storage is 7.1.6 with current compatibility/maintenance evidence, and baseline typecheck/build pass.
    - _Requirements: 1.5, 1.11, 3.14, 12.1_

  - [x] 1.3 Add deterministic unit, property, DOM, server, and browser test infrastructure
    - Add `vitest.config.ts`, shared setup/fixtures, jsdom and Node test projects as needed, `playwright.config.ts`, and non-watch package scripts for targeted, affected, property, server-integration, browser, and full test runs.
    - Add a minimal smoke test first, verify the test command cannot run before configuration, then configure the runners and make the smoke test pass without changing production behavior.
    - Configure fast-check for at least 100 generated cases per property and a standard property label format: `Feature: capacitor-mobile-app, Property N: <title>`.
    - Ensure test TypeScript is checked without relaxing the strict production compiler settings.
    - **Completion:** smoke tests run deterministically in one-shot mode, the full test command exits successfully, and typecheck/build still pass.
    - _Requirements: 1.11, 12.1, 12.7, 12.17_

- [x] 2. Implement authoritative endpoint resolution and strict server origin policy
  - [x] 2.1 RED: Specify endpoint, API-client, and native-build validation behavior
    - Add failing tests in `src/config/endpoints.test.ts`, `src/game/apiClient.test.ts`, and `scripts/native/__tests__/validate-endpoints.test.mjs` for separate REST/WS values, same-origin web fallback, `/api/mp`, target/mode overrides, malformed or partial pairs, credentials/fragments, production localhost/loopback, HTTP/WS rejection, and variable-naming diagnostics.
    - Add failing assertions that every REST URL and page-hide beacon is absolute through the resolved API base and every socket uses the resolved WebSocket URL.
    - Run only these tests and confirm they fail because the resolver/client/validator do not exist; do not edit endpoint production code yet.
    - **Completion:** failures identify missing endpoint behavior rather than test setup errors.
    - _Requirements: 2.1–2.9, 4.7, 5.1, 12.9_

  - [x] 2.2 GREEN: Implement endpoint configuration and route all client transport through it
    - Create `src/config/endpoints.ts`, `src/game/apiClient.ts`, and `scripts/native/validate-endpoints.mjs`; update `vite.config.ts`, `.env.example`, `src/game/account.ts`, and existing REST/WS creation sites to use injected `EndpointConfig`/`ApiClient`.
    - Preserve `npm run build` as same-origin web output in `dist/public`; make native production require immutable `VITE_API_BASE_URL` and `VITE_WEBSOCKET_URL` with HTTPS/WSS, while allowing explicit non-production HTTP/WS overrides.
    - Keep tokens out of URLs and logs, preserve server-supported final web beacon semantics, and make the build script the only production destination selector.
    - Run task 2.1 tests, affected account/multiplayer tests, typecheck, and web build.
    - **Completion:** targeted tests pass, no direct relative REST/socket construction remains, invalid native production inputs fail before Vite/Capacitor runs, and browser omission resolves against the current origin.
    - _Requirements: 2.1–2.9, 3.12–3.13, 4.7, 5.1, 12.9_

  - [x] 2.3 Write the property test for authoritative endpoint resolution
    - **Property 1: Endpoint resolution is secure, complete, and authoritative**
    - Generate target/mode/endpoint/origin/path combinations and verify either normalized complete output or a diagnostic naming the invalid variable.
    - **Validates: Requirements 2.1–2.6, 2.8–2.9**

  - [x] 2.4 RED: Specify exact HTTP and WebSocket origin decisions
    - Add failing Node integration tests under `server/` using an ephemeral HTTP server for allowlist parsing, exact approved-origin echo with `Vary: Origin`, JSON/authorization preflight, route-before-403 behavior, same-host/originless HTTP handling, and startup rejection of wildcard, `null`, malformed, path, query, or fragment entries.
    - Add failing `ws` upgrade tests for exact `/api/mp`, approved origins, denied/malformed/missing production origins, and an explicitly enabled non-production originless mode; assert no connection callback or API route executes after rejection.
    - Include existing REST payload and multiplayer join/message fixtures so the security change cannot alter the backend contract.
    - **Completion:** tests run and fail because `OriginPolicy` and `noServer` upgrade ownership are absent.
    - _Requirements: 2.10–2.15, 12.10–12.11_

  - [x] 2.5 GREEN: Enforce the shared origin policy before HTTP routes and WS connections
    - Add `server/origin-policy.mjs`; update `server/index.mjs` to parse `ORIGIN_ALLOWLIST` once, apply origin middleware before JSON/API routes, and own the HTTP `upgrade` event.
    - Update `server/mp.mjs` to use `WebSocketServer({ noServer: true })` and accept only a pre-approved upgrade while preserving join authentication, one-live-connection behavior, message shapes, and Supabase service-role isolation.
    - Log only normalized origin/reason categories, never tokens, join payloads, device IDs, or service credentials.
    - Run task 2.4 tests, the full server suite, and web build.
    - **Completion:** approved origins pass HTTP/WS tests, unapproved origins are rejected before application handlers, production cannot silently allow wildcard/originless access, and contract fixtures remain unchanged.
    - _Requirements: 2.10–2.15, 12.10–12.11_

  - [x] 2.6 Write the property test for exact origin membership
    - **Property 2: Origin approval is exact membership**
    - Generate finite allowlists and candidate origins, including substring/suffix/confusable/malformed values, and prove approval if and only if the normalized value is an exact member.
    - **Validates: Requirement 2.10**

  - [x] 2.7 Lock backend and endpoint compatibility with integration coverage
    - Extend server/client integration fixtures to cover all configured allowlist origins, denied origins, JSON and authorization preflight, unchanged `/api` request/response shapes, unchanged `/api/mp` messages, absolute beacon routing, and server-only Supabase credentials.
    - Run server integration, endpoint/API tests, typecheck, and web build; any discovered behavior fix must begin with a new failing regression test.
    - **Completion:** the shared web/native backend contract and origin behavior are executable as one repeatable test command.
    - _Requirements: 2.8–2.15, 4.7, 5.1, 12.9–12.11_

- [x] 3. Checkpoint — endpoint and server boundary
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement asynchronous authentication storage and bootstrap
  - [x] 4.1 RED: Specify auth adapters and serialized session transitions
    - Add failing tests for `AuthStorage`/`AuthSession`, the existing `blockgame.token` and `blockgame.deviceId` web keys, per-operation local-storage failures with current-page memory fallback, native secure-token versus Preferences device-ID routing, disabled cloud sync, serialized writes, hydration gating, 401 rejection ordering, logout token clearing with device-ID retention, and generic secret-free errors.
    - Assert REST and multiplayer consumers read the same hydrated in-memory token and no native code writes a token to Preferences, URLs, diagnostics, or logs.
    - **Completion:** tests fail only because the new storage/session contracts are not implemented.
    - _Requirements: 3.1–3.13, 5.1, 5.11, 12.8_

  - [x] 4.2 GREEN: Implement web/native auth storage and account-session ordering
    - Create `src/game/authStorage.ts`, `src/game/authStorage.web.ts`, and `src/game/authStorage.native.ts`; use secure storage only for native tokens and Preferences only for native device IDs.
    - Refactor `src/game/account.ts` around injected `ApiClient` and `AuthSession`: hydrate before resume, clear a rejected token before device resume, persist token/device ID before publishing authenticated state, and always clear only the token on best-effort logout.
    - Surface storage failure as recoverable signed-out state without insecure native fallback or secret disclosure.
    - Run task 4.1 tests, endpoint/account suites, typecheck, and build.
    - **Completion:** all storage/session tests pass and authenticated clients observe one persisted, hydrated in-memory token.
    - _Requirements: 3.1–3.13, 5.1, 5.11, 12.8_

  - [x] 4.3 Write the property test for auth transition ordering
    - **Property 3: Authentication transitions preserve hydration and persistence ordering**
    - Generate storage latencies/outcomes and hydrate/resume/login/reject/logout sequences; verify all ordering and shared-token invariants.
    - **Validates: Requirements 3.2, 3.7–3.10, 3.12**

  - [x] 4.4 Write the property test for web auth fallback compatibility
    - **Property 4: Web auth storage preserves compatibility or current-page state**
    - Generate token/device-ID values and independently throwing Storage operations; verify existing keys and memory read-after-write/clear semantics.
    - **Validates: Requirements 3.5–3.6**

  - [x] 4.5 RED: Specify asynchronous `AppServices` bootstrap and recoverable startup states
    - Add failing React tests around `src/main.tsx`/`src/App.tsx` with fake runtime, shell, storage, network, and API services.
    - Assert listeners attach early, shell preparation and auth hydration finish before resume/gameplay, render quality exists before Canvas creation, network absence is nonfatal, endpoint failure is fatal and named, shell failure gates input with Retry, and storage failure mounts signed-out Retry Storage UI without exposing values.
    - **Completion:** tests fail because `createAppServices`, provider wiring, and asynchronous mount ordering are missing.
    - _Requirements: 2.2–2.7, 3.2, 3.11–3.12, 6.2–6.3, 6.9, 9.2_

  - [x] 4.6 GREEN: Create and inject app services before React mounts
    - Add `src/platform/runtime.ts`, the `AppServices` contract/provider, web no-op shell/event interfaces, and asynchronous `createAppServices`; update `src/main.tsx` and `src/App.tsx` to render only after required preparation/hydration.
    - Keep platform APIs behind injectable TypeScript interfaces so unit tests do not require native runtimes; reserve plugin-backed shell/events for phase 13.
    - Wire Retry Storage and Retry Shell without bypassing endpoint failures or starting gameplay early.
    - Run task 4.5 tests, all auth/endpoint tests, typecheck, and build.
    - **Completion:** bootstrap ordering tests pass and web startup behavior remains functional with no forked gameplay implementation.
    - _Requirements: 1.1, 2.1–2.7, 3.2, 3.11–3.12, 6.2–6.3, 6.9, 9.2_

- [x] 5. Implement lifecycle-aware progress and foreground time
  - [x] 5.1 RED: Specify foreground clock, latest-only progress, and normalized transitions
    - Add failing fake-clock/state-machine tests in `src/game/lifecycle.test.ts` and `src/game/progressPersistence.test.ts` for two-second debounce, account-scoped newest revisions, canonical weapon comparison, duplicate lifecycle coalescing, offline/failure retention, out-of-order acknowledgements, auth-generation/account-switch isolation, cold-start owner lookup, foreground retry ordering, and token-free durable data.
    - Verify background capture starts durable write and, when online, save initiation before awaiting; add injectable timing assertions for the 250 ms completion/initiation budgets.
    - Verify foreground duration excludes all duplicate/long background intervals and no one-second React timer is needed.
    - **Completion:** tests fail for missing coordinator, pending store, and clock behavior.
    - _Requirements: 4.1–4.9, 4.11, 12.12–12.13_

  - [x] 5.2 GREEN: Implement lifecycle coordination, pending progress, and foreground clock
    - Create `src/platform/runtimeEvents.ts`, `src/game/lifecycle.ts`, and `src/game/progressPersistence.ts` with native/web adapter interfaces, fixed transition order, account-scoped versioned Preferences/web storage, newest-revision clearing, generation cancellation, and foreground-only elapsed time.
    - Keep the currently mounted game session alive in background; persist only account progress across termination, not world edits.
    - Expose timing/resource counters needed by development and device validation without logging tokens/device IDs.
    - Run task 5.1 tests, auth tests, typecheck, and build.
    - **Completion:** lifecycle state-machine tests pass, pending state converges safely, and foreground time excludes background duration.
    - _Requirements: 4.1–4.11, 12.12–12.13_

  - [x] 5.3 Write the property test for newest pending progress
    - **Property 5: Pending progress converges to the newest unacknowledged state**
    - Generate update timelines, duplicate lifecycle events, account switches, failures, delays, and acknowledgement reorderings.
    - **Validates: Requirements 4.1–4.2, 4.5–4.6, 4.9**

  - [x] 5.4 Write the property test for foreground-only playtime
    - **Property 6: Playtime equals accumulated foreground duration**
    - Generate monotonic visibility timelines with duplicates and verify base plus foreground intervals only.
    - **Validates: Requirement 4.8**

  - [x] 5.5 RED: Specify React/game lifecycle integration and page-hide behavior
    - Add failing integration tests proving progress changes feed the coordinator, web `pagehide` uses the configured absolute beacon, background order is clock → snapshot/save → multiplayer → touch reset → UI, foreground waits for auth/shell/layout before save retry/input/socket, and background does not unmount `Game` or lose score, health, inventory, mode, or in-session world edits.
    - Include process-relaunch fixtures that retry only the resumed account's durable snapshot.
    - **Completion:** tests fail at the missing App/Game integration points, not core state-machine setup.
    - _Requirements: 4.3–4.11, 7.8, 8.10, 12.12–12.13_

  - [x] 5.6 GREEN: Wire lifecycle/progress into App, Game, and account state
    - Update `src/App.tsx`, `src/pages/Game.tsx`, and account/progress call sites to publish discrete progress, keep the game mounted while suspended, use absolute page-hide beacon routing, and honor coordinator input/multiplayer ordering.
    - Ensure stale account generations cannot clear or publish current progress and dormant account slots are never sent under another token.
    - Run task 5.5 tests, all lifecycle/auth/endpoint tests, typecheck, and build.
    - **Completion:** integration tests pass with one pending snapshot per account, preserved in-session state, and correct resume/relaunch retry behavior.
    - _Requirements: 4.1–4.11, 7.8, 8.10, 12.12–12.13_

- [x] 6. Checkpoint — bootstrap, auth, and lifecycle
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Extract the multiplayer lifecycle/network state machine
  - [x] 7.1 RED: Specify transport ownership, state transitions, and protocol ordering
    - Add fake-socket/fake-clock tests in `src/game/multiplayerClient.test.ts` for all designed phases, one socket/publisher/reconnect timer, immediate background cancellation/close, no background retry, eligible foreground/network reconnect, 1/2/4/8/16/30-second backoff, generation-safe stale callbacks, join-before-publish, auth-terminal behavior, duplicate-session terminal behavior, and remote clearing before offline status.
    - Add equality assertions proving identical status/membership and transform-only roster updates do not notify React.
    - **Completion:** the tests fail because transport ownership still resides in `RemotePlayers.tsx`.
    - _Requirements: 5.1–5.12, 10.5, 12.12–12.13_

  - [x] 7.2 GREEN: Implement `MultiplayerClient` and equality-safe multiplayer stores
    - Create `src/game/multiplayerClient.ts`; refactor `src/game/multiplayer.ts` into frame-owned transform targets and equality-safe UI snapshots while preserving chat, emote, kill-feed, join, and server message shapes.
    - Integrate hydrated auth, endpoint config, lifecycle, and network inputs; invalidate stale generations, cancel before replacement, publish position only after `welcome`, clear auth and retries on `auth_error`, and expose bounded diagnostic counts.
    - Run task 7.1 tests, auth/lifecycle/server contract suites, typecheck, and build.
    - **Completion:** deterministic state-machine tests pass with at most one eligible transport/timer set.
    - _Requirements: 5.1–5.12, 10.5, 12.12–12.13_

  - [x] 7.3 Write the property test for one eligible multiplayer transport
    - **Property 7: Multiplayer lifecycle maintains one eligible transport**
    - Generate game/auth/visibility/network/socket event sequences and verify resource, suspension, reconnect, and backoff invariants.
    - **Validates: Requirements 5.1–5.8**

  - [x] 7.4 Write the property test for minimal ordered multiplayer UI transitions
    - **Property 8: Multiplayer protocol and UI transitions are ordered and minimal**
    - Generate close/reconnect/auth/roster streams and verify clear-before-offline, join-before-state, retry-free auth rejection, and equal-value suppression.
    - **Validates: Requirements 5.9–5.12, 10.5**

  - [x] 7.5 RED: Specify `RemotePlayers` as a render-only scene adapter
    - Add failing React/R3F tests proving `RemotePlayers.tsx` subscribes only to membership, interpolates groups from refs without React updates, clears scene membership on close, and creates no WebSocket or retry/publish timer.
    - Include integration assertions that lifecycle/network changes reach the injected client once and social UI still receives unchanged chat/emote/status contracts.
    - **Completion:** tests fail on the component's existing socket ownership.
    - _Requirements: 5.8–5.12, 10.1, 10.5_

  - [x] 7.6 GREEN: Rewire the scene and UI to the extracted client
    - Refactor `src/components/RemotePlayers.tsx`, `src/pages/Game.tsx`, and `src/components/SocialUI.tsx` to use `MultiplayerClient`/stores, leaving transform interpolation in frame-owned refs and discrete membership/status in React.
    - Run task 7.5 tests, all multiplayer/server suites, typecheck, and build.
    - **Completion:** no component owns transport resources, protocol behavior is unchanged, and transform-only traffic schedules no React membership update.
    - _Requirements: 5.1–5.12, 10.1, 10.5_

- [x] 8. Bound world chunks, preserve edits/seams, and dispose geometry
  - [x] 8.1 RED: Specify active/retention windows and notification stability
    - Add failing state-machine tests in `src/game/worldChunkManager.test.ts` for spawn, positive/negative coordinates, exact 7×7 active keys, at-most 9×9 retained chunks, same-chunk early return/no notification, transactional boundary recenter, seam-ring preparation, immediate out-of-window eviction, stable seed, and generation-failure rollback.
    - **Completion:** tests fail against the existing unbounded `useWorld` behavior.
    - _Requirements: 8.1–8.6, 8.11, 10.4, 11.5_

  - [x] 8.2 GREEN: Implement bounded `WorldChunkManager` and active-only rendering
    - Create `src/game/worldChunkManager.ts`; refactor `src/game/useWorld.ts` into a thin external-store facade and `src/components/World.tsx` to render active keys only.
    - Split evictable full chunks from session-owned overlays/revisions, generate active chunks plus seam neighbors before publishing one membership snapshot, and keep retained count at or below 81 without a postponable eviction debounce.
    - Run task 8.1 tests, affected world tests, typecheck, and build.
    - **Completion:** window/count/notification tests pass and frame-level same-chunk movement publishes nothing to React.
    - _Requirements: 8.1–8.6, 8.11, 10.4, 11.5_

  - [x] 8.3 Write the property test for bounded centered chunk windows
    - **Property 11: Chunk windows are centered, bounded, and notification-stable**
    - Generate spawn/movement paths including negative coordinates and continuous same-chunk movement.
    - **Validates: Requirements 8.1–8.6, 10.4**

  - [x] 8.4 RED: Specify edit-overlay regeneration and seam invalidation
    - Add failing tests for base → authored → player merge order, explicit-air edits, redundant edit removal, eviction/regeneration round trips, background/resume overlay retention, stable seed, cardinal/corner mesh-revision invalidation, and face-culling/AO seam equivalence.
    - **Completion:** tests fail because edits and generated chunk data are not independently retained and seam neighbors are not fully invalidated.
    - _Requirements: 8.8–8.12_

  - [x] 8.5 GREEN: Implement sparse edit overlays and seam-aware mesh revisions
    - Extend `src/game/worldChunkManager.ts` and world mutation call sites to keep authored and player overlays separate from full chunks, preserve explicit air, reapply edits before visibility, and invalidate every neighbor whose culling/AO can observe an edge/corner edit.
    - Preserve current negative-coordinate mapping and gameplay semantics.
    - Run task 8.4 tests, all chunk tests, typecheck, and build.
    - **Completion:** regeneration and seam-reference tests pass across eviction and lifecycle transitions.
    - _Requirements: 8.8–8.12_

  - [x] 8.6 Write the property test for edited chunk regeneration
    - **Property 12: Edited chunk regeneration is a stable round trip**
    - Generate seeds, coordinates, authored baselines, explicit-air/solid edits, eviction, and lifecycle events.
    - **Validates: Requirements 8.8–8.11**

  - [x] 8.7 Write the property test for seam mesh semantics
    - **Property 13: Seam edits preserve neighbor mesh semantics**
    - Generate edge/corner edits and compare invalidation plus regenerated culling/AO decisions with a non-evicted reference world.
    - **Validates: Requirement 8.12**

  - [x] 8.8 RED: Specify geometry replacement/unmount disposal deadlines
    - Add failing tests around a pure `buildChunkGeometry` boundary and instrumented opaque/transparent/water geometries, materials, and render targets.
    - Assert each replaced resource is disposed exactly once, active-chunk removal disposes before the second completed R3F frame, and manager/session teardown clears timers, listeners, retained maps, and overlays.
    - **Completion:** tests expose the current memoized geometry leak and missing owner cleanup.
    - _Requirements: 8.7, 11.3–11.6_

  - [x] 8.9 GREEN: Own and dispose chunk render resources explicitly
    - Extract `buildChunkGeometry` and update `src/components/ChunkMesh.tsx` to consume mesh revisions and dispose all owned geometry/material/render-target resources on replacement and unmount.
    - Complete `WorldChunkManager.dispose()` and `World.tsx` cleanup wiring without changing the synchronous meshing algorithm.
    - Run task 8.8 tests, all world/chunk suites, typecheck, and build.
    - **Completion:** disposal instrumentation meets the two-frame deadline and repeated traversal does not retain inactive GPU resources.
    - _Requirements: 8.7, 11.3–11.6, 13.1_

- [x] 9. Checkpoint — multiplayer and bounded world
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Add immutable rendering profiles and separate frame work from React
  - [x] 10.1 RED: Specify runtime quality selection and renderer/light budgets
    - Add failing tests in `src/game/renderQuality.test.ts` and Canvas/scene integration tests for pre-render native selection, mobile DPR/antialias/shadow/bloom/star/light limits, desktop preservation, immutable session profile, one shared decorative-light budget, nearest-candidate selection, and no gameplay-constant imports/mutations.
    - **Completion:** tests fail because renderer values are currently fixed and lamps create unbudgeted lights.
    - _Requirements: 9.1–9.11_

  - [x] 10.2 GREEN: Apply mobile/desktop quality profiles before Canvas creation
    - Create `src/game/renderQuality.ts`; update `src/pages/Game.tsx`, postprocessing/star setup, and `src/components/StreetLamps.tsx` to use the injected immutable profile.
    - Keep mobile meshes/glow visible while pooling at most eight nearest decorative lights; mutate light refs at coarse movement/chunk thresholds without frame-level React updates.
    - Preserve desktop antialiasing, PCF-soft shadows, bloom, 3,000 stars, all current decorative lights, ACES tone mapping, collision, reach, entities, weapons, and world state.
    - Run task 10.1 tests, scene tests, typecheck, and build.
    - **Completion:** profile/Canvas/light tests pass before any native WebGL context is constructed.
    - _Requirements: 9.1–9.11_

  - [x] 10.3 Write the property test for quality-profile limits
    - **Property 14: Runtime selection enforces quality-profile limits**
    - Generate runtime capability snapshots and verify every mobile/desktop profile bound and selection rule.
    - **Validates: Requirements 9.2–9.10**

  - [x] 10.4 Write the property test for simulation invariance
    - **Property 15: Visual quality is simulation-invariant**
    - Generate collision/interaction/entity/weapon/world scenarios and compare outcomes under mobile and desktop visual settings.
    - **Validates: Requirement 9.11**

  - [x] 10.5 RED: Specify bounded HUD sampling and frame/React separation
    - Add failing fake-scheduler tests for 200 ms sampling, display-precision equality suppression, suspend/resume/stop, and no more than five publications per second.
    - Add R3F/React instrumentation tests proving movement, camera, physics, car/animal animation, remote interpolation, and same-chunk movement mutate refs/Three.js only; discrete health/score/inventory/modal/status/membership changes must commit before the next displayed frame.
    - Add a Playwright React Profiler assertion for at most 10 root game commits per second during steady movement.
    - **Completion:** tests fail on `Player`'s per-frame position setter and any other identified frame-owned React path.
    - _Requirements: 10.1–10.7, 11.1–11.4_

  - [x] 10.6 GREEN: Replace per-frame React updates with refs and a HUD sampler
    - Create `src/game/hudSampler.ts`; update `src/components/Player.tsx`, `src/pages/Game.tsx`, remote interpolation, and affected frame loops to keep continuous state in refs/Three.js and publish rounded coordinates at five hertz or less.
    - Keep discrete UI-visible events immediate and suspend sampling while backgrounded.
    - Run task 10.5 tests, scene/lifecycle/multiplayer suites, profiler check, typecheck, and build.
    - **Completion:** frame-setter guards, next-frame discrete commits, equality suppression, and commit-rate limits all pass.
    - _Requirements: 10.1–10.7, 11.1–11.4_

  - [x] 10.7 Write the property test for HUD sampling bounds
    - **Property 16: HUD sampling is bounded and equality-aware**
    - Generate position traces and monotonic clocks; verify at most five rounded unequal publications in any one-second interval.
    - **Validates: Requirements 10.2–10.3**

- [x] 11. Implement safe-area layout and complete touch action parity
  - [x] 11.1 RED: Specify visual-viewport, safe-area, and layout input gating
    - Add failing DOM/Playwright tests for `viewport-fit=cover`, visual viewport dimensions/offsets, safe-area variables, both supported landscape minimums/orientations, two stable animation frames before input reopens, immediate typing neutralization, scrollable oversized modals, 48×48 primary targets, and 8 px target separation.
    - Verify web orientation remains browser-controlled and native touch mode requires no selector.
    - **Completion:** tests fail against fixed viewport dimensions/offsets and incomplete safe-area handling.
    - _Requirements: 6.4–6.6, 6.10, 7.1, 7.4–7.6, 7.9, 7.11–7.12, 12.15_

  - [x] 11.2 GREEN: Implement the visual-viewport shell and safe-area layout contract
    - Update `index.html` and `src/index.css`; add a `useVisualViewport` hook and refactor `src/App.tsx`, `src/components/GameUI.tsx`, `SocialUI.tsx`, `InteractionUI.tsx`, and modal/control containers to shared safe-area clusters and scroll bounds.
    - Close layout/typing gates, reset gameplay input, update viewport CSS variables, and reopen only after two stable frames; suppress selection, context menus, overscroll, and navigation gestures only in gameplay controls.
    - Run task 11.1 tests, affected UI tests, typecheck, and build.
    - **Completion:** automated layout assertions pass at every supported viewport/orientation and browser orientation behavior is unchanged.
    - _Requirements: 6.4–6.6, 6.10, 7.1, 7.4–7.6, 7.9, 7.11–7.12, 12.15_

  - [x] 11.3 RED: Specify multi-pointer ownership and terminal input reset
    - Add failing tests in `src/game/touchInput.test.ts` for independent move/look/action pointer IDs, capture/lost-capture, cancellation, blur, background, typing/layout gates, neutral next-frame reads, held/edge state, and complete `resetAll()` behavior.
    - Verify simultaneous movement, camera look, and one gameplay action without analog React state.
    - **Completion:** tests fail against the existing module-level touch store's missing ownership/gates/actions.
    - _Requirements: 7.2–7.3, 7.7–7.9_

  - [x] 11.4 GREEN: Implement the touch controller and core control clusters
    - Create `src/game/touchInput.ts`; refactor `src/components/TouchControls.tsx`, `Player.tsx`, and vehicle/animal consumers to use pointer capture, separate contacts, sprint, primary, place/use, and handbrake state through frame reads.
    - Keep only pressed visuals in local React state and connect lifecycle/layout/typing reset gates.
    - Run task 11.3 tests, lifecycle/UI suites, typecheck, and build.
    - **Completion:** all pointer terminal paths produce neutral frame input and concurrent controls remain independent.
    - _Requirements: 7.2–7.9_

  - [x] 11.5 Write the property test for terminal touch resets
    - **Property 9: Touch terminal events restore neutral input**
    - Generate pointer-owned control combinations and cancellation/background/typing/layout terminal events.
    - **Validates: Requirements 7.7–7.9**

  - [x] 11.6 RED: Specify held automatic-fire cadence and termination
    - Add failing fake-clock combat/input tests for rising-edge single shots, automatic cadence, cooldown eligibility, and immediate termination on release, cancel, background, typing, or gate closure.
    - Assert no touch-specific weapon rules diverge from keyboard/mouse gameplay commands.
    - **Completion:** tests fail because held primary fire and all terminal paths are not wired.
    - _Requirements: 7.13, 9.11_

  - [x] 11.7 GREEN: Wire shared primary intent and automatic-fire cadence
    - Update `src/game/combat.ts`, `src/components/Player.tsx`, `TouchControls.tsx`, and relevant weapon state so touch and desktop dispatch the same named primary command; consume sprint/handbrake in existing player/car logic.
    - Run task 11.6 tests, touch/combat/vehicle suites, typecheck, and build.
    - **Completion:** cadence and terminal tests pass without changing desktop input or weapon timing.
    - _Requirements: 7.13, 9.11_

  - [x] 11.8 Write the property test for held automatic fire
    - **Property 10: Held automatic fire obeys cadence and termination**
    - Generate weapon rates, cooldowns, hold durations, and terminal-event sequences.
    - **Validates: Requirement 7.13**

  - [x] 11.9 RED: Encode the complete touch action matrix as command-dispatch tests
    - Add table-driven React tests covering account login/switch; mode/start; move/look/jump/sprint; mine/melee/ranged/held fire; place/use; block and weapon choose/buy/equip; car enter/drive/handbrake/exit/repair; animal mount/dismount; camera; day/night; every menu/help/shop/death action; respawn; chat open/compose/send/cancel; player list; and every emote.
    - Require explicit touch close actions, 48 px semantics/test IDs, and restored gameplay input after chat cancel/send and viewport stabilization.
    - **Completion:** the matrix test runs and fails with an explicit list of missing/unreachable actions.
    - _Requirements: 7.1–7.13, 12.14–12.15_

  - [x] 11.10 GREEN: Complete responsive touch paths for every game command
    - Refactor `src/components/GameUI.tsx`, `SocialUI.tsx`, `InteractionUI.tsx`, `LoginScreen.tsx`, `TouchControls.tsx`, `src/pages/Game.tsx`, and relevant car/animal/combat command adapters so every matrix row dispatches the same command as desktop input.
    - Add explicit close/send/cancel/respawn/emote actions, safe-area hotbar/drawers, contextual vehicle/animal actions, and neutral input during software-keyboard use.
    - Run task 11.9 tests, all touch/layout/lifecycle/UI tests, Playwright responsive smoke, typecheck, and build.
    - **Completion:** the entire matrix is reachable by touch in automated tests with no hardware-key dependency and desktop bindings remain unchanged.
    - _Requirements: 7.1–7.13, 12.14–12.15_

- [x] 12. Checkpoint — rendering and complete touch UI
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Add deterministic Capacitor projects, plugins, shell behavior, and assets
  - [x] 13.1 RED: Create native project/configuration smoke validators before scaffolding
    - Add Node tests and `scripts/native/validate-projects.mjs` that require `capacitor.config.ts`, bundled `dist/public`, fixed app ID/name, expected schemes/hostname, no production `server.url`, checked-in `ios/App` and `android`, iOS 17, Android min SDK 31, both landscape orientations, Android `adjustResize`, configured plugin metadata, privacy metadata, required icon/splash outputs, deterministic commands, and signing placeholders without secrets.
    - Run the validator before generating projects and retain the expected failure list.
    - **Completion:** validator fixture tests pass and repository validation fails because native config/projects/assets are not yet present.
    - _Requirements: 1.1–1.10, 6.1–6.3, 6.7–6.9, 12.2–12.4_

  - [x] 13.2 Add Capacitor config, checked-in platform scaffolding, and command wrappers
    - Create `capacitor.config.ts` with app ID `com.asikmydeen.craftworld`, app name `Craftworld`, `webDir: 'dist/public'`, `localhost` schemes, and manual splash hide; never set a production remote `server.url`.
    - Add argument-array Node ESM wrappers under `scripts/native/` and exact package scripts for `build:native`, all-platform/platform-specific sync, iOS release build, Android release bundle, validation, and idempotence.
    - Generate `ios/App` and `android` from the pinned Capacitor 7.4.4 CLI only after `build:native`; check in generated projects without signing credentials.
    - Run the config/project portion of task 13.1 validator, targeted script tests, typecheck, and web/native web builds.
    - **Completion:** shared built assets sync into both checked-in platforms and commands require no hand-editing of generated configuration.
    - _Requirements: 1.1–1.9, 2.2–2.7, 6.9_

  - [x] 13.3 Configure OS floors, orientation, native plugins, privacy metadata, and assets
    - Set iOS deployment target 17.0 and landscape-left/right only; set Android min SDK 31, both landscape rotations, and `adjustResize`, retaining selected Capacitor template compile/target SDK values.
    - Configure App, Network, Preferences, secure storage with cloud sync disabled, Screen Orientation, Status Bar, and Splash Screen plugins; add required privacy manifests/labels/version placeholders.
    - Add `resources/icon.png`, adaptive foreground/background, and branded landscape splash masters; generate and check in all iOS asset catalogs and Android mipmap/drawable outputs with the pinned assets tool.
    - Run task 13.1 validator plus native platform lint/metadata/build smoke available on the host.
    - **Completion:** all metadata/assets/plugin checks pass, no default icon/splash remains, and no secret or machine-local signing path is tracked.
    - _Requirements: 1.2–1.4, 6.1–6.3, 6.7–6.9, 12.2–12.4, 12.8_

  - [x] 13.4 RED: Specify native shell and plugin-backed runtime-event sequencing
    - Add failing tests for `NativeShell.prepare()` landscape lock/status hide before input, resume re-prepare, recoverable failure/retry, exactly-once splash dismissal after React readiness plus a settled viewport frame, web no-ops, native App event deduplication, Network changes, and early listener attachment.
    - **Completion:** tests fail because phase 4 contains only injectable interfaces/web no-ops.
    - _Requirements: 6.1–6.3, 6.9–6.10, 4.3–4.6, 5.2–5.7_

  - [x] 13.5 GREEN: Implement plugin-backed shell and runtime event adapters
    - Implement `src/platform/nativeShell.ts` and native branches in `src/platform/runtimeEvents.ts`; update root-shell readiness signaling in `src/App.tsx` and bootstrap wiring in `src/main.tsx`.
    - Gate gameplay input until orientation/status/layout preparation succeeds, retry on resume, hide splash exactly once after readiness, and preserve browser-controlled orientation/no-op behavior.
    - Run task 13.4 tests, bootstrap/lifecycle/layout suites, typecheck, web build, and platform sync.
    - **Completion:** shell sequencing tests pass and native plugin calls never execute in the web runtime.
    - _Requirements: 6.1–6.3, 6.9–6.10, 4.3–4.6, 5.2–5.7_

  - [x] 13.6 Prove sync/build scripts are deterministic and clean
    - Complete `scripts/native/verify-idempotent.mjs` and tests, run native endpoint validation, build before each sync, synchronize each platform independently and together, then run all-platform sync twice from unchanged inputs.
    - Fail if the second run changes tracked source/configuration, if a platform-specific command touches the other project, or if generated output embeds insecure/localhost production endpoints.
    - Run typecheck, full automated tests, web build, native project validator, and idempotence check.
    - **Completion:** the command set is repeatable, platform-specific, and leaves a clean tracked tree after the second unchanged run.
    - _Requirements: 1.5–1.10, 2.4, 12.1–12.4, 12.9_

- [ ] 14. Build release validation, device evidence, and the profiling gate
  - [x] 14.1 RED: Specify release evidence schemas and all-or-nothing acceptance
    - Add failing tests for `validation/mobile` manifest/device/touch/lifecycle-network/performance schemas and a release gate that requires every criterion 12.1–12.16, reports every failed criterion ID, validates build/lock hashes and artifact checksums, and rejects missing/stale/mismatched evidence.
    - Require manifest fields for exact Capacitor/secure-storage pins, compatibility source/check date, qualifying upstream activity, endpoint hosts only, native versions, test commands, devices/OS, automation identity, and artifact links/checksums without secrets.
    - **Completion:** tests fail because evidence writers/validators and aggregate gate do not exist.
    - _Requirements: 11.7, 12.1–12.17_

  - [x] 14.2 GREEN: Implement machine-readable release evidence and acceptance scripts
    - Add schemas/templates and Node ESM writers/validators under `validation/mobile/` and `scripts/native/`; key each candidate directory by immutable build ID and emit deterministic criterion results.
    - Add package scripts that aggregate command, build, browser, server, native, touch, lifecycle, network, and performance evidence without accepting partial success.
    - Run task 14.1 tests and fixture-based acceptance/rejection cases.
    - **Completion:** complete fixtures are accepted only when every required criterion passes; rejected fixtures enumerate all failed/missing criterion IDs.
    - _Requirements: 11.7, 12.1–12.17_

  - [x] 14.3 Write the property test for release acceptance
    - **Property 17: Release acceptance is all-or-nothing and diagnostic**
    - Generate required criterion-result sets and verify exact acceptance plus complete failed-ID reporting.
    - **Validates: Requirement 12.17**

  - [x] 14.4 RED: Specify the evidence-based advanced-meshing decision
    - Add failing tests for prerequisite requirements 8–10, per-device 45 FPS outcomes, profiling-required decisions, ranked contributors, the top-three and at-least-20-percent threshold, largest-contributor fallback, and mandatory deferral when thresholds are not met.
    - Assert the gate can output only `deferred`, `profile-required`, `separate-meshing-evaluation-authorized`, or `optimize-largest-contributor`; it must never invoke or add worker/greedy implementation.
    - **Completion:** tests fail because no profiling decision module exists.
    - _Requirements: 13.1–13.5_

  - [x] 14.5 GREEN: Implement the profiling gate as a decision-only validator
    - Add a pure decision module and evidence schema under `validation/mobile/`/`scripts/native/` that consumes requirement status, FPS, and measured main-thread rankings.
    - Emit a machine-readable separate-scope requirement only when chunk generation or mesh construction is both top-three and at least 20%; otherwise keep meshing deferred and identify the largest measured contributor.
    - Run task 14.4 tests and release-gate fixture tests.
    - **Completion:** profiling decisions are deterministic and this code path cannot introduce Worker or greedy meshing production code.
    - _Requirements: 13.1–13.5_

  - [x] 14.6 Write the property test for profiling authorization
    - **Property 18: Advanced meshing authorization follows measured evidence**
    - Generate prerequisite/FPS/ranked-contributor inputs and verify profiling and separate-scope decisions exactly follow the thresholds.
    - **Validates: Requirements 13.2–13.5**

  - [x] 14.7 Add and pass the complete browser regression and commit-rate suite
    - Build Playwright fixtures/specs under `tests/e2e/` for account resume/switch, free play, multiplayer, movement, block editing, combat, cars, animals, shop, chat, emotes, progress save, leaderboard, return to menu, same-origin endpoint fallback, desktop quality, responsive touch smoke, and steady-movement root commit rate.
    - Run the suite against the production web build and ephemeral test backend. Any regression correction must first add/run a focused failing test before production changes, then rerun targeted and full suites.
    - **Completion:** Core Web Regression passes, desktop presentation/controls remain intact, and root game commits remain at or below 10 per second during steady movement.
    - _Requirements: 1.1, 2.6, 9.9–9.11, 10.6–10.7, 12.7_

  - [x] 14.8 Run complete server and transport integration acceptance
    - Execute approved/denied HTTP and WS tests for every configured origin, preflight headers/methods, exact native scheme origins, endpoint production inspection, unchanged REST/WS fixtures, reconnect/auth behavior, and service-role isolation.
    - Use release-mode iOS/Android origin characterization input when available; a missing/different native Origin must fail rather than broaden the server policy.
    - **Completion:** server integration evidence records successful exact allowlist access and rejection of every unapproved/malformed case with unchanged contracts.
    - _Requirements: 2.10–2.15, 5.1–5.12, 12.9–12.11_

  - [~] 14.9 Validate a clean checkout, clean sync, and both native release artifacts
    - In an isolated clean workspace, run `npm ci`, dependency verification, typecheck, full automated tests, production web/native endpoint validation, web build, all-platform sync, second-sync idempotence, native project validators, iOS Release archive/export, and Android release bundle.
    - Verify iOS 17/Android API 31 floors, orientations, assets, plugin registration, bundled web files, no remote `server.url`, no insecure/localhost production endpoints, artifact checksums, and no tracked changes after repeated generation.
    - Use environment-provided signing only; never persist signing secrets or machine-local paths.
    - **Completion:** `dist/public`, IPA, and AAB are reproducible from the clean lockfile/project state and their results/checksums are written to the build-ID evidence directory.
    - _Requirements: 1.2–1.11, 2.2–2.7, 6.1–6.9, 12.1–12.4, 12.9_

  - [~] 14.10 Add native-device automation and instrumentation harnesses
    - Add platform-native UI/integration test targets (for example, `ios/App/AppUITests/*` and `android/app/src/androidTest/*`) plus shared `validation/mobile` runners for launch/relaunch, accessibility-labeled touch commands, lifecycle/network control, storage backend probes, WebSocket Origin capture, progress-write timing, resource counters, chunk counts, FPS, resident-memory references, screenshots/recordings, and OS logs.
    - Expose development/test-only app counters for pending revision, sockets/timers, active/retained chunks, touch bounds, and root commits; keep credentials, payloads, device IDs, and tokens out of artifacts.
    - Compile the harnesses and validate emitted fixture reports against task 14.2 schemas before physical-device runs.
    - **Completion:** both platform harnesses compile, can drive every required action without hardware keyboard/mouse, and emit schema-valid secret-free evidence.
    - _Requirements: 3.13, 4.3–4.11, 5.2–5.12, 7.1–7.13, 8.1–8.10, 10.6, 11.5–11.7, 12.5–12.16_

  - [~] 14.11 Execute and retain the automated iOS device acceptance suite
    - Install the release artifact on an iPhone 13-class physical device running iOS 17+ and automate launch, account login/resume/switch, free play, multiplayer, background/resume, termination/relaunch, secure-token Keychain and Preferences device-ID routing, and actual `capacitor://localhost` WS Origin characterization.
    - Complete five 30-second background cycles and two 30-second network interruptions with no duplicate save/socket, lost progress/edit, or failed REST/WS recovery; verify durable write completion and online save initiation within 250 ms.
    - Complete every touch-matrix action and target-bound check in both landscape rotations, then the exact 10-minute representative session with per-minute chunk counts, average FPS, minute-2/minute-10 resident memory, crash/not-responding/memory-pressure results, and artifact links.
    - **Completion:** schema-valid iOS evidence proves all iOS clauses, average FPS ≥45, memory growth ≤20%, active ≤49, retained ≤81, and zero fatal events; otherwise mark the candidate failed with criterion IDs.
    - _Requirements: 3.3–3.4, 4.3–4.11, 5.2–5.12, 6.1–6.9, 7.1–7.13, 8.1–8.10, 11.1, 11.3, 11.5–11.7, 12.5, 12.8, 12.12–12.16_

  - [~] 14.12 Execute and retain the automated Android device acceptance suite
    - Install the release artifact on a Pixel 7-class physical device running Android 12+ and automate the same launch/auth/game/multiplayer/lifecycle/relaunch flow, secure-token Keystore-backed storage and Preferences device-ID routing, and actual `https://localhost` WS Origin characterization.
    - Complete five 30-second background cycles, two 30-second network interruptions, 250 ms durable/save-initiation timing, the full touch matrix and bounds in both landscape rotations, and the exact 10-minute representative session.
    - Record per-minute chunk counts, average FPS, authoritative minute-2/minute-10 resident memory, fatal events, checksums, and linked artifacts.
    - **Completion:** schema-valid Android evidence proves all Android clauses, average FPS ≥45, memory growth ≤20%, active ≤49, retained ≤81, and zero fatal events; otherwise mark the candidate failed with criterion IDs.
    - _Requirements: 3.3–3.4, 4.3–4.11, 5.2–5.12, 6.1–6.9, 7.1–7.13, 8.1–8.10, 11.2, 11.4–11.7, 12.6, 12.8, 12.12–12.16_

  - [~] 14.13 Aggregate release evidence and apply the profiling gate without expanding scope
    - Run the all-or-nothing release validator across dependency, typecheck/test/build, browser, server, sync, artifact, iOS, Android, touch, lifecycle/network, and performance evidence; emit every failed criterion and do not accept a partial candidate.
    - If both target devices meet 45 FPS, record worker/greedy meshing as deferred. If either misses only after requirements 8–10 pass, collect a representative-session main-thread CPU profile, rank contributors, and feed measured percentages to the profiling gate.
    - If chunk generation/mesh construction is top-three and ≥20%, emit only `separate-meshing-evaluation-authorized`; otherwise keep meshing deferred and identify the largest contributor. Do not implement either meshing technique in this feature.
    - **Completion:** the build-ID evidence directory is complete and internally consistent, release acceptance is diagnostic and all-or-nothing, and any advanced-meshing work is explicitly deferred or separately scoped by objective evidence.
    - _Requirements: 11.1–11.7, 12.1–12.17, 13.1–13.5_

- [~] 15. Final checkpoint — verify release readiness
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for a faster implementation pass. They do not make the mandatory RED tests, targeted/broader validation, or release criteria optional.
- Mandatory RED tasks must be completed before their paired GREEN tasks. Never implement a behavior first and backfill its test.
- Native/device tasks are automated test or validator work, not user-acceptance or manual-feedback tasks. A configured Apple/Android toolchain and the named physical target devices are required for completion.
- Keep generated native projects/assets checked in, but keep generated release evidence outside normal source commits unless the release process intentionally retains it.
- All requirement references are clause-level for traceability; `requirements.md` and `design.md` remain the source of truth during implementation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2"] },
    { "id": 5, "tasks": ["2.3"] },
    { "id": 6, "tasks": ["2.4"] },
    { "id": 7, "tasks": ["2.5"] },
    { "id": 8, "tasks": ["2.6"] },
    { "id": 9, "tasks": ["2.7"] },
    { "id": 10, "tasks": ["4.1"] },
    { "id": 11, "tasks": ["4.2"] },
    { "id": 12, "tasks": ["4.3"] },
    { "id": 13, "tasks": ["4.4"] },
    { "id": 14, "tasks": ["4.5"] },
    { "id": 15, "tasks": ["4.6"] },
    { "id": 16, "tasks": ["5.1"] },
    { "id": 17, "tasks": ["5.2"] },
    { "id": 18, "tasks": ["5.3"] },
    { "id": 19, "tasks": ["5.4"] },
    { "id": 20, "tasks": ["5.5"] },
    { "id": 21, "tasks": ["5.6"] },
    { "id": 22, "tasks": ["7.1"] },
    { "id": 23, "tasks": ["7.2"] },
    { "id": 24, "tasks": ["7.3"] },
    { "id": 25, "tasks": ["7.4"] },
    { "id": 26, "tasks": ["7.5"] },
    { "id": 27, "tasks": ["7.6"] },
    { "id": 28, "tasks": ["8.1"] },
    { "id": 29, "tasks": ["8.2"] },
    { "id": 30, "tasks": ["8.3"] },
    { "id": 31, "tasks": ["8.4"] },
    { "id": 32, "tasks": ["8.5"] },
    { "id": 33, "tasks": ["8.6"] },
    { "id": 34, "tasks": ["8.7"] },
    { "id": 35, "tasks": ["8.8"] },
    { "id": 36, "tasks": ["8.9"] },
    { "id": 37, "tasks": ["10.1"] },
    { "id": 38, "tasks": ["10.2"] },
    { "id": 39, "tasks": ["10.3"] },
    { "id": 40, "tasks": ["10.4"] },
    { "id": 41, "tasks": ["10.5"] },
    { "id": 42, "tasks": ["10.6"] },
    { "id": 43, "tasks": ["10.7"] },
    { "id": 44, "tasks": ["11.1"] },
    { "id": 45, "tasks": ["11.2"] },
    { "id": 46, "tasks": ["11.3"] },
    { "id": 47, "tasks": ["11.4"] },
    { "id": 48, "tasks": ["11.5"] },
    { "id": 49, "tasks": ["11.6"] },
    { "id": 50, "tasks": ["11.7"] },
    { "id": 51, "tasks": ["11.8"] },
    { "id": 52, "tasks": ["11.9"] },
    { "id": 53, "tasks": ["11.10"] },
    { "id": 54, "tasks": ["13.1"] },
    { "id": 55, "tasks": ["13.2"] },
    { "id": 56, "tasks": ["13.3"] },
    { "id": 57, "tasks": ["13.4"] },
    { "id": 58, "tasks": ["13.5"] },
    { "id": 59, "tasks": ["13.6"] },
    { "id": 60, "tasks": ["14.1"] },
    { "id": 61, "tasks": ["14.2"] },
    { "id": 62, "tasks": ["14.3"] },
    { "id": 63, "tasks": ["14.4"] },
    { "id": 64, "tasks": ["14.5"] },
    { "id": 65, "tasks": ["14.6"] },
    { "id": 66, "tasks": ["14.7"] },
    { "id": 67, "tasks": ["14.8"] },
    { "id": 68, "tasks": ["14.9"] },
    { "id": 69, "tasks": ["14.10"] },
    { "id": 70, "tasks": ["14.11"] },
    { "id": 71, "tasks": ["14.12"] },
    { "id": 72, "tasks": ["14.13"] }
  ]
}
```

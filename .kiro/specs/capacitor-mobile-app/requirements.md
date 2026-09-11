# Requirements Document

## Introduction

This document defines the requirements for delivering the existing Craftworld React/Vite/React Three Fiber game as installable iOS and Android applications with Capacitor. The conversion preserves the browser client, the Node/Express/WebSocket service, and the Supabase persistence layer while adding native packaging, secure credential storage, mobile lifecycle handling, landscape touch ergonomics, bounded world rendering, and measurable mobile performance.

## Glossary

- **Craftworld**: The existing block game implemented with React, Vite, React Three Fiber, Three.js, Node, Express, WebSocket, and Supabase.
- **Capacitor**: The native application runtime that embeds compiled web assets in iOS and Android projects and exposes native capabilities through plugins.
- **Capacitor_Mobile_App**: The installable iOS and Android form of Craftworld produced from the shared React/Vite client.
- **Native_Project**: The checked-in Capacitor iOS and Android project files, native configuration, and platform metadata.
- **Native_Shell**: The iOS or Android container that hosts the compiled Craftworld client and controls native orientation, splash, status bar, and lifecycle integration.
- **Native_Runtime**: A Craftworld execution environment detected through Capacitor as iOS or Android.
- **Supported_Platform**: iOS 17.0 or later and Android 12 or later, with Android API level 31 as the minimum SDK level.
- **Web_Client**: The existing browser-delivered Craftworld client built by Vite and served by the Node service.
- **Web_Build**: A Vite build that produces the existing browser deployment in `dist/public`.
- **Native_Build**: A build that packages the compiled web assets into an iOS or Android application.
- **Production_Build**: A release-mode Web_Build or Native_Build configured to communicate with production services.
- **Non_Production_Build**: A development or staging build configured through Vite mode files, environment variables, or local Capacitor overrides.
- **Build_Pipeline**: The package scripts and configuration that build web assets, synchronize Capacitor platforms, and invoke native builds.
- **Build_Command_Set**: The documented package commands for web build, all-platform synchronization, platform-specific synchronization, and platform-specific native build preparation.
- **Mobile_Client_Code**: Hand-authored client and Capacitor configuration code governed by the repository TypeScript compiler settings and naming conventions.
- **Native_Release_Artifact**: A release-mode iOS or Android package that can be signed, installed, launched, and submitted through the corresponding platform toolchain.
- **Apple_Toolchain**: A documented Xcode and code-signing environment capable of compiling and packaging the Native_Project for iOS.
- **Android_Toolchain**: A documented Java, Android SDK, Gradle, and signing environment capable of compiling and packaging the Native_Project for Android.
- **Endpoint_Configuration**: The typed build-time configuration that provides separate REST API and multiplayer WebSocket destinations.
- **API_Base_URL**: The absolute or same-origin base location used by every REST API request, including progress saves and lifecycle flushes.
- **WebSocket_URL**: The complete location used for the multiplayer connection, including the `/api/mp` path.
- **Secure_Transport**: HTTPS for REST API traffic and WSS for multiplayer WebSocket traffic.
- **Native_WebView_Origin**: The origin emitted by an iOS or Android Capacitor WebView, including the configured iOS scheme origin and Android local origin.
- **Origin_Allowlist**: A server-side, environment-configured set of approved browser and Native_WebView_Origin values used for HTTP CORS and WebSocket origin validation.
- **CORS**: Cross-Origin Resource Sharing behavior that permits an approved WebView origin to call the Backend_Service with JSON and authorization headers.
- **Backend_Service**: The existing Node, Express, `ws`, and Supabase service that owns authentication, progress, leaderboard, presence, chat, and multiplayer state.
- **Backend_Contract**: The existing `/api` REST routes, `/api/mp` WebSocket protocol, request fields, response fields, and authorization semantics documented by the repository.
- **Session_Token**: The opaque authentication credential issued by the Backend_Service and sent as a bearer credential or multiplayer join credential.
- **Device_ID**: The non-secret random identifier used by the Backend_Service to resume the account associated with one installation or browser profile.
- **Auth_Storage**: The asynchronous, platform-neutral interface for reading, writing, and clearing Session_Token and Device_ID values.
- **Secure_Storage_Plugin**: A supported Capacitor plugin that stores Session_Token values in iOS Keychain and Android Keystore-backed storage.
- **Device_Identifier_Store**: Capacitor Preferences storage used for Device_ID values in a Native_Runtime.
- **Web_Storage_Adapter**: The browser Auth_Storage implementation that preserves the `blockgame.token` and `blockgame.deviceId` local-storage keys and an in-memory fallback.
- **Progress_State**: Score, zombie kills, death count, owned weapons, and foreground play time associated with the signed-in account.
- **Pending_Progress_Snapshot**: The newest Progress_State value that has not received a successful response from the Backend_Service.
- **Lifecycle_Coordinator**: The client subsystem that handles foreground, inactive, background, resume, page-hide, and network-state transitions.
- **Foreground_State**: A lifecycle state in which Craftworld is visible and eligible to run gameplay, rendering, timers, and multiplayer traffic.
- **Background_State**: A lifecycle state in which Craftworld is hidden, inactive, paused, or suspended by iOS or Android.
- **Network_Availability**: The native or browser indication that the client has a usable network path.
- **Multiplayer_Client**: The client subsystem that owns the `/api/mp` WebSocket, join authentication, position publishing, remote-player state, chat, events, and reconnection.
- **Reconnect_Backoff**: A retry schedule that starts at one second, doubles after each failed attempt, and is capped at 30 seconds.
- **Safe_Area**: The visible screen region that excludes notches, rounded corners, camera cutouts, system gesture regions, and home indicators.
- **Mobile_UI**: The landscape application shell, menus, HUD, overlays, and touch controls shown by the Capacitor_Mobile_App.
- **Supported_Landscape_Viewport**: A landscape viewport at least 844 by 390 CSS pixels on iOS or 800 by 360 CSS pixels on Android, after browser chrome is excluded.
- **Touch_Target**: An interactive Mobile_UI region with a minimum rendered size of 48 by 48 CSS pixels.
- **Touch_Action_Matrix**: The required touch-accessible actions: account login and switching; mode selection; play start; move; look; jump; sprint; break or mine; melee attack; ranged attack; held automatic fire; place or use a block; choose a block; choose, buy, or equip a weapon; enter, drive, handbrake, exit, or repair a car; mount or dismount an animal; change camera; change day or night; open or close menu, help, shop, and death screens; respawn; open or close chat; compose, send, or cancel chat; open or close the player list; and trigger each emote.
- **Chunk**: A 16 by 16 horizontal section of the generated voxel world and the blocks, meshes, and edits associated with that section.
- **Active_Chunk_Window**: The 7 by 7 set of 49 Chunks centered on the player Chunk that can have visible meshes.
- **Retention_Window**: The 9 by 9 set of at most 81 full generated Chunks centered on the player Chunk and retained to support transitions and seam lookups.
- **Edited_Chunk_State**: Sparse block differences from generated terrain that preserve player changes independently from evictable full Chunk data.
- **World_Chunk_Manager**: The subsystem that generates, activates, renders, evicts, regenerates, and reapplies edits to Chunks.
- **Render_Resource**: A Three.js geometry, material, texture, render target, light, or related GPU allocation owned by an active scene object.
- **Rendering_Quality_Manager**: The typed configuration and runtime selection logic for native mobile and desktop web rendering settings.
- **Mobile_Quality_Profile**: The rendering settings selected for a Native_Runtime to control device-pixel ratio, antialiasing, shadows, bloom, stars, and decorative lights.
- **Desktop_Quality_Profile**: The rendering settings selected for a desktop Web_Client and preserving the existing antialiasing, soft shadows, bloom, 3,000 stars, and desktop light presentation.
- **DPR**: The device-pixel ratio used to size the WebGL drawing buffer relative to CSS pixels.
- **Animation_Loop**: The React Three Fiber frame callback path used for movement, physics, camera, animation, and Three.js object mutation.
- **React_State_Update**: A state mutation that schedules a React render or commit.
- **HUD_Sampler**: The mechanism that copies frame-owned values, such as coordinates, into React-visible HUD state at a bounded frequency.
- **Representative_Session**: A 10-minute release-build test beginning when gameplay becomes interactive and containing at least 10 Chunk-boundary crossings, 20 block edits, 10 combat interactions, one car drive, one animal ride, one day/night transition, one shop interaction, and five minutes of multiplayer with a second connected client, chat, and emotes.
- **Target_iOS_Device**: An iPhone 13-class physical device running iOS 17 or later.
- **Target_Android_Device**: A Pixel 7-class physical device running Android 12 or later.
- **Performance_Validator**: The release validation process that records frame rate, memory, Chunk counts, lifecycle results, and failures on target devices.
- **Memory_Stability**: A condition in which resident application memory at minute 10 is no more than 20 percent above the post-warm-up value measured at minute 2 and the operating system reports no memory-pressure termination.
- **Core_Web_Regression**: A browser test covering account resume and switching, free play, multiplayer, movement, block editing, combat, cars, animals, shop, chat, emotes, progress save, leaderboard, and return to menu.
- **Validation_Suite**: The automated and device-based checks required before a mobile release candidate is accepted.
- **Profiling_Gate**: The evidence-based decision process that controls whether advanced meshing work enters scope.
- **Worker_Meshing**: Moving Chunk generation or mesh construction from the browser main thread to a Web Worker.
- **Greedy_Meshing**: Combining adjacent voxel faces into larger mesh faces to reduce geometry count.

## Requirements

### Requirement 1: Capacitor platforms and repeatable builds

**User Story:** As a maintainer, I want one shared client and repeatable web and native build commands, so that iOS, Android, and browser releases remain reproducible.

#### Acceptance Criteria

1. THE Capacitor_Mobile_App SHALL package the compiled Web_Client without a forked gameplay implementation.
2. THE Native_Project SHALL include checked-in iOS and Android Capacitor platform projects.
3. THE Native_Project SHALL set the minimum iOS deployment target to version 17.0.
4. THE Native_Project SHALL set the minimum Android SDK level to API level 31.
5. WHEN a maintainer executes the existing web build command, THE Build_Pipeline SHALL produce the Web_Build in `dist/public`.
6. WHEN a maintainer executes the documented all-platform synchronization command, THE Build_Pipeline SHALL build the Web_Client before synchronizing both Native_Project platforms.
7. WHEN a maintainer executes a documented platform-specific synchronization command, THE Build_Pipeline SHALL synchronize only the selected Native_Project platform.
8. WHEN a maintainer executes the documented iOS build command in a configured Apple_Toolchain, THE Build_Pipeline SHALL produce an iOS Native_Release_Artifact without hand-editing generated configuration.
9. WHEN a maintainer executes the documented Android build command in a configured Android_Toolchain, THE Build_Pipeline SHALL produce an Android Native_Release_Artifact without hand-editing generated configuration.
10. WHEN the Build_Command_Set runs twice with unchanged inputs, THE Build_Pipeline SHALL leave tracked source and configuration files unchanged after the second run.
11. THE Mobile_Client_Code SHALL pass the repository TypeScript type check without introducing an untyped `any` value.

### Requirement 2: Endpoint configuration, secure transport, and backend compatibility

**User Story:** As a release engineer, I want immutable build-time service endpoints and explicit server origin controls, so that each app variant reaches the intended backend securely.

#### Acceptance Criteria

1. THE Endpoint_Configuration SHALL provide API_Base_URL and WebSocket_URL as separate typed build-time values.
2. WHERE a Production_Build is created, THE Endpoint_Configuration SHALL require API_Base_URL to use HTTPS.
3. WHERE a Production_Build is created, THE Endpoint_Configuration SHALL require WebSocket_URL to use WSS.
4. IF a Production_Build contains a missing, malformed, localhost, or insecure endpoint, THEN THE Build_Pipeline SHALL fail with a message naming the invalid endpoint variable.
5. WHERE a Non_Production_Build is created, THE Endpoint_Configuration SHALL accept Vite mode or Capacitor-local endpoint overrides.
6. WHERE a Web_Build omits endpoint overrides, THE Endpoint_Configuration SHALL resolve REST requests and multiplayer connections against the current browser origin.
7. THE Build_Pipeline SHALL be the sole mechanism for choosing a Production_Build backend destination.
8. THE Endpoint_Configuration SHALL route every REST request through API_Base_URL.
9. THE Endpoint_Configuration SHALL route every multiplayer connection through WebSocket_URL.
10. THE Origin_Allowlist SHALL use explicit configured origins instead of a wildcard origin.
11. WHEN an approved Native_WebView_Origin sends an HTTP preflight request, THE Backend_Service SHALL permit the required JSON content type, authorization header, and supported REST methods.
12. IF an HTTP request supplies an origin outside the Origin_Allowlist, THEN THE Backend_Service SHALL reject the cross-origin request before API route execution.
13. IF a WebSocket upgrade supplies an origin outside the Origin_Allowlist, THEN THE Backend_Service SHALL reject the upgrade before multiplayer connection establishment.
14. THE Backend_Service SHALL preserve the Backend_Contract for the Web_Client and Capacitor_Mobile_App.
15. THE Backend_Service SHALL keep the Supabase service-role credential exclusively in the server runtime.

### Requirement 3: Authentication storage abstraction

**User Story:** As a returning player, I want the installed app to resume the existing account securely, so that mobile convenience does not expose the session credential or break browser sign-in.

#### Acceptance Criteria

1. THE Auth_Storage SHALL expose asynchronous read, write, and clear operations for Session_Token and Device_ID values.
2. WHEN the client starts, THE Auth_Storage SHALL complete platform storage hydration before the account resume request begins.
3. WHERE a Native_Runtime stores a Session_Token, THE Auth_Storage SHALL use a Secure_Storage_Plugin backed by iOS Keychain or Android Keystore-backed storage.
4. WHERE a Native_Runtime stores a Device_ID, THE Auth_Storage SHALL use the Device_Identifier_Store.
5. WHERE the Web_Client runs, THE Web_Storage_Adapter SHALL preserve the `blockgame.token` and `blockgame.deviceId` keys.
6. IF browser local storage is unavailable, THEN THE Web_Storage_Adapter SHALL retain newly issued authentication values in memory for the current page lifetime.
7. WHEN login or device resume succeeds, THE Auth_Storage SHALL persist the returned Session_Token before authenticated gameplay begins.
8. WHEN login or device resume returns a Device_ID, THE Auth_Storage SHALL persist the returned Device_ID before the next resume attempt.
9. WHEN logout succeeds or completes as a best-effort operation, THE Auth_Storage SHALL clear the Session_Token while retaining the Device_ID.
10. IF a stored Session_Token is expired or rejected, THEN THE Auth_Storage SHALL clear the rejected Session_Token before device-based resume begins.
11. IF Auth_Storage access fails, THEN THE Web_Client SHALL enter a recoverable signed-out state without exposing the stored value in an error message.
12. THE Auth_Storage SHALL provide authenticated REST and multiplayer clients with one hydrated in-memory Session_Token value.
13. THE Mobile_Client_Code SHALL keep Session_Token values out of Capacitor Preferences, URLs, analytics, and application logs.
14. WHEN a Secure_Storage_Plugin is selected, THE Build_Pipeline SHALL record compatibility with the selected Capacitor major version and upstream release or commit activity within the preceding 12 months.

### Requirement 4: Lifecycle-aware progress persistence

**User Story:** As a mobile player, I want progress saved across backgrounding, interruption, and resume, so that normal phone lifecycle events do not discard earned progress.

#### Acceptance Criteria

1. THE Lifecycle_Coordinator SHALL represent the newest Progress_State as a Pending_Progress_Snapshot until the Backend_Service acknowledges the save.
2. WHEN Progress_State changes during Foreground_State, THE Lifecycle_Coordinator SHALL submit a debounced save after two seconds without a newer Progress_State change.
3. WHEN the Native_Shell enters Background_State, THE Lifecycle_Coordinator SHALL create a durable Pending_Progress_Snapshot within 250 milliseconds of the lifecycle event.
4. WHEN the Native_Shell enters Background_State with Network_Availability, THE Lifecycle_Coordinator SHALL initiate a Backend_Service progress save within 250 milliseconds of the lifecycle event.
5. IF a lifecycle save fails or lacks Network_Availability, THEN THE Lifecycle_Coordinator SHALL retain only the newest Pending_Progress_Snapshot for retry.
6. WHEN the Native_Shell returns to Foreground_State, THE Lifecycle_Coordinator SHALL retry the newest Pending_Progress_Snapshot after authentication hydration completes.
7. WHEN the Web_Client receives `pagehide`, THE Lifecycle_Coordinator SHALL preserve the existing best-effort final-save behavior through API_Base_URL.
8. WHILE the Native_Shell remains in Background_State, THE Lifecycle_Coordinator SHALL exclude background duration from foreground play time.
9. WHEN duplicate pause, background, or page-hide events describe the same Progress_State, THE Lifecycle_Coordinator SHALL coalesce the events into one pending save.
10. WHEN a suspended process resumes without termination, THE Lifecycle_Coordinator SHALL preserve in-session score, inventory, health, world edits, and selected game mode.
11. WHEN a terminated process next starts with a durable Pending_Progress_Snapshot, THE Lifecycle_Coordinator SHALL retry the snapshot after successful account resume.

### Requirement 5: Multiplayer disconnect, reconnect, and resume

**User Story:** As a multiplayer participant, I want connection state to follow mobile lifecycle and network changes, so that backgrounding does not create duplicate players or waste network and battery resources.

#### Acceptance Criteria

1. WHEN multiplayer mode begins in Foreground_State, THE Multiplayer_Client SHALL connect through WebSocket_URL and authenticate with the hydrated Session_Token.
2. WHEN the Native_Shell enters Background_State, THE Multiplayer_Client SHALL close the active WebSocket within one second.
3. WHEN the Native_Shell enters Background_State, THE Multiplayer_Client SHALL stop the position-publish timer within one second.
4. WHILE the Native_Shell remains in Background_State, THE Multiplayer_Client SHALL keep reconnect timers inactive.
5. WHEN the Native_Shell returns to Foreground_State with Network_Availability and a valid Session_Token, THE Multiplayer_Client SHALL begin one reconnect attempt within one second.
6. IF a foreground connection attempt fails for a transient network reason, THEN THE Multiplayer_Client SHALL schedule retries using Reconnect_Backoff.
7. WHEN Network_Availability returns during Foreground_State, THE Multiplayer_Client SHALL reset Reconnect_Backoff and begin one reconnect attempt within one second.
8. THE Multiplayer_Client SHALL maintain at most one WebSocket and one position-publish timer for the current game session.
9. WHEN a multiplayer connection closes, THE Multiplayer_Client SHALL clear remote-player scene state before displaying offline status.
10. WHEN a reconnect succeeds, THE Multiplayer_Client SHALL send a new authenticated join message before publishing player state.
11. IF the Backend_Service rejects multiplayer authentication, THEN THE Multiplayer_Client SHALL stop automatic retries and surface a sign-in-required state.
12. WHEN multiplayer status or remote-player membership remains unchanged, THE Multiplayer_Client SHALL avoid a React_State_Update for the unchanged value.

### Requirement 6: Landscape native presentation and platform assets

**User Story:** As a mobile player, I want a polished landscape presentation that respects device cutouts, so that the installed game behaves like a native full-screen game.

#### Acceptance Criteria

1. THE Native_Project SHALL declare landscape-left and landscape-right as the supported application orientations.
2. WHEN the Capacitor_Mobile_App launches or resumes, THE Native_Shell SHALL enforce a landscape orientation before gameplay input becomes active.
3. WHILE the Capacitor_Mobile_App remains in Foreground_State, THE Native_Shell SHALL hide the operating-system status bar.
4. THE Mobile_UI SHALL size the root application shell from the current visual viewport rather than fixed physical screen dimensions.
5. THE Mobile_UI SHALL apply Safe_Area inset values to HUD controls, menus, dialogs, and touch controls.
6. WHEN the landscape viewport size changes, THE Mobile_UI SHALL complete layout recalculation before accepting the next touch input.
7. THE Native_Project SHALL provide non-default application icons for each size required by the iOS and Android build validators.
8. THE Native_Project SHALL provide branded landscape splash assets for each size required by the iOS and Android build validators.
9. WHEN the Native_Shell reports that the React application shell is ready, THE Native_Shell SHALL dismiss the splash screen.
10. WHERE the Web_Client runs, THE Mobile_UI SHALL preserve browser-controlled orientation behavior.

### Requirement 7: Safe-area responsive touch parity

**User Story:** As a player without a hardware keyboard or mouse, I want touch access to every account, gameplay, vehicle, and social action, so that the complete game is usable on a phone.

#### Acceptance Criteria

1. WHERE a Native_Runtime is detected, THE Mobile_UI SHALL activate touch controls without requiring a touch-mode selector.
2. THE Mobile_UI SHALL provide an on-screen interaction path for each action in the Touch_Action_Matrix.
3. WHILE gameplay is active, THE Mobile_UI SHALL support simultaneous movement, camera look, and one gameplay action through separate touch contacts.
4. THE Mobile_UI SHALL render each primary gameplay control as a Touch_Target.
5. THE Mobile_UI SHALL maintain at least 8 CSS pixels of separation between adjacent primary Touch_Target regions.
6. THE Mobile_UI SHALL keep interactive controls inside the Safe_Area at every Supported_Landscape_Viewport.
7. WHEN a touch is cancelled, THE Mobile_UI SHALL reset the associated movement, look, jump, fire, brake, or action state before the next Animation_Loop callback.
8. WHEN the Native_Shell enters Background_State, THE Mobile_UI SHALL reset every latched touch input before suspension.
9. WHILE the software keyboard is visible for chat or login, THE Mobile_UI SHALL keep movement and combat input neutral.
10. WHEN a player submits or cancels chat with touch, THE Mobile_UI SHALL restore gameplay input without requiring a hardware key.
11. WHEN a modal panel exceeds the available Safe_Area, THE Mobile_UI SHALL provide touch scrolling within the modal panel.
12. WHILE the Touch_Action_Matrix is active, THE Mobile_UI SHALL suppress WebView text selection, context menus, overscroll, and browser navigation gestures inside gameplay controls.
13. WHEN the player holds the automatic-fire Touch_Target, THE Mobile_UI SHALL continue fire at the equipped weapon rate until release, cancellation, backgrounding, or ammunition-independent cooldown prevents a shot.

### Requirement 8: Bounded Chunk activation and edit retention

**User Story:** As a mobile player exploring the world, I want nearby terrain to remain available without unbounded memory growth, so that long movement sessions remain stable and edits remain intact.

#### Acceptance Criteria

1. WHEN gameplay first becomes interactive, THE World_Chunk_Manager SHALL make the Active_Chunk_Window available around the spawn Chunk.
2. WHEN the player crosses a Chunk boundary, THE World_Chunk_Manager SHALL recenter the Active_Chunk_Window on the new player Chunk.
3. WHILE the player remains inside one Chunk, THE World_Chunk_Manager SHALL avoid recalculating the Active_Chunk_Window from frame-level position changes.
4. THE World_Chunk_Manager SHALL render visible meshes for no more than the 49 Chunks in the Active_Chunk_Window.
5. THE World_Chunk_Manager SHALL retain no more than the 81 full generated Chunks in the Retention_Window after one second of stable player position.
6. WHEN a full generated Chunk leaves the Retention_Window, THE World_Chunk_Manager SHALL evict the full generated Chunk data.
7. WHEN an active Chunk leaves the Active_Chunk_Window, THE World_Chunk_Manager SHALL release Chunk-owned Render_Resource allocations before the second completed Animation_Loop callback after removal.
8. WHEN a player changes a block, THE World_Chunk_Manager SHALL record the change in Edited_Chunk_State independently from the full generated Chunk.
9. WHEN an edited Chunk is regenerated after eviction, THE World_Chunk_Manager SHALL reapply every Edited_Chunk_State entry before the Chunk becomes visible.
10. WHILE the current game session remains alive, THE World_Chunk_Manager SHALL preserve Edited_Chunk_State across background and resume transitions.
11. THE World_Chunk_Manager SHALL use one stable terrain seed for generation and regeneration during the current game session.
12. WHEN a Chunk is regenerated at an Active_Chunk_Window seam, THE World_Chunk_Manager SHALL preserve cross-Chunk face culling and ambient-occlusion lookup behavior.

### Requirement 9: Native mobile and desktop rendering quality profiles

**User Story:** As a player, I want rendering settings suited to the current platform, so that mobile frame rate improves without reducing the established desktop web presentation.

#### Acceptance Criteria

1. THE Rendering_Quality_Manager SHALL define typed values for DPR, antialiasing, shadow mode, shadow-map size, shadow-caster budget, bloom, star count, and decorative-light budget in each quality profile.
2. WHERE a Native_Runtime is detected, THE Rendering_Quality_Manager SHALL select Mobile_Quality_Profile before WebGL renderer creation.
3. THE Mobile_Quality_Profile SHALL cap DPR at 1.5.
4. THE Mobile_Quality_Profile SHALL disable WebGL antialiasing.
5. THE Mobile_Quality_Profile SHALL permit no more than one shadow-casting light with a shadow map no larger than 1,024 by 1,024 pixels.
6. THE Mobile_Quality_Profile SHALL disable bloom post-processing by default.
7. THE Mobile_Quality_Profile SHALL render no more than 750 stars.
8. THE Mobile_Quality_Profile SHALL activate no more than eight decorative point or spot lights nearest to the player.
9. WHERE a desktop Web_Client is detected, THE Rendering_Quality_Manager SHALL select Desktop_Quality_Profile.
10. THE Desktop_Quality_Profile SHALL retain WebGL antialiasing, soft shadows, bloom post-processing, and 3,000 stars.
11. WHEN the selected quality profile changes rendering detail, THE Rendering_Quality_Manager SHALL preserve collision, interaction distance, entity behavior, and world state.

### Requirement 10: Animation-loop and React update separation

**User Story:** As a mobile player, I want frame-level simulation to avoid unnecessary React work, so that the renderer can spend device resources on gameplay and graphics.

#### Acceptance Criteria

1. WHILE the Animation_Loop updates player movement, camera, physics, entity animation, or remote-player interpolation, THE Mobile_Client_Code SHALL mutate frame-owned refs or Three.js objects instead of scheduling a React_State_Update.
2. WHILE coordinates change continuously, THE HUD_Sampler SHALL publish coordinate React_State_Update values at no more than five updates per second.
3. WHEN a sampled HUD value is equal to the currently displayed value, THE HUD_Sampler SHALL avoid a React_State_Update.
4. WHEN the player remains within one Chunk, THE World_Chunk_Manager SHALL avoid a React_State_Update for Chunk-window membership.
5. WHEN a multiplayer roster message changes only remote transforms, THE Multiplayer_Client SHALL update interpolation targets without replacing React scene membership state.
6. WHILE a player performs steady movement without discrete gameplay events, THE Web_Client SHALL produce no more than 10 root game React commits per second.
7. WHEN a discrete UI-visible event changes health, score, inventory, modal state, multiplayer status, or membership, THE Web_Client SHALL publish the corresponding React_State_Update before the next displayed frame.

### Requirement 11: Mobile performance and memory targets

**User Story:** As a mobile player, I want stable performance during a representative play session, so that the installed game remains responsive on the minimum target device class.

#### Acceptance Criteria

1. WHEN the Representative_Session runs on Target_iOS_Device, THE Performance_Validator SHALL measure an average frame rate of at least 45 frames per second across the 10-minute session.
2. WHEN the Representative_Session runs on Target_Android_Device, THE Performance_Validator SHALL measure an average frame rate of at least 45 frames per second across the 10-minute session.
3. WHEN the Representative_Session completes on Target_iOS_Device, THE Performance_Validator SHALL verify Memory_Stability.
4. WHEN the Representative_Session completes on Target_Android_Device, THE Performance_Validator SHALL verify Memory_Stability.
5. WHILE the Representative_Session runs, THE Performance_Validator SHALL verify the Active_Chunk_Window and Retention_Window count limits once per minute.
6. WHILE the Representative_Session runs, THE Performance_Validator SHALL record zero application crashes, operating-system not-responding events, and memory-pressure terminations.
7. WHEN performance evidence is collected, THE Performance_Validator SHALL record release build identifier, operating-system version, device model, average frame rate, minute-2 memory, minute-10 memory, and maximum retained Chunk count.

### Requirement 12: Cross-platform validation and release acceptance

**User Story:** As a maintainer, I want repeatable validation across browser, iOS, Android, networking, lifecycle, and touch behavior, so that a mobile release does not regress the existing game.

#### Acceptance Criteria

1. WHEN a release candidate is evaluated, THE Validation_Suite SHALL pass the repository TypeScript type check and Web_Build.
2. WHEN a release candidate is evaluated, THE Validation_Suite SHALL complete all-platform Capacitor synchronization from a clean checkout.
3. WHEN a release candidate is evaluated, THE Validation_Suite SHALL compile a Native_Release_Artifact for iOS.
4. WHEN a release candidate is evaluated, THE Validation_Suite SHALL compile a Native_Release_Artifact for Android.
5. WHEN the iOS Native_Release_Artifact is installed on Target_iOS_Device, THE Validation_Suite SHALL verify launch, account resume, free play, multiplayer, background, resume, and relaunch.
6. WHEN the Android Native_Release_Artifact is installed on Target_Android_Device, THE Validation_Suite SHALL verify launch, account resume, free play, multiplayer, background, resume, and relaunch.
7. WHEN the Web_Client is evaluated in a supported desktop browser, THE Validation_Suite SHALL pass Core_Web_Regression.
8. WHEN authentication storage tests run in a Native_Runtime, THE Validation_Suite SHALL verify Session_Token storage through Secure_Storage_Plugin and Device_ID storage through Device_Identifier_Store.
9. WHEN endpoint tests inspect a Production_Build, THE Validation_Suite SHALL verify that API_Base_URL and WebSocket_URL contain neither localhost nor an insecure transport scheme.
10. WHEN origin tests call the Backend_Service, THE Validation_Suite SHALL verify successful HTTP and WebSocket access from each configured origin in the Origin_Allowlist.
11. WHEN origin tests call the Backend_Service from an unapproved origin, THE Validation_Suite SHALL verify rejection of HTTP and WebSocket access.
12. WHEN lifecycle tests run on each target device, THE Validation_Suite SHALL complete five background-and-resume cycles of at least 30 seconds each without duplicate saves, duplicate WebSockets, lost Progress_State, or lost Edited_Chunk_State.
13. WHEN networking tests run on each target device, THE Validation_Suite SHALL recover REST saves and multiplayer connectivity after two 30-second network interruptions.
14. WHEN touch tests run on each target device, THE Validation_Suite SHALL complete every entry in the Touch_Action_Matrix without a hardware keyboard or mouse.
15. WHEN layout tests run on each target device, THE Validation_Suite SHALL verify that each Touch_Target remains inside the Safe_Area in both landscape orientations.
16. WHEN performance acceptance runs, THE Validation_Suite SHALL execute the Representative_Session and retain the Performance_Validator evidence.
17. IF any required validation fails, THEN THE Validation_Suite SHALL mark the release candidate as not accepted and identify the failed criterion.

### Requirement 13: Profiling-gated advanced meshing

**User Story:** As a maintainer, I want advanced meshing deferred until profiling proves a need, so that the mobile conversion avoids unnecessary complexity.

#### Acceptance Criteria

1. THE Profiling_Gate SHALL keep Worker_Meshing and Greedy_Meshing outside the initial mobile-conversion scope.
2. IF either target device misses the 45-frames-per-second requirement after Requirements 8, 9, and 10 are satisfied, THEN THE Profiling_Gate SHALL collect a main-thread CPU profile during the Representative_Session.
3. IF Chunk generation or mesh construction ranks among the three largest measured frame-time contributors and consumes at least 20 percent of measured main-thread time, THEN THE Profiling_Gate SHALL authorize a separately scoped Worker_Meshing or Greedy_Meshing evaluation.
4. IF the profiling threshold for Chunk generation or mesh construction is not met, THEN THE Profiling_Gate SHALL keep Worker_Meshing and Greedy_Meshing deferred.
5. IF the performance target remains unmet after profiling, THEN THE Profiling_Gate SHALL prioritize the largest measured frame-time contributor.

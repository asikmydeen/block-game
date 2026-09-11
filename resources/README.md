# Native packaging assets & toolchain-gated commands

This directory holds the **master** icon/splash artwork. The per-platform icon
sets, adaptive icons, and splash catalogs are *generated* from these masters by
the pinned `@capacitor/assets` tool — that generation, and native project
scaffolding, require the platform toolchains and are therefore **toolchain-gated**.

## Masters (checked in)

- `icon.png` — 1024×1024 app icon master.
- `icon-foreground.png` / `icon-background.png` — Android adaptive icon layers.
- `splash.png` — 2732×2732 branded splash master (landscape-safe center).

These are solid-color branded placeholders in the Craftworld green palette; swap
in final artwork at the same dimensions before store submission.

## Toolchain-gated commands (run where Xcode / Android SDK are installed)

> TODO(native-toolchain): the following require Xcode (iOS) and/or the Android
> SDK and were NOT run in the CLT-only authoring environment. The validator
> reports the corresponding checks as `skipped-toolchain-absent`.

Generate the native projects (only after `npm run build:native`):

```sh
npm run build:native            # vite build -> dist/public
npx cap add ios                 # generates ios/App (needs Xcode)
npx cap add android             # generates android/ (needs Android SDK)
```

Generate the platform icon/splash assets from the masters:

```sh
npx @capacitor/assets generate --iconBackgroundColor '#1e401e' \
  --splashBackgroundColor '#1e401e' --assetPath resources
```

Sync the built web bundle into the checked-in native projects:

```sh
npm run sync:native             # all present platforms
npm run sync:native:ios         # iOS only
npm run sync:native:android     # Android only
```

Release builds:

```sh
npm run build:ios               # xcodebuild archive (env-supplied signing)
npm run build:android           # ./gradlew bundleRelease (env-supplied signing)
```

All wrappers under `scripts/native/` detect a missing toolchain and exit cleanly
with a `skipped-toolchain-absent` line rather than hard-failing, so `npm run`
chains and the idempotence check stay green on a host without the toolchains.
Signing material is supplied from the environment only and is never tracked.

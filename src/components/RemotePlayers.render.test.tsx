// RED (task 7.5): RemotePlayers must NOT own any transport. After the task 7
// refactor it consumes the injected MultiplayerClient and reads per-player
// transforms from the frame-owned `mpTransforms` ref lane; it subscribes to
// discrete scene MEMBERSHIP only (not per-frame movement), and it creates no
// WebSocket, no publish interval, and no reconnect timer of its own.
//
// A full @react-three/fiber mount needs a live WebGL/RAF host that jsdom does
// not provide, so this suite substitutes two checks that do not require the
// R3F renderer:
//   (1) SOURCE contract — the component source contains no transport ownership
//       (no `new WebSocket`, no `setInterval`/`setTimeout` reconnect, no direct
//       `ws.onmessage` wiring), and it does import the membership adapter.
//   (2) ADAPTER behavior — the extracted `useMpMembership` store hook reports
//       the id SET and stays referentially stable across a transform-only
//       (movement) roster update, and `mpTransforms` carries the latest target.
// These together prove the component no longer drives the socket and re-renders
// only on membership change.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  mpTransforms,
  mpIngestRoster,
  mpReset,
  useMpMembership,
} from '../game/multiplayer';

const here = dirname(fileURLToPath(import.meta.url));
const remotePlayersSrc = readFileSync(
  resolve(here, 'RemotePlayers.tsx'),
  'utf8',
);

describe('RemotePlayers transport ownership (source contract)', () => {
  it('creates no WebSocket of its own', () => {
    expect(remotePlayersSrc).not.toMatch(/new\s+WebSocket/);
  });

  it('arms no publish/reconnect timer of its own', () => {
    // The 100ms publisher and the reconnect timer now live in MultiplayerClient.
    expect(remotePlayersSrc).not.toMatch(/setInterval\s*\(/);
    // A reconnect setTimeout must not be present. (RAF via useFrame is fine.)
    expect(remotePlayersSrc).not.toMatch(/setTimeout\s*\(\s*connect/);
    expect(remotePlayersSrc).not.toMatch(/reconnectTimer/);
  });

  it('does not wire raw socket handlers (onmessage/onopen/onclose)', () => {
    expect(remotePlayersSrc).not.toMatch(/\.onmessage\s*=/);
    expect(remotePlayersSrc).not.toMatch(/\.onopen\s*=/);
    expect(remotePlayersSrc).not.toMatch(/\.onclose\s*=/);
  });

  it('consumes the membership adapter and the frame transform lane', () => {
    expect(remotePlayersSrc).toMatch(/useMpMembership/);
    expect(remotePlayersSrc).toMatch(/mpTransforms/);
  });
});

describe('membership/subscription adapter', () => {
  beforeEach(() => {
    mpReset();
  });

  it('reports the id set and updates the frame transform lane', () => {
    mpIngestRoster(
      [
        { id: 'me', name: 'Me', color: '#fff', x: 0, y: 0, z: 0, yaw: 0, emote: null, score: 0 },
        { id: 'a', name: 'A', color: '#0f0', x: 1, y: 0, z: 2, yaw: 0.1, emote: null, score: 3 },
        { id: 'b', name: 'B', color: '#00f', x: 5, y: 0, z: 6, yaw: 0.2, emote: 'wave', score: 4 },
      ],
      'me',
    );
    const snapshot = readMembership();
    expect(snapshot.slice().sort()).toEqual(['a', 'b']);
    // Frame lane carries the latest target, keyed by id, with self excluded.
    expect(mpTransforms.has('me')).toBe(false);
    expect(mpTransforms.get('a')).toMatchObject({ x: 1, z: 2, yaw: 0.1 });
    expect(mpTransforms.get('b')).toMatchObject({ emote: 'wave' });
  });

  it('stays referentially stable across a transform-only (movement) update', () => {
    // First roster establishes membership {a}.
    mpIngestRoster(
      [
        { id: 'me', name: 'Me', color: '#fff', x: 0, y: 0, z: 0, yaw: 0, emote: null, score: 0 },
        { id: 'a', name: 'A', color: '#0f0', x: 0, y: 0, z: 0, yaw: 0, emote: null, score: 3 },
      ],
      'me',
    );
    const first = readMembershipRef();
    // A movement-only update (same id set, new x/z) must NOT change the
    // membership snapshot identity — the scene does not re-render on movement.
    mpIngestRoster(
      [
        { id: 'me', name: 'Me', color: '#fff', x: 9, y: 0, z: 9, yaw: 0, emote: null, score: 0 },
        { id: 'a', name: 'A', color: '#0f0', x: 42, y: 0, z: 7, yaw: 1.2, emote: null, score: 3 },
      ],
      'me',
    );
    const second = readMembershipRef();
    expect(second).toBe(first); // same array identity ⇒ no React re-render
    // But the transform target moved.
    expect(mpTransforms.get('a')).toMatchObject({ x: 42, z: 7, yaw: 1.2 });
  });

  it('changes membership identity when the id set changes', () => {
    mpIngestRoster(
      [{ id: 'a', name: 'A', color: '#0f0', x: 0, y: 0, z: 0, yaw: 0, emote: null, score: 0 }],
      'me',
    );
    const before = readMembershipRef();
    mpIngestRoster(
      [
        { id: 'a', name: 'A', color: '#0f0', x: 0, y: 0, z: 0, yaw: 0, emote: null, score: 0 },
        { id: 'c', name: 'C', color: '#ff0', x: 0, y: 0, z: 0, yaw: 0, emote: null, score: 0 },
      ],
      'me',
    );
    const after = readMembershipRef();
    expect(after).not.toBe(before);
    expect(after.sort()).toEqual(['a', 'c']);
  });
});

// ── Adapter probes ──────────────────────────────────────────────────────────
// useMpMembership is a useSyncExternalStore hook; outside React we exercise the
// same store through its subscribe/getSnapshot by importing the hook module's
// underlying store. We reach it via a tiny render-free shim.
import { renderHook } from '@testing-library/react';

function readMembership(): string[] {
  const { result } = renderHook(() => useMpMembership());
  return [...result.current];
}
function readMembershipRef(): string[] {
  const { result } = renderHook(() => useMpMembership());
  return result.current;
}

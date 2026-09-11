import { useSyncExternalStore } from 'react';
import type {
  MpChat as ClientChat,
  MpFeedEvent as ClientEvent,
  MpRosterPlayer,
  MpSelf,
  MpStatus,
  MultiplayerSink,
} from './multiplayerClient';

// Shared multiplayer state. The MultiplayerClient (task 7.2) owns the socket
// and pushes into this store through the sink adapter below; the DOM overlays
// (chat, player list, event feed) read the equality-safe UI snapshot. Kept
// outside React so the 60fps render path never depends on component state.
//
// Two lanes, deliberately separate:
//   • UI snapshot lane  — discrete, equality-gated status/self/roster/chat/feed
//     that `useMultiplayer()` subscribes to. A frame-rate roster or a
//     transform-only movement never notifies React here.
//   • Frame transform lane — `mpTransforms` holds the latest per-player
//     position/yaw/emote target that RemotePlayers interpolates from inside
//     useFrame via a ref. Writing it NEVER notifies React.

export type EmoteName = 'wave' | 'dance' | 'cheer' | 'sit';
export const EMOTES: Array<{ name: EmoteName; icon: string; label: string; key: string }> = [
  { name: 'wave', icon: '👋', label: 'Wave', key: 'Z' },
  { name: 'dance', icon: '🕺', label: 'Dance', key: 'X' },
  { name: 'cheer', icon: '🙌', label: 'Cheer', key: 'C' },
  { name: 'sit', icon: '🪑', label: 'Sit', key: 'G' },
];

export const EMOTE_DURATION_MS = 2600;

export interface ChatMessage {
  id: number;
  from: string;
  color: string;
  text: string;
  ts: number;
  system?: boolean;
}

export interface FeedEvent {
  id: number;
  kind: string;
  text: string;
  ts: number;
}

export interface OnlinePlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  emote: EmoteName | null;
}

interface MpState {
  status: 'connecting' | 'online' | 'offline';
  self: { id: string; username: string; color: string } | null;
  others: OnlinePlayer[];
  chat: ChatMessage[];
  events: FeedEvent[];
}

const MAX_CHAT = 60;
const MAX_EVENTS = 20;
const ROSTER_UI_THROTTLE_MS = 900;

let state: MpState = {
  status: 'connecting',
  self: null,
  others: [],
  chat: [],
  events: [],
};

const listeners = new Set<() => void>();
let seq = 0;

function commit(next: Partial<MpState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useMultiplayer(): MpState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// ── Local emote (so your own third-person avatar emotes too) ──────────────
export const localEmote: { name: EmoteName | null; until: number } = { name: null, until: 0 };

// ── Socket bridge, set by RemotePlayers ──────────────────────────────────
export const mpBridge: { send: ((msg: unknown) => boolean) | null } = { send: null };

export function sendChat(text: string): boolean {
  const clean = text.trim().slice(0, 180);
  if (!clean) return false;
  return mpBridge.send?.({ type: 'chat', text: clean }) ?? false;
}

export function sendEmote(name: EmoteName): boolean {
  localEmote.name = name;
  localEmote.until = Date.now() + EMOTE_DURATION_MS;
  return mpBridge.send?.({ type: 'emote', emote: name }) ?? false;
}

export function reportKill(): void {
  mpBridge.send?.({ type: 'kill' });
}

// ── Ingest, called by RemotePlayers ──────────────────────────────────────

export function mpSetStatus(status: MpState['status']) {
  if (state.status !== status) commit({ status });
}

export function mpSetSelf(self: MpState['self']) {
  commit({ self });
}

export function mpAddChat(msg: Omit<ChatMessage, 'id'>) {
  commit({ chat: [...state.chat, { ...msg, id: ++seq }].slice(-MAX_CHAT) });
}

export function mpAddEvent(evt: Omit<FeedEvent, 'id'>) {
  commit({ events: [...state.events, { ...evt, id: ++seq }].slice(-MAX_EVENTS) });
}

// The roster arrives 10x/sec; the UI only needs it about once a second, and
// only when something a human would notice actually changed.
let lastRosterPush = 0;
export function mpSetOthers(list: OnlinePlayer[], force = false) {
  const now = Date.now();
  const changed =
    list.length !== state.others.length ||
    list.some((p, i) => {
      const prev = state.others[i];
      return !prev || prev.id !== p.id || prev.score !== p.score || prev.emote !== p.emote;
    });
  if (!changed) return;
  if (!force && now - lastRosterPush < ROSTER_UI_THROTTLE_MS) return;
  lastRosterPush = now;
  commit({ others: list });
}

export function mpReset() {
  lastRosterPush = 0;
  membershipKey = '';
  mpTransforms.clear();
  commit({ others: [], self: null });
}

// ── Frame transform lane (task 7.2) ──────────────────────────────────────
// The authoritative per-player transform target the render loop interpolates
// toward. RemotePlayers reads this map every frame through a ref; writing it
// never triggers a React render, so 10Hz network updates cost nothing on the
// render path.
export interface MpTransform {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  emote: EmoteName | null;
  score: number;
}

export const mpTransforms = new Map<string, MpTransform>();

// Discrete scene membership (ids present), equality-gated so the R3F tree only
// re-renders when the SET of avatars changes — not when they merely move.
let membershipKey = '';
const membershipListeners = new Set<() => void>();
let membershipIds: string[] = [];

function subscribeMembership(cb: () => void) {
  membershipListeners.add(cb);
  return () => membershipListeners.delete(cb);
}

/** React hook for the scene: the ordered list of remote player ids present.
 *  Stable identity while membership is unchanged, so RemotePlayers does not
 *  re-render on movement. */
export function useMpMembership(): string[] {
  return useSyncExternalStore(subscribeMembership, () => membershipIds, () => membershipIds);
}

/** Ingest a full roster from the transport. Splits the two lanes:
 *  frame transforms (always updated, no notify) and discrete membership +
 *  equality-safe UI roster (notify only on a change a human would notice). */
export function mpIngestRoster(all: MpRosterPlayer[], selfId: string | null) {
  const others = all.filter((p) => p.id !== selfId);

  // Frame lane: refresh every target, drop the departed. No React notify.
  for (const p of others) {
    mpTransforms.set(p.id, {
      id: p.id,
      name: p.name,
      color: p.color,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      emote: (p.emote as EmoteName | null) ?? null,
      score: p.score ?? 0,
    });
  }
  for (const id of Array.from(mpTransforms.keys())) {
    if (!others.some((p) => p.id === id)) mpTransforms.delete(id);
  }

  // Membership lane: notify the scene only when the id set actually changes.
  const key = others.map((p) => p.id).join('|');
  if (key !== membershipKey) {
    membershipKey = key;
    membershipIds = others.map((p) => p.id);
    for (const l of membershipListeners) l();
  }

  // UI roster lane: equality-safe + throttled (unchanged behavior).
  mpSetOthers(
    others.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      score: p.score ?? 0,
      emote: (p.emote as EmoteName | null) ?? null,
    })),
  );
}

function clearMembership() {
  mpTransforms.clear();
  if (membershipKey !== '') {
    membershipKey = '';
    membershipIds = [];
    for (const l of membershipListeners) l();
  }
}

// ── Sink adapter: bind a MultiplayerClient to this store ─────────────────
// Preserves every existing store mutation (message shapes unchanged). The
// client stays UI-agnostic; this adapter is the only place that knows both.
export function createStoreSink(handlers: {
  self: (self: MpSelf) => void;
  status: (status: MpStatus, count: number) => void;
  race?: (race: unknown) => void;
  ping?: (ping: unknown) => void;
  players?: (players: unknown) => void;
}): MultiplayerSink {
  return {
    onStatus: (status, count) => {
      mpSetStatus(status);
      handlers.status(status, count);
    },
    onSelf: (self) => {
      mpSetSelf(self);
      handlers.self(self);
    },
    onRoster: (players) => {
      const selfId = state.self?.id ?? null;
      if (players.length === 0) {
        // Clear scene membership BEFORE the offline status the transport emits
        // right after (the client orders roster-clear first).
        clearMembership();
        mpSetOthers([], true);
        return;
      }
      mpIngestRoster(players, selfId);
    },
    onChat: (chat: ClientChat) => mpAddChat(chat),
    onEvent: (evt: ClientEvent) => mpAddEvent(evt),
    onRace: (race) => handlers.race?.(race),
    onPing: (ping) => handlers.ping?.(ping),
    onPlayers: (players) => handlers.players?.(players),
  };
}

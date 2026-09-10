// Tiny handle so HUD / combat can talk to the multiplayer socket without
// prop-drilling through the R3F tree. RemotePlayers owns the WebSocket.

export type RacePhase = 'idle' | 'active' | 'won' | 'failed';

export interface RaceState {
  phase: RacePhase;
  levelId: string | null;
  endsAt: number;
  winner: string | null;
}

export interface MpPlayerInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface PingEvent {
  from: string;
  x: number;
  y: number;
  z: number;
}

type SendFn = (msg: Record<string, unknown>) => void;

export const mpBridge = {
  send: null as SendFn | null,
  levelStart(id: string) {
    this.send?.({ type: 'level_start', id });
  },
  levelComplete(id: string) {
    this.send?.({ type: 'level_complete', id });
  },
  ping(x: number, y: number, z: number) {
    this.send?.({ type: 'ping', x, y, z });
  },
};

export const RACE_IDLE: RaceState = {
  phase: 'idle',
  levelId: null,
  endsAt: 0,
  winner: null,
};

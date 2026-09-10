// Tiny handle so HUD / combat can talk to the multiplayer socket without
// prop-drilling through the R3F tree. RemotePlayers owns the WebSocket.

export type RaidPhase = 'idle' | 'active' | 'rest' | 'won' | 'failed';

export interface RaidState {
  phase: RaidPhase;
  wave: number;
  kills: number;
  goal: number;
  endsAt: number;
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
  raidStart() {
    this.send?.({ type: 'raid_start' });
  },
  raidKill() {
    this.send?.({ type: 'raid_kill' });
  },
  ping(x: number, y: number, z: number) {
    this.send?.({ type: 'ping', x, y, z });
  },
};

export const RAID_IDLE: RaidState = {
  phase: 'idle',
  wave: 0,
  kills: 0,
  goal: 0,
  endsAt: 0,
};

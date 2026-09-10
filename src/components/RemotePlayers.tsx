import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { Humanoid, createLimbs, type HumanoidLimbs } from './Humanoid';
import { getToken } from '../game/account';
import { mpBridge, RAID_IDLE, type MpPlayerInfo, type PingEvent, type RaidState } from '../game/mpBridge';

interface RemotePlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface RemotePlayersProps {
  playerPosRef: MutableRefObject<THREE.Vector3>;
  onStatusChange: (status: 'connecting' | 'online' | 'offline', count: number) => void;
  onRaid?: (raid: RaidState) => void;
  onPing?: (ping: PingEvent) => void;
  onPlayers?: (players: MpPlayerInfo[]) => void;
}

export function RemotePlayers({ playerPosRef, onStatusChange, onRaid, onPing, onPlayers }: RemotePlayersProps) {
  const { camera } = useThree();
  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  const myIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());
  const targetsRef = useRef<Map<string, RemotePlayer>>(new Map());
  const limbRefs = useRef<Map<string, HumanoidLimbs>>(new Map());
  const onRaidRef = useRef(onRaid);
  const onPingRef = useRef(onPing);
  const onPlayersRef = useRef(onPlayers);
  onRaidRef.current = onRaid;
  onPingRef.current = onPing;
  onPlayersRef.current = onPlayers;

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let sendTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      onStatusChange('connecting', 0);
      // Same-origin: a proxy in front forwards /api (with WS upgrade) to the API.
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/api/mp`);
      wsRef.current = ws;

      ws.onopen = () => {
        mpBridge.send = (m) => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
        };
        // Identity comes from the account session — the server resolves the
        // username, so no client-supplied nickname is trusted.
        ws?.send(JSON.stringify({ type: 'join', token: getToken() }));
        sendTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            const p = playerPosRef.current;
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            ws.send(
              JSON.stringify({
                type: 'state',
                x: p.x,
                y: p.y,
                z: p.z,
                yaw: Math.atan2(dir.x, dir.z),
              })
            );
          }
        }, 100);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'welcome') {
            myIdRef.current = msg.id;
          } else if (msg.type === 'auth_error' || msg.type === 'kicked') {
            closed = true; // don't fight the server over identity
            onStatusChange('offline', 0);
            setPlayers([]);
          } else if (msg.type === 'players') {
            const others = (msg.players as RemotePlayer[]).filter((p) => p.id !== myIdRef.current);
            for (const p of others) targetsRef.current.set(p.id, p);
            for (const id of Array.from(targetsRef.current.keys())) {
              if (!others.some((p) => p.id === id)) targetsRef.current.delete(id);
            }
            setPlayers((prev) => {
              const sameIds =
                prev.length === others.length && prev.every((p, i) => others[i]?.id === p.id);
              return sameIds ? prev : others;
            });
            onStatusChange('online', others.length);
            onPlayersRef.current?.(
              others.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, z: p.z }))
            );
          } else if (msg.type === 'raid') {
            onRaidRef.current?.({
              phase: msg.phase ?? 'idle',
              wave: Number(msg.wave) || 0,
              kills: Number(msg.kills) || 0,
              goal: Number(msg.goal) || 0,
              endsAt: Number(msg.endsAt) || 0,
            });
          } else if (msg.type === 'ping') {
            onPingRef.current?.({
              from: String(msg.from ?? 'player'),
              x: Number(msg.x) || 0,
              y: Number(msg.y) || 0,
              z: Number(msg.z) || 0,
            });
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        mpBridge.send = null;
        if (sendTimer) clearInterval(sendTimer);
        sendTimer = null;
        if (!closed) {
          onStatusChange('offline', 0);
          setPlayers([]);
          targetsRef.current.clear();
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      mpBridge.send = null;
      onRaidRef.current?.(RAID_IDLE);
      onPlayersRef.current?.([]);
      if (sendTimer) clearInterval(sendTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
    };
    // Connect once per mount; camera/playerPosRef are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smoothly move avatars toward their latest network position.
  useFrame((_, delta) => {
    const k = Math.min(1, delta * 10);
    const t0 = performance.now() * 0.006;
    for (const [id, g] of groupRefs.current) {
      const t = targetsRef.current.get(id);
      if (!t) continue;
      const dx = t.x - g.position.x;
      const dz = t.z - g.position.z;
      g.position.x += dx * k;
      g.position.y += (t.y - g.position.y) * k;
      g.position.z += dz * k;
      g.rotation.y += (t.yaw - g.rotation.y) * k;

      // Walk swing while the avatar is still catching up to its target
      const moving = Math.hypot(dx, dz) > 0.08;
      const limbs = limbRefs.current.get(id);
      if (limbs) {
        const swing = moving ? Math.sin(t0 * 4) * 0.6 : 0;
        if (limbs.leftArm) limbs.leftArm.rotation.x = swing;
        if (limbs.rightArm) limbs.rightArm.rotation.x = -swing;
        if (limbs.leftLeg) limbs.leftLeg.rotation.x = -swing;
        if (limbs.rightLeg) limbs.rightLeg.rotation.x = swing;
      }
    }
  });

  return (
    <>
      {players.map((p) => {
        if (!limbRefs.current.has(p.id)) limbRefs.current.set(p.id, createLimbs());
        return (
          <group
            key={p.id}
            position={[p.x, p.y, p.z]}
            ref={(el) => {
              if (el) groupRefs.current.set(p.id, el);
              else {
                groupRefs.current.delete(p.id);
                limbRefs.current.delete(p.id);
              }
            }}
          >
            <Humanoid
              skin="#ffd9b3"
              shirt={p.color}
              pants="#3a5a8c"
              limbs={limbRefs.current.get(p.id)}
            />
            <Billboard position={[0, 2.35, 0]}>
              <Text
                fontSize={0.32}
                color="#ffffff"
                outlineWidth={0.03}
                outlineColor="#000000"
                anchorX="center"
                anchorY="middle"
              >
                {p.name}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </>
  );
}

import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { Humanoid, createLimbs, type HumanoidLimbs } from './Humanoid';
import { mpBridge as raceBridge } from '../game/mpBridge';
import {
  EMOTES,
  mpBridge,
  mpTransforms,
  useMpMembership,
  type EmoteName,
  type MpTransform,
} from '../game/multiplayer';
import type { MultiplayerClient } from '../game/multiplayerClient';

interface RemotePlayersProps {
  /** The transport, created and owned by the page (Game). RemotePlayers only
   *  starts/stops it and reads its decoded state — it never touches a socket. */
  client: MultiplayerClient;
  /** Camera-facing yaw sink for the transport's position publisher. Written
   *  each frame here (the camera lives in this R3F subtree); read by the
   *  client's getPosition. A plain ref — not transport state. */
  yawRef: MutableRefObject<number>;
}

const EMOTE_ICONS: Record<string, string> = Object.fromEntries(
  EMOTES.map((e) => [e.name, e.icon])
);

/** Drives limb poses for an emote. Shared by remote avatars and your own. */
export function applyEmotePose(
  limbs: HumanoidLimbs,
  group: THREE.Object3D | null,
  emote: EmoteName | null,
  t: number
) {
  const reset = () => {
    if (group) {
      group.position.y = 0;
      group.rotation.z = 0;
    }
  };

  switch (emote) {
    case 'wave': {
      reset();
      const w = Math.sin(t * 9) * 0.5;
      if (limbs.rightArm) limbs.rightArm.rotation.z = -2.3 + w * 0.35;
      if (limbs.rightArm) limbs.rightArm.rotation.x = 0;
      if (limbs.leftArm) limbs.leftArm.rotation.x = 0.1;
      if (limbs.leftLeg) limbs.leftLeg.rotation.x = 0;
      if (limbs.rightLeg) limbs.rightLeg.rotation.x = 0;
      return true;
    }
    case 'cheer': {
      const hop = Math.abs(Math.sin(t * 6)) * 0.12;
      if (group) {
        group.position.y = hop;
        group.rotation.z = 0;
      }
      if (limbs.leftArm) {
        limbs.leftArm.rotation.z = 2.5;
        limbs.leftArm.rotation.x = 0;
      }
      if (limbs.rightArm) {
        limbs.rightArm.rotation.z = -2.5;
        limbs.rightArm.rotation.x = 0;
      }
      if (limbs.leftLeg) limbs.leftLeg.rotation.x = 0;
      if (limbs.rightLeg) limbs.rightLeg.rotation.x = 0;
      return true;
    }
    case 'dance': {
      const s = Math.sin(t * 7);
      if (group) {
        group.position.y = Math.abs(s) * 0.1;
        group.rotation.z = s * 0.12;
      }
      if (limbs.leftArm) {
        limbs.leftArm.rotation.z = 1.2 + s * 0.9;
        limbs.leftArm.rotation.x = 0;
      }
      if (limbs.rightArm) {
        limbs.rightArm.rotation.z = -1.2 + s * 0.9;
        limbs.rightArm.rotation.x = 0;
      }
      if (limbs.leftLeg) limbs.leftLeg.rotation.x = s * 0.5;
      if (limbs.rightLeg) limbs.rightLeg.rotation.x = -s * 0.5;
      return true;
    }
    case 'sit': {
      if (group) {
        group.position.y = -0.42;
        group.rotation.z = 0;
      }
      if (limbs.leftLeg) limbs.leftLeg.rotation.x = -1.5;
      if (limbs.rightLeg) limbs.rightLeg.rotation.x = -1.5;
      if (limbs.leftArm) {
        limbs.leftArm.rotation.x = -0.4;
        limbs.leftArm.rotation.z = 0;
      }
      if (limbs.rightArm) {
        limbs.rightArm.rotation.x = -0.4;
        limbs.rightArm.rotation.z = 0;
      }
      return true;
    }
    default:
      // Clear any emote-only rotations so walking looks right again.
      reset();
      if (limbs.leftArm) limbs.leftArm.rotation.z = 0;
      if (limbs.rightArm) limbs.rightArm.rotation.z = 0;
      return false;
  }
}

export function RemotePlayers({ client, yawRef }: RemotePlayersProps) {
  const { camera } = useThree();
  // Discrete scene membership — the ONLY React state this component subscribes
  // to. It changes when the SET of remote players changes, never on movement,
  // so the avatar list re-renders only on join/leave.
  const memberIds = useMpMembership();

  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());
  const innerRefs = useRef<Map<string, THREE.Group>>(new Map());
  const limbRefs = useRef<Map<string, HumanoidLimbs>>(new Map());

  // Start / stop the injected transport with the component lifetime. The
  // component owns no socket, publisher, or reconnect timer — the client does.
  // The DOM overlays (chat/emote) and HUD races send through the client too.
  useEffect(() => {
    mpBridge.send = (msg: unknown) => client.send(msg);
    raceBridge.send = (m) => {
      client.send(m);
    };
    client.start();
    return () => {
      client.stop();
      mpBridge.send = null;
      raceBridge.send = null;
      // Drop scene membership so no stale avatars linger after unmount.
      groupRefs.current.clear();
      innerRefs.current.clear();
      limbRefs.current.clear();
    };
  }, [client]);

  // Smoothly move avatars toward their latest network position. Targets are
  // read from the frame-owned `mpTransforms` lane (a ref-like external map),
  // never from React state, so this 60fps path triggers no re-render.
  useFrame((_, delta) => {
    // Publish yaw from the live camera facing (the transport reads this ref).
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    yawRef.current = Math.atan2(dir.x, dir.z);
    const k = Math.min(1, delta * 10);
    const t = performance.now() * 0.001;
    for (const [id, g] of groupRefs.current) {
      const target: MpTransform | undefined = mpTransforms.get(id);
      if (!target) continue;
      const dx = target.x - g.position.x;
      const dz = target.z - g.position.z;
      g.position.x += dx * k;
      g.position.y += (target.y - g.position.y) * k;
      g.position.z += dz * k;
      g.rotation.y += (target.yaw - g.rotation.y) * k;

      const limbs = limbRefs.current.get(id);
      if (!limbs) continue;
      const inner = innerRefs.current.get(id) ?? null;

      // Emote takes over the pose; otherwise fall back to the walk cycle.
      if (applyEmotePose(limbs, inner, target.emote ?? null, t)) continue;

      const moving = Math.hypot(dx, dz) > 0.08;
      const swing = moving ? Math.sin(t * 6 * 4) * 0.6 : 0;
      if (limbs.leftArm) limbs.leftArm.rotation.x = swing;
      if (limbs.rightArm) limbs.rightArm.rotation.x = -swing;
      if (limbs.leftLeg) limbs.leftLeg.rotation.x = -swing;
      if (limbs.rightLeg) limbs.rightLeg.rotation.x = swing;
    }
  });

  return (
    <>
      {memberIds.map((id) => {
        const target = mpTransforms.get(id);
        if (!target) return null;
        if (!limbRefs.current.has(id)) limbRefs.current.set(id, createLimbs());
        return (
          <group
            key={id}
            position={[target.x, target.y, target.z]}
            ref={(el) => {
              if (el) groupRefs.current.set(id, el);
              else {
                groupRefs.current.delete(id);
                limbRefs.current.delete(id);
                innerRefs.current.delete(id);
              }
            }}
          >
            {/* Inner group is what emotes hop/tilt, so the network position
                stays authoritative on the outer group. */}
            <group
              ref={(el) => {
                if (el) innerRefs.current.set(id, el);
              }}
            >
              <Humanoid
                skin="#ffd9b3"
                shirt={target.color}
                pants="#3a5a8c"
                limbs={limbRefs.current.get(id)}
              />
            </group>
            <Billboard position={[0, 2.35, 0]}>
              <Text
                fontSize={0.32}
                color="#ffffff"
                outlineWidth={0.03}
                outlineColor="#000000"
                anchorX="center"
                anchorY="middle"
              >
                {target.emote ? `${EMOTE_ICONS[target.emote] ?? ''} ${target.name}` : target.name}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </>
  );
}

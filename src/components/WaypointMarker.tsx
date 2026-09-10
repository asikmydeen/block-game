import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';

export function WaypointMarker({
  x,
  y,
  z,
  label,
  color = '#7CFC00',
}: {
  x: number;
  y: number;
  z: number;
  label: string;
  color?: string;
}) {
  const group = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) group.current.position.y = y + Math.sin(t * 2) * 0.25;
    if (beam.current) {
      const s = 1 + Math.sin(t * 3) * 0.08;
      beam.current.scale.set(s, 1, s);
    }
  });

  return (
    <>
      <group ref={group} position={[x, y, z]}>
        <mesh ref={beam} position={[0, 4, 0]}>
          <cylinderGeometry args={[0.18, 0.35, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.45} />
        </mesh>
        <mesh position={[0, 8.2, 0]}>
          <octahedronGeometry args={[0.55, 0]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <Billboard position={[0, 9.2, 0]}>
          <Text
            fontSize={0.42}
            color="#ffffff"
            outlineWidth={0.04}
            outlineColor="#000000"
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
        </Billboard>
      </group>
      <EdgeArrow target={[x, y + 8, z]} color={color} />
    </>
  );
}

function EdgeArrow({ target, color }: { target: [number, number, number]; color: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const { camera, size } = useThree();
  const vec = useRef(new THREE.Vector3());

  useEffect(() => {
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.width = '0';
    el.style.height = '0';
    el.style.borderLeft = '8px solid transparent';
    el.style.borderRight = '8px solid transparent';
    el.style.borderBottom = `16px solid ${color}`;
    el.style.filter = 'drop-shadow(0 1px 2px #000)';
    el.style.zIndex = '180';
    el.style.pointerEvents = 'none';
    el.style.display = 'none';
    el.style.transformOrigin = '8px 10px';
    document.body.appendChild(el);
    elRef.current = el;
    return () => {
      el.remove();
      elRef.current = null;
    };
  }, [color]);

  useFrame(() => {
    const el = elRef.current;
    if (!el) return;
    const v = vec.current.set(target[0], target[1], target[2]).project(camera);
    const behind = v.z > 1;
    const onScreen = !behind && v.x > -0.92 && v.x < 0.92 && v.y > -0.78 && v.y < 0.88;
    if (onScreen) {
      el.style.display = 'none';
      return;
    }
    let nx = v.x;
    let ny = v.y;
    if (behind) {
      nx = -nx;
      ny = -ny;
    }
    const ang = Math.atan2(nx, ny);
    const pad = 28;
    const halfW = size.width / 2 - pad;
    const halfH = size.height / 2 - pad;
    const dx = Math.sin(ang);
    const dy = Math.cos(ang);
    const sx = dx === 0 ? Infinity : halfW / Math.abs(dx);
    const sy = dy === 0 ? Infinity : halfH / Math.abs(dy);
    const t = Math.min(sx, sy);
    const px = size.width / 2 + dx * t;
    const py = size.height / 2 - dy * t;
    el.style.display = 'block';
    el.style.left = `${px - 8}px`;
    el.style.top = `${py - 10}px`;
    el.style.transform = `rotate(${(ang * 180) / Math.PI}deg)`;
  });

  return null;
}

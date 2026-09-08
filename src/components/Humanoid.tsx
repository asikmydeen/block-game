import * as THREE from 'three';

// Shared blocky humanoid used by villagers, zombies, remote players and the
// local third-person avatar. Minecraft-style box proportions, but with rich
// detail: layered hair, eyes with pupils, brows, mouth, nose, belt, sleeves,
// and shoes. Limbs are boxes inside pivot groups placed at the shoulders and
// hips, so the `rotation.x` swing animation rotates from the joint.

export interface HumanoidLimbs {
  leftArm: THREE.Group | null;
  rightArm: THREE.Group | null;
  leftLeg: THREE.Group | null;
  rightLeg: THREE.Group | null;
}

export function createLimbs(): HumanoidLimbs {
  return { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };
}

interface HumanoidProps {
  skin: string;
  shirt: string;
  pants: string;
  // Sleeve color; defaults to the shirt (short-sleeve zombies pass skin).
  arms?: string;
  hair?: string | null;
  variant?: 'normal' | 'zombie';
  // Mutable object the pivot groups register into (existing limbRefs pattern).
  limbs?: HumanoidLimbs;
}

const HIP_Y = 0.78;
const SHOULDER_Y = 1.42;
const HEAD_Y = 1.76;
export const HUMANOID_HEIGHT = 2.0;
// Exported so riders can be seated with their hips on a saddle (the model's
// origin is at the feet).
export const HUMANOID_HIP_Y = HIP_Y;

export function Humanoid({ skin, shirt, pants, arms, hair = '#3b2a1d', variant = 'normal', limbs }: HumanoidProps) {
  const zombie = variant === 'zombie';
  const armColor = arms ?? shirt;
  const faceZ = 0.235; // front face of the 0.46 head box

  return (
    <group>
      {/* Legs (hip pivots) */}
      {([-1, 1] as const).map((side) => (
        <group
          key={`leg${side}`}
          position={[side * 0.13, HIP_Y, 0]}
          ref={(el) => {
            if (limbs) {
              if (side < 0) limbs.leftLeg = el;
              else limbs.rightLeg = el;
            }
          }}
        >
          <mesh position={[0, -0.34, 0]} castShadow>
            <boxGeometry args={[0.21, 0.62, 0.23]} />
            <meshLambertMaterial color={pants} />
          </mesh>
          {/* Shoe */}
          <mesh position={[0, -0.71, 0.03]} castShadow>
            <boxGeometry args={[0.23, 0.13, 0.3]} />
            <meshLambertMaterial color={zombie ? '#1c1712' : '#26221d'} />
          </mesh>
        </group>
      ))}

      {/* Torso */}
      <mesh position={[0, 1.12, 0]} castShadow>
        <boxGeometry args={[0.52, 0.68, 0.3]} />
        <meshLambertMaterial color={shirt} />
      </mesh>
      {/* Belt */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.53, 0.09, 0.31]} />
        <meshLambertMaterial color="#2c2620" />
      </mesh>
      <mesh position={[0, 0.8, 0.16]}>
        <boxGeometry args={[0.1, 0.07, 0.02]} />
        <meshBasicMaterial color={zombie ? '#4c4438' : '#c9a53d'} />
      </mesh>
      {/* Shirt buttons */}
      {!zombie && (
        <>
          <mesh position={[0, 1.24, 0.155]}>
            <boxGeometry args={[0.04, 0.04, 0.01]} />
            <meshBasicMaterial color="#1e1e1e" />
          </mesh>
          <mesh position={[0, 1.08, 0.155]}>
            <boxGeometry args={[0.04, 0.04, 0.01]} />
            <meshBasicMaterial color="#1e1e1e" />
          </mesh>
        </>
      )}
      {/* Zombie shirt tear */}
      {zombie && (
        <mesh position={[0.1, 1.0, 0.153]}>
          <boxGeometry args={[0.14, 0.2, 0.01]} />
          <meshLambertMaterial color="#5d7331" />
        </mesh>
      )}

      {/* Arms (shoulder pivots) */}
      {([-1, 1] as const).map((side) => (
        <group
          key={`arm${side}`}
          position={[side * 0.34, SHOULDER_Y, 0]}
          ref={(el) => {
            if (limbs) {
              if (side < 0) limbs.leftArm = el;
              else limbs.rightArm = el;
            }
          }}
        >
          {/* Sleeve (upper) */}
          <mesh position={[0, -0.16, 0]} castShadow>
            <boxGeometry args={[0.19, 0.32, 0.21]} />
            <meshLambertMaterial color={armColor} />
          </mesh>
          {/* Forearm (skin) */}
          <mesh position={[0, -0.44, 0]} castShadow>
            <boxGeometry args={[0.17, 0.26, 0.19]} />
            <meshLambertMaterial color={zombie ? armColor : skin} />
          </mesh>
          {/* Hand */}
          <mesh position={[0, -0.62, 0]}>
            <boxGeometry args={[0.15, 0.12, 0.17]} />
            <meshLambertMaterial color={skin} />
          </mesh>
        </group>
      ))}

      {/* Head */}
      <mesh position={[0, HEAD_Y, 0]} castShadow>
        <boxGeometry args={[0.46, 0.46, 0.46]} />
        <meshLambertMaterial color={skin} />
      </mesh>
      {/* Hair: top slab + back panel + side fringes */}
      {hair && !zombie && (
        <>
          <mesh position={[0, HEAD_Y + 0.24, -0.01]}>
            <boxGeometry args={[0.5, 0.12, 0.5]} />
            <meshLambertMaterial color={hair} />
          </mesh>
          <mesh position={[0, HEAD_Y + 0.08, -0.22]}>
            <boxGeometry args={[0.5, 0.28, 0.08]} />
            <meshLambertMaterial color={hair} />
          </mesh>
          <mesh position={[-0.22, HEAD_Y + 0.12, 0]}>
            <boxGeometry args={[0.08, 0.2, 0.5]} />
            <meshLambertMaterial color={hair} />
          </mesh>
          <mesh position={[0.22, HEAD_Y + 0.12, 0]}>
            <boxGeometry args={[0.08, 0.2, 0.5]} />
            <meshLambertMaterial color={hair} />
          </mesh>
        </>
      )}
      {/* Zombie scalp wound */}
      {zombie && (
        <mesh position={[0.08, HEAD_Y + 0.24, 0.05]}>
          <boxGeometry args={[0.18, 0.04, 0.2]} />
          <meshLambertMaterial color="#455426" />
        </mesh>
      )}

      {/* Face */}
      {zombie ? (
        <>
          {/* Glowing sunken eyes */}
          <mesh position={[-0.1, HEAD_Y + 0.04, faceZ]}>
            <boxGeometry args={[0.1, 0.08, 0.02]} />
            <meshBasicMaterial color="#ff2a1a" />
          </mesh>
          <mesh position={[0.1, HEAD_Y + 0.04, faceZ]}>
            <boxGeometry args={[0.1, 0.08, 0.02]} />
            <meshBasicMaterial color="#ff2a1a" />
          </mesh>
          {/* Crooked mouth */}
          <mesh position={[-0.02, HEAD_Y - 0.12, faceZ]} rotation={[0, 0, -0.15]}>
            <boxGeometry args={[0.18, 0.04, 0.02]} />
            <meshBasicMaterial color="#1a0a05" />
          </mesh>
          {/* Missing-tooth glint */}
          <mesh position={[0.04, HEAD_Y - 0.11, faceZ + 0.005]}>
            <boxGeometry args={[0.03, 0.03, 0.02]} />
            <meshBasicMaterial color="#d8d4c2" />
          </mesh>
        </>
      ) : (
        <>
          {/* Eyes: white + pupil */}
          {([-1, 1] as const).map((side) => (
            <group key={`eye${side}`} position={[side * 0.1, HEAD_Y + 0.04, faceZ]}>
              <mesh>
                <boxGeometry args={[0.1, 0.08, 0.015]} />
                <meshBasicMaterial color="#f4f4f4" />
              </mesh>
              <mesh position={[side * 0.015, -0.005, 0.005]}>
                <boxGeometry args={[0.045, 0.055, 0.015]} />
                <meshBasicMaterial color="#2b3a52" />
              </mesh>
            </group>
          ))}
          {/* Brows */}
          <mesh position={[-0.1, HEAD_Y + 0.12, faceZ]}>
            <boxGeometry args={[0.11, 0.03, 0.015]} />
            <meshBasicMaterial color={hair ?? '#3b2a1d'} />
          </mesh>
          <mesh position={[0.1, HEAD_Y + 0.12, faceZ]}>
            <boxGeometry args={[0.11, 0.03, 0.015]} />
            <meshBasicMaterial color={hair ?? '#3b2a1d'} />
          </mesh>
          {/* Nose */}
          <mesh position={[0, HEAD_Y - 0.03, faceZ + 0.015]}>
            <boxGeometry args={[0.06, 0.08, 0.04]} />
            <meshLambertMaterial color={skin} />
          </mesh>
          {/* Mouth */}
          <mesh position={[0, HEAD_Y - 0.14, faceZ]}>
            <boxGeometry args={[0.14, 0.03, 0.015]} />
            <meshBasicMaterial color="#8c5b4a" />
          </mesh>
        </>
      )}
    </group>
  );
}

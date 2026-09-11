import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';

// Animated water surface. Top faces ripple in the vertex stage; the fragment
// stage adds a perturbed normal, a sun glint and a fresnel rim so the surface
// reads as liquid instead of a flat blue block.
//
// Fog is applied manually from uniforms rather than three's shader chunks, so
// this stays a self-contained ShaderMaterial that can't break when three's
// internal include names change.

const vertexShader = /* glsl */ `
  uniform float uTime;
  attribute vec3 color;
  varying vec3 vColor;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vColor = color;
    vNormalW = normal;

    vec3 p = position;
    if (normal.y > 0.5) {
      // Two crossing waves keep the motion from looking like one sine sweep.
      p.y += sin(p.x * 0.85 + uTime * 1.5) * 0.055
           + sin(p.z * 1.25 + uTime * 2.0) * 0.045
           - 0.07; // sit just under the block top so edges stay tucked in
    }

    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uNight;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec3 vColor;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 n = normalize(vNormalW);

    // Ripple the surface normal so highlights travel across the water.
    if (n.y > 0.5) {
      n = normalize(n + vec3(
        sin(vWorldPos.x * 2.1 + uTime * 1.9) * 0.14,
        0.0,
        cos(vWorldPos.z * 2.4 + uTime * 1.6) * 0.14
      ));
    }

    float diffuse = max(dot(n, uSunDir), 0.0);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    float glint = pow(max(dot(reflect(-uSunDir, n), viewDir), 0.0), 60.0);

    vec3 col = mix(vColor * 0.8, vColor * 1.3, diffuse);
    col += fresnel * 0.3;
    col += glint * (1.0 - uNight) * 0.9;

    // Deep, cold and dim at night.
    col = mix(col, col * 0.32 + vec3(0.02, 0.05, 0.13), uNight);

    // Linear distance fog to match the scene's fog.
    float fogFactor = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorldPos));
    col = mix(col, uFogColor, fogFactor);

    gl_FragColor = vec4(col, uOpacity);
  }
`;

interface WaterMaterialProps {
  night: boolean;
}

export const WaterMaterial = forwardRef<THREE.ShaderMaterial, WaterMaterialProps>(
  function WaterMaterial({ night }, ref) {
    // Uniform objects are created once; values are updated per frame/prop so
    // changing day/night never recompiles the shader.
    const uniforms = useMemo(
      () => ({
        uTime: { value: 0 },
        uOpacity: { value: 0.78 },
        uNight: { value: night ? 1 : 0 },
        uSunDir: { value: new THREE.Vector3(0.55, 0.72, 0.42).normalize() },
        uFogColor: { value: new THREE.Color('#c8e8ff') },
        uFogNear: { value: 60 },
        uFogFar: { value: 180 },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );

    uniforms.uNight.value = night ? 1 : 0;
    uniforms.uFogColor.value.set(night ? '#0a1226' : '#c8e8ff');
    uniforms.uFogNear.value = night ? 40 : 60;
    uniforms.uFogFar.value = night ? 140 : 180;

    return (
      <shaderMaterial
        ref={ref}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    );
  }
);

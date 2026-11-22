import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sprayFx } from './paintStore';

const COUNT = 48;
const LIFE = 0.22;

/** Chorro sutil de gotitas del color elegido, de la boquilla al punto que se pinta. */
export function SprayMist() {
  const pointsRef = useRef<THREE.Points>(null);
  const { geometry, ages, seeds } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    return { geometry: g, ages: new Float32Array(COUNT).fill(LIFE), seeds: new Float32Array(COUNT * 3) };
  }, []);
  const material = useMemo(() => new THREE.PointsMaterial({
    size: 0.035, transparent: true, opacity: 0.7, depthWrite: false, sizeAttenuation: true,
  }), []);
  const next = useRef(0);
  const dir = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const dt = Math.min(delta, 0.05);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    if (sprayFx.active) {
      material.color.copy(sprayFx.color);
      // Unas 4 gotas por cuadro mientras se aprieta el gatillo.
      for (let n = 0; n < 4; n++) {
        const i = next.current;
        next.current = (i + 1) % COUNT;
        ages[i] = 0;
        seeds[i * 3] = (Math.random() - 0.5) * 0.08;
        seeds[i * 3 + 1] = (Math.random() - 0.5) * 0.08;
        seeds[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
      }
    }
    dir.subVectors(sprayFx.to, sprayFx.from);
    let alive = false;
    for (let i = 0; i < COUNT; i++) {
      if (ages[i] >= LIFE) { pos.setXYZ(i, 0, -999, 0); continue; }
      ages[i] += dt;
      alive = true;
      const t = Math.min(1, ages[i] / LIFE);
      const spread = t;
      pos.setXYZ(
        i,
        sprayFx.from.x + dir.x * t + seeds[i * 3] * spread,
        sprayFx.from.y + dir.y * t + seeds[i * 3 + 1] * spread,
        sprayFx.from.z + dir.z * t + seeds[i * 3 + 2] * spread,
      );
    }
    pos.needsUpdate = true;
    pts.visible = alive;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} visible={false} />;
}

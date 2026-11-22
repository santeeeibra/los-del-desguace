import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { winchRopes } from './robotics';

const MAX = 8;
const UP = new THREE.Vector3(0, 1, 0);

/** Soga 3D de cada cabrestante (más roja cuanto más tensa). */
export function RoboticRopes() {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.018, 0.018, 1, 6), []);
  const materials = useMemo(() => Array.from({ length: MAX }, () => new THREE.MeshStandardMaterial({ color: '#c9a45a', roughness: 0.9 })), []);
  const tmp = useMemo(() => ({ dir: new THREE.Vector3(), slack: new THREE.Color('#c9a45a'), taut: new THREE.Color('#e04a2a') }), []);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    let i = 0;
    for (const rope of winchRopes.values()) {
      if (i >= MAX) break;
      const mesh = g.children[i] as THREE.Mesh;
      tmp.dir.subVectors(rope.end, rope.start);
      const len = tmp.dir.length();
      mesh.visible = len > 0.01;
      mesh.position.copy(rope.start).addScaledVector(tmp.dir, 0.5);
      mesh.quaternion.setFromUnitVectors(UP, tmp.dir.normalize());
      mesh.scale.set(1, len, 1);
      materials[i].color.copy(tmp.slack).lerp(tmp.taut, rope.tensionNorm);
      i++;
    }
    for (; i < MAX; i++) g.children[i].visible = false;
  });
  return (
    <group ref={group}>
      {materials.map((m, i) => <mesh key={i} geometry={geometry} material={m} visible={false} castShadow />)}
    </group>
  );
}

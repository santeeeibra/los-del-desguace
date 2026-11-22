import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { grabbableRegistry } from '../props/grabbableRegistry';
import { sliceStore } from './sliceStore';

const Z = new THREE.Vector3(0, 0, 1);

/** Plano celeste que muestra por dónde va a pasar el corte al rebanar una pieza. */
export function SlicePlaneHologram() {
  const group = useRef<THREE.Group>(null);
  const normal = useMemo(() => new THREE.Vector3(), []);
  const fill = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#52e0f0', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false,
  }), []);
  const lines = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#bff6ff', wireframe: true, transparent: true, opacity: 0.7, depthWrite: false,
  }), []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const s = sliceStore.getState();
    const body = s.active && s.targetId ? grabbableRegistry.getById(s.targetId)?.getBody() : null;
    if (!body?.isValid()) { g.visible = false; return; }
    const n = sliceStore.normal();
    normal.set(n.x, n.y, n.z).normalize();
    const t = body.translation();
    g.visible = true;
    g.position.set(t.x, t.y, t.z).addScaledVector(normal, s.offset);
    g.quaternion.setFromUnitVectors(Z, normal);
    g.scale.setScalar(Math.max(0.6, s.radius * 2.6));
  });

  return (
    <group ref={group} visible={false} renderOrder={20}>
      <mesh material={fill}><planeGeometry args={[1, 1]} /></mesh>
      <mesh material={lines}><planeGeometry args={[1, 1, 6, 6]} /></mesh>
    </group>
  );
}

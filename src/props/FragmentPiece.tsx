import { useEffect, useMemo, type RefObject } from 'react';
import { ConvexHullCollider, type RapierCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { fragmentStore } from '../invention/fragmentStore';
import { buildFragmentGeometry } from '../invention/sliceGeometry';

const FALLBACK_POINTS: [number, number, number][] = [
  [-0.2, -0.2, -0.2], [0.2, -0.2, -0.2], [-0.2, 0.2, -0.2], [0.2, 0.2, -0.2],
  [-0.2, -0.2, 0.2], [0.2, -0.2, 0.2], [-0.2, 0.2, 0.2], [0.2, 0.2, 0.2],
];

/** Colisionador convexo de un trozo (los puntos no cambian mientras el trozo existe). */
export function FragmentCollider({ id, colliderRef }: { id: string; colliderRef: RefObject<RapierCollider | null> }) {
  const vertices = useMemo(() => {
    const points = fragmentStore.get(id)?.points ?? FALLBACK_POINTS;
    return new Float32Array(points.flat());
  }, [id]);
  return <ConvexHullCollider ref={colliderRef} args={[vertices]} />;
}

export function FragmentVisual({ id }: { id: string }) {
  const geometry = useMemo(() => {
    const record = fragmentStore.get(id);
    return buildFragmentGeometry(record?.points ?? FALLBACK_POINTS, record?.cutPlanes ?? [],
      { base: record?.base ?? [0.5, 0.5, 0.5], cut: record?.cut ?? [0.9, 0.9, 0.9] });
  }, [id]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.12 }), []);
  useEffect(() => () => { geometry?.dispose(); material.dispose(); }, [geometry, material]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

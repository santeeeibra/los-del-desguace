import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { ConvexHullCollider, type RapierCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { fragmentStore, type FragmentRecord } from '../invention/fragmentStore';
import { buildFragmentGeometry, type CutPlane, type V3 } from '../invention/sliceGeometry';
import type { GrabbableKind } from './grabbableRegistry';
import { PROP_MODEL_URLS, USE_LEGACY_PROP_VISUALS } from './propModelConfig';

const FALLBACK_POINTS: V3[] = [
  [-0.2, -0.2, -0.2], [0.2, -0.2, -0.2], [-0.2, 0.2, -0.2], [0.2, 0.2, -0.2],
  [-0.2, -0.2, 0.2], [0.2, -0.2, 0.2], [-0.2, 0.2, 0.2], [0.2, 0.2, 0.2],
];

const PROP_SCALES: Partial<Record<GrabbableKind, [number, number, number]>> = {
  wheel: [0.98, 0.98, 0.98],
  canister: [0.93, 1, 0.96],
  part: [0.84, 0.84, 0.84],
  woodBarrel: [0.98, 1, 0.98],
  chassis: [0.92, 1, 0.94],
};

/** Colisionador convexo de un trozo (los puntos no cambian mientras el trozo existe). */
export function FragmentCollider({ id, colliderRef }: { id: string; colliderRef: RefObject<RapierCollider | null> }) {
  const vertices = useMemo(() => {
    const points = fragmentStore.get(id)?.points ?? FALLBACK_POINTS;
    return new Float32Array(points.flat());
  }, [id]);
  return <ConvexHullCollider ref={colliderRef} args={[vertices]} />;
}

function ClippedPropModel({
  url,
  scale,
  sourceOffset,
  sourceQuat,
  clipPlanes,
}: {
  url: string;
  scale: [number, number, number];
  sourceOffset: V3;
  sourceQuat: [number, number, number, number];
  clipPlanes: CutPlane[];
}) {
  const { scene } = useGLTF(url, false, false);
  const rootRef = useRef<THREE.Group>(null);

  const worldPlanes = useMemo(
    () => clipPlanes.map((p) => new THREE.Plane(new THREE.Vector3(...p.n), p.d)),
    [clipPlanes],
  );
  const localNormals = useMemo(
    () => clipPlanes.map((p) => new THREE.Vector3(...p.n)),
    [clipPlanes],
  );

  const { cloned, ownedMaterials } = useMemo(() => {
    const c = scene.clone(true);
    const mats: THREE.Material[] = [];
    c.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const cloneMat = (m: THREE.Material) => {
        const next = m.clone();
        next.clippingPlanes = worldPlanes;
        next.clipShadows = true;
        mats.push(next);
        return next;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(cloneMat)
        : cloneMat(mesh.material);
    });
    return { cloned: c, ownedMaterials: mats };
  }, [scene, worldPlanes]);

  useEffect(() => () => {
    for (const m of ownedMaterials) m.dispose();
  }, [ownedMaterials]);

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    root.updateWorldMatrix(true, false);
    for (let i = 0; i < clipPlanes.length; i++) {
      worldPlanes[i].set(localNormals[i], clipPlanes[i].d).applyMatrix4(root.matrixWorld);
    }
  });

  const quat = useMemo(() => new THREE.Quaternion(...sourceQuat), [sourceQuat]);

  return (
    <group ref={rootRef}>
      <group position={sourceOffset} quaternion={quat} scale={scale}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

function SolidFragmentFallback({ record }: { record?: FragmentRecord }) {
  const geometry = useMemo(
    () =>
      buildFragmentGeometry(
        record?.points ?? FALLBACK_POINTS,
        record?.cutPlanes ?? [],
        { base: record?.base ?? [0.5, 0.5, 0.5], cut: record?.cut ?? [0.9, 0.9, 0.9] },
      ),
    [record],
  );
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.14 }),
    [],
  );
  useEffect(() => () => { geometry?.dispose(); material.dispose(); }, [geometry, material]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

export function FragmentVisual({ id }: { id: string }) {
  const record = useMemo(() => fragmentStore.get(id), [id]);
  const modelUrl = !USE_LEGACY_PROP_VISUALS && record?.sourceKind
    ? PROP_MODEL_URLS[record.sourceKind]
    : undefined;
  const canClipRealModel = Boolean(
    modelUrl && record?.clipPlanes?.length && record.sourceOffset && record.sourceQuat,
  );

  // Tapa sólida del tajo para sellar el corte del modelo 3D real sin huecos.
  const capGeometry = useMemo(() => {
    if (!canClipRealModel || !record) return null;
    return buildFragmentGeometry(
      record.points,
      record.cutPlanes,
      { base: record.base, cut: record.cut },
      true,
    );
  }, [canClipRealModel, record]);

  const capMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.12,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    [],
  );
  useEffect(() => () => { capGeometry?.dispose(); capMaterial.dispose(); }, [capGeometry, capMaterial]);

  if (!canClipRealModel || !record || !modelUrl || !record.sourceOffset || !record.sourceQuat || !record.clipPlanes) {
    return <SolidFragmentFallback record={record} />;
  }

  const scale = PROP_SCALES[record.sourceKind] ?? [1, 1, 1];

  return (
    <group>
      <Suspense fallback={<SolidFragmentFallback record={record} />}>
        <ClippedPropModel
          url={modelUrl}
          scale={scale}
          sourceOffset={record.sourceOffset}
          sourceQuat={record.sourceQuat}
          clipPlanes={record.clipPlanes}
        />
      </Suspense>
      {capGeometry && (
        <mesh geometry={capGeometry} material={capMaterial} castShadow receiveShadow />
      )}
    </group>
  );
}

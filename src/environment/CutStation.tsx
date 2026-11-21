import { useMemo, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { gameStore } from '../state/gameStore';
import { CHOPSAW_MODEL_URL } from '../props/propModelConfig';
import type { CameraTargetSource } from '../controls/ThirdPersonCamera';

/** Tronzadora del taller: abre la Mesa de Corte al acercarse y apretar E. */
export const CUT_STATION_POS: [number, number, number] = [-4.2, 0, 0.0];
const CUT_STATION_YAW = -Math.PI / 2; // frente (-Z del modelo) hacia +X, mirando al taller
const CUT_STATION_SCALE = 2.2;
const NEAR_DISTANCE = 2.7;

export function CutStation({ playerSourceRef }: { playerSourceRef: RefObject<CameraTargetSource> }) {
  const { scene } = useGLTF(CHOPSAW_MODEL_URL, false, false);
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    return c;
  }, [scene]);
  const blade = useMemo(() => model.getObjectByName('CUT_blade') ?? null, [model]);
  const playerPos = useMemo(() => new THREE.Vector3(), []);
  const spin = useMemo(() => ({ speed: 0 }), []);

  useFrame((_, dt) => {
    const has = playerSourceRef.current?.getTargetPosition(playerPos);
    const near = Boolean(has) && Math.hypot(playerPos.x - CUT_STATION_POS[0], playerPos.z - CUT_STATION_POS[2]) < NEAR_DISTANCE;
    gameStore.setNearCutStation(near);
    spin.speed += ((near ? 14 : 0) - spin.speed) * Math.min(1, dt * 3);
    if (blade && spin.speed > 0.01) blade.rotation.x += spin.speed * dt;
  });

  return (
    <RigidBody type="fixed" position={CUT_STATION_POS} rotation={[0, CUT_STATION_YAW, 0]} colliders={false}>
      <CuboidCollider args={[0.55, 0.45, 0.5]} position={[0, 0.45, 0]} />
      <group scale={CUT_STATION_SCALE}>
        <primitive object={model} />
      </group>
    </RigidBody>
  );
}

useGLTF.preload(CHOPSAW_MODEL_URL, false, false);

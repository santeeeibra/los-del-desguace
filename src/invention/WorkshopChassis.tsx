import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { Suspense, type RefObject } from 'react';
import { DoubleSide } from 'three';
import { PALETTE } from '../config/visualConfig';
import { PropModel } from '../props/PropModels';
import { PROP_MODEL_URLS, USE_LEGACY_PROP_VISUALS } from '../props/propModelConfig';
import { useGameStore } from '../state/gameStore';
import {
  DRUM_STAND_ORIGIN,
  WORKSHOP_ORIGIN,
  WORKSHOP_SLOTS,
  workshopMarkerOffset,
  type WorkshopStation,
} from './workshopAssembly';

function MountPoints({ station }: { station: WorkshopStation }) {
  const targetSlot = useGameStore((s) => s.workshopSlot);
  const aimedSlot = useGameStore((s) => s.aimedWorkshopSlot);

  return WORKSHOP_SLOTS.filter((slot) => slot.station === station).map((slot) => (
    <group key={slot.id} position={slot.position}>
      <mesh
        position={workshopMarkerOffset(slot)}
        rotation={slot.type === 'wheel' ? [0, Math.PI / 2, 0] : [-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.07, 0.11, 16]} />
        <meshBasicMaterial color={targetSlot === slot.id ? '#80efd2' : aimedSlot === slot.id ? '#ffe066' : '#b9a26a'} side={DoubleSide} />
      </mesh>
      {targetSlot === slot.id && (
        <mesh position={[0, 0.47, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.085, 0.16, 4]} />
          <meshBasicMaterial color="#ffe066" />
        </mesh>
      )}
    </group>
  ));
}

export function WorkshopChassis({ bodyRef }: { bodyRef: RefObject<RapierRigidBody | null> }) {
  const legacyMesh = (
    <group position={[0, 0.36, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.11, 2.24]} />
        <meshStandardMaterial color={PALETTE.metalDark} roughness={0.65} />
      </mesh>
      {[-0.58, 0.58].map((x) => (
        <mesh key={x} castShadow receiveShadow position={[x, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 2.22, 12]} />
          <meshStandardMaterial color={PALETTE.metalYellow} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );

  return (
    <RigidBody ref={bodyRef} type="fixed" colliders={false} position={WORKSHOP_ORIGIN} name="workshop-chassis"
      canSleep={false} ccd additionalSolverIterations={4} linearDamping={0.65} angularDamping={1.2}>
      <CuboidCollider args={[0.65, 0.055, 1.12]} position={[0, 0.36, 0]} mass={14} friction={0.65} />
      {USE_LEGACY_PROP_VISUALS || !PROP_MODEL_URLS.chassis ? (
        legacyMesh
      ) : (
        <Suspense fallback={legacyMesh}>
          <group position={[0, 0.36, 0]} scale={[1.08, 0.79, 1.11]}>
            <PropModel url={PROP_MODEL_URLS.chassis} />
          </group>
        </Suspense>
      )}
      <MountPoints station="cart" />
    </RigidBody>
  );
}

export function WorkshopDrumStand() {
  return (
    <RigidBody type="fixed" colliders={false} position={DRUM_STAND_ORIGIN} name="workshop-drum">
      <CuboidCollider args={[0.78, 0.075, 0.4]} position={[0, 0.075, 0]} />
      <mesh castShadow receiveShadow position={[0, 0.075, 0]}>
        <boxGeometry args={[1.56, 0.15, 0.8]} />
        <meshStandardMaterial color={PALETTE.metalTeal} roughness={0.67} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.32, 0.17, 0]}>
        <cylinderGeometry args={[0.27, 0.3, 0.04, 16]} />
        <meshStandardMaterial color={PALETTE.metalYellow} roughness={0.55} />
      </mesh>
      <MountPoints station="drum" />
    </RigidBody>
  );
}

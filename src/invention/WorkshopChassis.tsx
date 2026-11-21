import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { Suspense, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../config/visualConfig';
import { PropModel } from '../props/PropModels';
import { PROP_MODEL_URLS, USE_LEGACY_PROP_VISUALS } from '../props/propModelConfig';
import { vehicleFeelState } from './vehicleFeel';
import { DRUM_STAND_ORIGIN, WORKSHOP_ORIGIN } from './workshopAssembly';

export function WorkshopChassis({ bodyRef }: { bodyRef: RefObject<RapierRigidBody | null> }) {
  const chassisVisualRef = useRef<THREE.Group>(null);
  const smoothPitchRef = useRef(0);
  const smoothRollRef = useRef(0);
  const heaveYRef = useRef(0);
  const heaveVelRef = useRef(0);

  useFrame((state, rawDelta) => {
    const visual = chassisVisualRef.current;
    if (!visual) return;
    const dt = Math.min(rawDelta, 0.05);

    if (vehicleFeelState.chassisHeaveImpulse > 0.01) {
      heaveVelRef.current -= vehicleFeelState.chassisHeaveImpulse * 0.95;
      vehicleFeelState.chassisHeaveImpulse = 0;
    }

    const targetPitch = vehicleFeelState.chassisActive ? vehicleFeelState.chassisPitch : 0;
    const targetRoll = vehicleFeelState.chassisActive ? vehicleFeelState.chassisRoll : 0;
    const k = 1 - Math.exp(-11 * dt);
    smoothPitchRef.current = THREE.MathUtils.lerp(smoothPitchRef.current, targetPitch, k);
    smoothRollRef.current = THREE.MathUtils.lerp(smoothRollRef.current, targetRoll, k);

    // Damped suspension spring for landing settle (visual-only, colliders & joints stay fixed)
    const springF = -heaveYRef.current * 145 - heaveVelRef.current * 15;
    heaveVelRef.current += springF * dt;
    heaveYRef.current = THREE.MathUtils.clamp(heaveYRef.current + heaveVelRef.current * dt, -0.085, 0.028);

    const rumble = vehicleFeelState.motorRpmNorm > 0.04
      ? Math.sin(state.clock.elapsedTime * (36 + vehicleFeelState.motorRpmNorm * 32)) * 0.0022 * vehicleFeelState.motorRpmNorm
      : 0;

    visual.position.set(0, heaveYRef.current + rumble, 0);
    visual.rotation.set(smoothPitchRef.current, 0, smoothRollRef.current);
  });

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
      <group ref={chassisVisualRef}>
        {USE_LEGACY_PROP_VISUALS || !PROP_MODEL_URLS.chassis ? (
          legacyMesh
        ) : (
          <Suspense fallback={legacyMesh}>
            <group position={[0, 0.36, 0]} scale={[1.08, 0.79, 1.11]}>
              <PropModel url={PROP_MODEL_URLS.chassis} />
            </group>
          </Suspense>
        )}
      </group>
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
    </RigidBody>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';
import { getSharedTextures, PALETTE } from '../config/visualConfig';
import { grabbableRegistry, type GrabbableKind } from './grabbableRegistry';

interface SingleGrabbableProps {
  id: string;
  kind: GrabbableKind;
  position: [number, number, number];
  resetSignal: number;
}

function GrabBeacon({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  const beaconMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffe066',
        emissive: '#ffaa1d',
        emissiveIntensity: 1.25,
        roughness: 0.25,
        metalness: 0.1,
      }),
    []
  );

  useEffect(() => {
    return () => beaconMat.dispose();
  }, [beaconMat]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    g.visible = visible;
    if (!visible) return;
    const t = state.clock.elapsedTime;
    g.position.y = 0.72 + Math.sin(t * 5.2) * 0.08;
    g.rotation.y = t * 2.2;
  });

  return (
    <group ref={groupRef} position={[0, 0.72, 0]} visible={false}>
      {/* Floating glowing pointer diamond + halo ring */}
      <mesh material={beaconMat} position={[0, 0.18, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.13, 0.22, 4]} />
      </mesh>
      <mesh material={beaconMat} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.032, 8, 20]} />
      </mesh>
    </group>
  );
}

function GrabbableItem({ id, kind, position, resetSignal }: SingleGrabbableProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const highlightGroupRef = useRef<THREE.Group>(null);
  const beaconVisibleRef = useRef(false);
  const beaconHolderRef = useRef<THREE.Group>(null);
  const textures = useMemo(() => getSharedTextures(), []);

  const materials = useMemo(
    () => ({
      crateWood: new THREE.MeshStandardMaterial({
        map: textures.crateStencilMap,
        roughness: 0.84,
        metalness: 0.02,
      }),
      bracket: new THREE.MeshStandardMaterial({
        color: PALETTE.metalDark,
        roughness: 0.52,
        metalness: 0.68,
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: PALETTE.rubberTire,
        roughness: 0.92,
        metalness: 0.03,
      }),
      rimYellow: new THREE.MeshStandardMaterial({
        color: PALETTE.metalYellow,
        roughness: 0.44,
        metalness: 0.35,
      }),
      canisterTeal: new THREE.MeshStandardMaterial({
        color: PALETTE.metalTeal,
        roughness: 0.42,
        metalness: 0.45,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: PALETTE.brass,
        roughness: 0.28,
        metalness: 0.88,
      }),
      highlightRing: new THREE.MeshBasicMaterial({
        color: '#ffe066',
        transparent: true,
        opacity: 0.85,
      }),
    }),
    [textures]
  );

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [materials]);

  useEffect(() => {
    const posVec = new THREE.Vector3();
    grabbableRegistry.register({
      id,
      kind,
      initialPos: position,
      getBody: () => bodyRef.current,
      getCollider: () => colliderRef.current,
      getWorldPos: (out: THREE.Vector3) => {
        const b = bodyRef.current;
        if (!b) return false;
        const t = b.translation();
        posVec.set(t.x, t.y, t.z);
        out.copy(posVec);
        return true;
      },
    });
    return () => {
      grabbableRegistry.unregister(id);
    };
  }, [id, kind, position]);

  useEffect(() => {
    const b = bodyRef.current;
    const c = colliderRef.current;
    if (!b) return;
    b.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
    b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (c) c.setSensor(false);
  }, [resetSignal, position]);

  useFrame((state) => {
    const isTarget = grabbableRegistry.highlightedId === id && grabbableRegistry.carriedId === null;
    beaconVisibleRef.current = isTarget;

    if (beaconHolderRef.current && bodyRef.current) {
      const t = bodyRef.current.translation();
      beaconHolderRef.current.position.set(t.x, t.y, t.z);
      beaconHolderRef.current.visible = isTarget;
    }

    if (highlightGroupRef.current) {
      highlightGroupRef.current.visible = isTarget;
      if (isTarget) {
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 7) * 0.06;
        highlightGroupRef.current.scale.set(pulse, 1, pulse);
      }
    }
  });

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="dynamic"
        position={position}
        mass={kind === 'crate' ? 4 : 3.5}
        linearDamping={0.6}
        angularDamping={0.8}
        restitution={0.18}
        friction={0.9}
        colliders={false}
        userData={{ ecctrl: { excludeRay: true }, grabbableId: id }}
        name={`grabbable-${id}`}
      >
        {kind === 'crate' && (
          <>
            <CuboidCollider ref={colliderRef} args={[0.32, 0.32, 0.32]} />
            <group>
              <mesh castShadow receiveShadow material={materials.crateWood}>
                <boxGeometry args={[0.64, 0.64, 0.64]} />
              </mesh>
              {/* Corner iron brackets for silhouette clarity */}
              <mesh castShadow material={materials.bracket} position={[0, 0.3, 0]}>
                <boxGeometry args={[0.67, 0.06, 0.67]} />
              </mesh>
              <mesh castShadow material={materials.bracket} position={[0, -0.3, 0]}>
                <boxGeometry args={[0.67, 0.06, 0.67]} />
              </mesh>
            </group>
          </>
        )}

        {kind === 'wheel' && (
          <>
            <CylinderCollider ref={colliderRef} args={[0.14, 0.36]} rotation={[Math.PI / 2, 0, 0]} />
            <group rotation={[Math.PI / 2, 0, 0]}>
              <mesh castShadow receiveShadow material={materials.rubber}>
                <cylinderGeometry args={[0.36, 0.36, 0.26, 18]} />
              </mesh>
              <mesh castShadow material={materials.rimYellow}>
                <cylinderGeometry args={[0.2, 0.2, 0.28, 12]} />
              </mesh>
              <mesh castShadow material={materials.bracket}>
                <cylinderGeometry args={[0.07, 0.07, 0.31, 8]} />
              </mesh>
            </group>
          </>
        )}

        {kind === 'canister' && (
          <>
            <CylinderCollider ref={colliderRef} args={[0.33, 0.24]} />
            <group>
              <mesh castShadow receiveShadow material={materials.canisterTeal}>
                <cylinderGeometry args={[0.24, 0.24, 0.64, 14]} />
              </mesh>
              <mesh castShadow material={materials.brass} position={[0, 0.24, 0]}>
                <cylinderGeometry args={[0.255, 0.255, 0.07, 14]} />
              </mesh>
              <mesh castShadow material={materials.brass} position={[0, -0.24, 0]}>
                <cylinderGeometry args={[0.255, 0.255, 0.07, 14]} />
              </mesh>
              {/* Carry handle */}
              <mesh castShadow material={materials.bracket} position={[0, 0.36, 0]}>
                <boxGeometry args={[0.24, 0.08, 0.06]} />
              </mesh>
            </group>
          </>
        )}

        {/* Local highlight ring around object base when targeted */}
        <group ref={highlightGroupRef} visible={false} position={[0, -0.28, 0]}>
          <mesh material={materials.highlightRing} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.42, 0.5, 24]} />
          </mesh>
        </group>
      </RigidBody>

      {/* World-aligned non-rotating beacon floating above the targeted object */}
      <group ref={beaconHolderRef} visible={false}>
        <GrabBeacon visible />
      </group>
    </>
  );
}

export function GrabbableProps({ resetSignal }: { resetSignal: number }) {
  return (
    <group name="grabbable-props">
      <GrabbableItem id="crate-1" kind="crate" position={[-0.4, 0.4, 1.4]} resetSignal={resetSignal} />
      <GrabbableItem id="wheel-1" kind="wheel" position={[1.1, 0.45, 1.9]} resetSignal={resetSignal} />
      <GrabbableItem id="crate-2" kind="crate" position={[6.1, 1.45, 2.2]} resetSignal={resetSignal} />
      <GrabbableItem id="wheel-2" kind="wheel" position={[-3.3, 0.45, -4.6]} resetSignal={resetSignal} />
      <GrabbableItem id="canister-1" kind="canister" position={[-1.4, 0.45, -3.5]} resetSignal={resetSignal} />
    </group>
  );
}

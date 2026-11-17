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
  rotation?: [number, number, number];
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
      <mesh material={beaconMat} position={[0, 0.18, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.13, 0.22, 4]} />
      </mesh>
      <mesh material={beaconMat} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.032, 8, 20]} />
      </mesh>
    </group>
  );
}

const PHYSICS_PROPS: Record<
  GrabbableKind,
  {
    mass: number;
    linearDamping: number;
    angularDamping: number;
    restitution: number;
    friction: number;
  }
> = {
  // Cajas: pesadas, fricción alta, casi sin rebote para apilarse con estabilidad
  crate: {
    mass: 6.0,
    linearDamping: 0.9,
    angularDamping: 1.6,
    restitution: 0.03,
    friction: 1.15,
  },
  // Ruedas: baja amortiguación angular y rebote medio para rodar y rebotar suave
  wheel: {
    mass: 3.4,
    linearDamping: 0.22,
    angularDamping: 0.15,
    restitution: 0.36,
    friction: 0.95,
  },
  // Bidones: cilíndricos altos, fáciles de tumbar y rodar de costado
  canister: {
    mass: 4.5,
    linearDamping: 0.45,
    angularDamping: 0.32,
    restitution: 0.12,
    friction: 0.75,
  },
  // Pieza de repuesto (batería / bloque bobina): compacta y firme
  part: {
    mass: 4.2,
    linearDamping: 0.75,
    angularDamping: 1.1,
    restitution: 0.08,
    friction: 1.0,
  },
};

function GrabbableItem({
  id,
  kind,
  position,
  rotation = [0, 0, 0],
  resetSignal,
}: SingleGrabbableProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const highlightGroupRef = useRef<THREE.Group>(null);
  const beaconHolderRef = useRef<THREE.Group>(null);
  const textures = useMemo(() => getSharedTextures(), []);

  const materials = useMemo(
    () => ({
      crateWood: new THREE.MeshStandardMaterial({
        map: textures.crateStencilMap,
        roughness: 0.84,
        metalness: 0.02,
      }),
      woodTrim: new THREE.MeshStandardMaterial({
        color: PALETTE.woodDark,
        roughness: 0.88,
        metalness: 0.0,
      }),
      bracket: new THREE.MeshStandardMaterial({
        color: PALETTE.metalDark,
        roughness: 0.52,
        metalness: 0.68,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: PALETTE.metalSteel,
        roughness: 0.3,
        metalness: 0.88,
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
        roughness: 0.45,
        metalness: 0.4,
      }),
      redPaint: new THREE.MeshStandardMaterial({
        color: PALETTE.metalRed,
        roughness: 0.46,
        metalness: 0.3,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: PALETTE.brass,
        roughness: 0.28,
        metalness: 0.88,
      }),
      copper: new THREE.MeshStandardMaterial({
        color: '#c96f3b',
        roughness: 0.32,
        metalness: 0.85,
      }),
      hazard: new THREE.MeshStandardMaterial({
        map: textures.hazardMap,
        roughness: 0.65,
        metalness: 0.1,
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
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    b.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
    b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (c) {
      c.setSensor(false);
      c.setEnabled(true);
    }
  }, [resetSignal, position, rotation]);

  useFrame((state) => {
    const isTarget = grabbableRegistry.highlightedId === id && grabbableRegistry.carriedId === null;

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

  const phys = PHYSICS_PROPS[kind];

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="dynamic"
        position={position}
        rotation={rotation}
        mass={phys.mass}
        linearDamping={phys.linearDamping}
        angularDamping={phys.angularDamping}
        restitution={phys.restitution}
        friction={phys.friction}
        colliders={false}
        userData={{ ecctrl: { excludeRay: true }, grabbableId: id }}
        name={`grabbable-${id}`}
      >
        {/* CAJA APILABLE: cuerpo plano estable + refuerzos de madera y esquineros */}
        {kind === 'crate' && (
          <>
            <CuboidCollider ref={colliderRef} args={[0.32, 0.3, 0.32]} />
            <group>
              <mesh castShadow receiveShadow material={materials.crateWood}>
                <boxGeometry args={[0.62, 0.58, 0.62]} />
              </mesh>
              <mesh castShadow material={materials.woodTrim} position={[0, 0.27, 0]}>
                <boxGeometry args={[0.65, 0.06, 0.65]} />
              </mesh>
              <mesh castShadow material={materials.woodTrim} position={[0, -0.27, 0]}>
                <boxGeometry args={[0.65, 0.06, 0.65]} />
              </mesh>
              {/* Metal corner straps */}
              <mesh castShadow material={materials.bracket} position={[0.305, 0, 0.305]}>
                <boxGeometry args={[0.04, 0.6, 0.04]} />
              </mesh>
              <mesh castShadow material={materials.bracket} position={[-0.305, 0, 0.305]}>
                <boxGeometry args={[0.04, 0.6, 0.04]} />
              </mesh>
              <mesh castShadow material={materials.bracket} position={[0.305, 0, -0.305]}>
                <boxGeometry args={[0.04, 0.6, 0.04]} />
              </mesh>
              <mesh castShadow material={materials.bracket} position={[-0.305, 0, -0.305]}>
                <boxGeometry args={[0.04, 0.6, 0.04]} />
              </mesh>
            </group>
          </>
        )}

        {/* RUEDA QUE RUEDA: cilindro apoyado sobre su banda de rodamiento (eje X) */}
        {kind === 'wheel' && (
          <>
            <CylinderCollider ref={colliderRef} args={[0.14, 0.38]} rotation={[0, 0, Math.PI / 2]} />
            <group>
              <mesh castShadow receiveShadow material={materials.rubber} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.38, 0.38, 0.26, 20]} />
              </mesh>
              {/* Tread ribs for visible rolling spin */}
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const a = (idx / 6) * Math.PI * 2;
                return (
                  <mesh
                    key={idx}
                    material={materials.rubber}
                    position={[0, Math.cos(a) * 0.37, Math.sin(a) * 0.37]}
                    rotation={[a, 0, 0]}
                  >
                    <boxGeometry args={[0.27, 0.04, 0.07]} />
                  </mesh>
                );
              })}
              <mesh castShadow material={materials.rimYellow} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.21, 0.21, 0.28, 14]} />
              </mesh>
              <mesh castShadow material={materials.steel} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.075, 0.075, 0.31, 10]} />
              </mesh>
            </group>
          </>
        )}

        {/* BIDÓN TUMBABLE: más esbelto y fácil de volcar y rodar de costado */}
        {kind === 'canister' && (
          <>
            <CylinderCollider ref={colliderRef} args={[0.38, 0.22]} />
            <group>
              <mesh castShadow receiveShadow material={materials.canisterTeal}>
                <cylinderGeometry args={[0.22, 0.22, 0.74, 16]} />
              </mesh>
              <mesh material={materials.hazard} position={[0, 0.08, 0]}>
                <cylinderGeometry args={[0.226, 0.226, 0.16, 16]} />
              </mesh>
              <mesh castShadow material={materials.bracket} position={[0, 0.26, 0]}>
                <cylinderGeometry args={[0.232, 0.232, 0.04, 16]} />
              </mesh>
              <mesh castShadow material={materials.bracket} position={[0, -0.26, 0]}>
                <cylinderGeometry args={[0.232, 0.232, 0.04, 16]} />
              </mesh>
              <mesh castShadow material={materials.brass} position={[0.08, 0.4, 0]}>
                <cylinderGeometry args={[0.045, 0.045, 0.06, 10]} />
              </mesh>
              <mesh castShadow material={materials.redPaint} position={[-0.06, 0.4, 0]}>
                <boxGeometry args={[0.14, 0.06, 0.05]} />
              </mesh>
            </group>
          </>
        )}

        {/* PIEZA DE REPUESTO TRANSPORTABLE (Módulo de bobina/batería) */}
        {kind === 'part' && (
          <>
            <CuboidCollider ref={colliderRef} args={[0.27, 0.23, 0.23]} />
            <group>
              <mesh castShadow receiveShadow material={materials.redPaint}>
                <boxGeometry args={[0.52, 0.42, 0.44]} />
              </mesh>
              <mesh castShadow material={materials.bracket} position={[0, 0.22, 0]}>
                <boxGeometry args={[0.54, 0.06, 0.46]} />
              </mesh>
              <mesh castShadow material={materials.copper} position={[-0.12, 0.28, 0]}>
                <cylinderGeometry args={[0.08, 0.08, 0.12, 12]} />
              </mesh>
              <mesh castShadow material={materials.brass} position={[0.14, 0.28, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.1, 10]} />
              </mesh>
              <mesh castShadow material={materials.steel} position={[0, 0, 0.23]}>
                <boxGeometry args={[0.36, 0.2, 0.04]} />
              </mesh>
            </group>
          </>
        )}

        <group ref={highlightGroupRef} visible={false} position={[0, -0.28, 0]}>
          <mesh material={materials.highlightRing} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.42, 0.5, 24]} />
          </mesh>
        </group>
      </RigidBody>

      <group ref={beaconHolderRef} visible={false}>
        <GrabBeacon visible />
      </group>
    </>
  );
}

export function GrabbableProps({ resetSignal }: { resetSignal: number }) {
  return (
    <group name="grabbable-props">
      {/* Cajas apilables cerca del taller y muelle de carga */}
      <GrabbableItem id="crate-1" kind="crate" position={[-0.4, 0.35, 1.4]} resetSignal={resetSignal} />
      <GrabbableItem id="crate-2" kind="crate" position={[-0.4, 0.96, 1.4]} resetSignal={resetSignal} />
      <GrabbableItem id="crate-3" kind="crate" position={[6.1, 1.45, 2.2]} resetSignal={resetSignal} />

      {/* Ruedas apoyadas en vertical listas para rodar */}
      <GrabbableItem id="wheel-1" kind="wheel" position={[1.25, 0.4, 2.1]} rotation={[0, 0.3, 0]} resetSignal={resetSignal} />
      <GrabbableItem id="wheel-2" kind="wheel" position={[-3.3, 0.4, -4.4]} rotation={[0, -0.5, 0]} resetSignal={resetSignal} />

      {/* Bidones tumbables */}
      <GrabbableItem id="canister-1" kind="canister" position={[-1.55, 0.4, -3.2]} resetSignal={resetSignal} />
      <GrabbableItem id="canister-2" kind="canister" position={[-2.9, 0.4, 3.3]} resetSignal={resetSignal} />

      {/* Pieza de repuesto */}
      <GrabbableItem id="part-1" kind="part" position={[-4.2, 1.22, -6.1]} resetSignal={resetSignal} />

      {/* Objetos adicionales en el Patio de Chatarra (Zona Oeste) */}
      <GrabbableItem id="crate-4" kind="crate" position={[-15.2, 0.35, 2.2]} resetSignal={resetSignal} />
      <GrabbableItem id="crate-5" kind="crate" position={[-15.9, 0.35, 2.9]} resetSignal={resetSignal} />
      <GrabbableItem id="wheel-3" kind="wheel" position={[-13.2, 0.4, 5.2]} rotation={[0, 0.8, 0]} resetSignal={resetSignal} />
      <GrabbableItem id="canister-3" kind="canister" position={[-14.5, 0.4, -0.6]} resetSignal={resetSignal} />
      <GrabbableItem id="part-2" kind="part" position={[-16.8, 0.78, -2.5]} resetSignal={resetSignal} />
    </group>
  );
}

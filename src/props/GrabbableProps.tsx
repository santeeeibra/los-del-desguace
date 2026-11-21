import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';
import { PlatformColliders, PlatformVisual } from './PlatformPiece';
import { sceneCutStore } from '../invention/sceneCut';
import { getSharedTextures, PALETTE } from '../config/visualConfig';
import { starterPartPosition, stockedPartPosition } from '../environment/workshopLayout';
import { sampleMountSettle, vehicleFeelState } from '../invention/vehicleFeel';
import { BOXING_REACH, boxingExtension, getPartLogicOutput } from '../logic/contraptionRegistry';
import { BOWLING_BARREL_IDS } from '../modes/contracts';
import { gameStore, useGameStore } from '../state/gameStore';
import { PropEffect } from './CrazyPropEffects';
import { grabbableRegistry, NEW_PROP_BOUNDS, type GrabbableKind } from './grabbableRegistry';
import { PropModel } from './PropModels';
import { PROP_MODEL_URLS, USE_LEGACY_PROP_VISUALS } from './propModelConfig';

interface SingleGrabbableProps {
  id: string;
  kind: GrabbableKind;
  position: [number, number, number];
  rotation?: [number, number, number];
  resetSignal: number;
}

const UNROTATED: [number, number, number] = [0, 0, 0];

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

const BATTERY_SPARK_COUNT = 8;

function BatterySparks({
  seed,
  burstSignalRef,
  itemId,
}: {
  seed: number;
  burstSignalRef: React.MutableRefObject<number>;
  itemId: string;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffe66d',
        emissive: '#ff9b21',
        emissiveIntensity: 2.2,
        roughness: 0.2,
        metalness: 0.1,
      }),
    []
  );
  const sparks = useMemo(
    () =>
      Array.from({ length: BATTERY_SPARK_COUNT }, () => ({
        age: 1,
        life: 0.25,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
      })),
    []
  );
  const timerRef = useRef((seed % 10) * 0.17);
  const lastSignalRef = useRef(0);

  useEffect(() => () => mat.dispose(), [mat]);

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh || gameStore.getState().inventorySlots.some((item) => item?.id === itemId)) return;
    const dt = Math.min(rawDelta, 0.05);
    timerRef.current -= dt;
    const triggered = burstSignalRef.current !== lastSignalRef.current;
    if (triggered || timerRef.current <= 0) {
      lastSignalRef.current = burstSignalRef.current;
      timerRef.current = 0.9 + Math.random() * 1.4;
      const terminalX = Math.random() < 0.5 ? -0.14 : 0.14;
      for (const s of sparks) {
        s.age = 0;
        s.life = 0.16 + Math.random() * 0.18;
        s.pos.set(terminalX + (Math.random() - 0.5) * 0.04, 0.24, -0.085 + (Math.random() - 0.5) * 0.04);
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.7 + Math.random() * 1.5;
        s.vel.set(Math.cos(angle) * speed, 1.1 + Math.random() * 1.4, Math.sin(angle) * speed);
      }
    }
    for (let i = 0; i < BATTERY_SPARK_COUNT; i++) {
      const s = sparks[i];
      if (s.age >= s.life) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      s.age += dt;
      s.vel.y -= 7.5 * dt;
      s.pos.addScaledVector(s.vel, dt);
      const t = 1 - s.age / s.life;
      dummy.position.copy(s.pos);
      dummy.scale.setScalar(0.022 * t);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, BATTERY_SPARK_COUNT]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={mat} attach="material" />
    </instancedMesh>
  );
}

function FanBlades({ id, bladeMat, hubMat, idleSpeed = 2.2 }: {
  id: string; bladeMat: THREE.Material; hubMat: THREE.Material; idleSpeed?: number;
}) {
  const rotorRef = useRef<THREE.Group>(null);
  useFrame((_, rawDelta) => {
    const rotor = rotorRef.current;
    if (!rotor) return;
    const dt = Math.min(rawDelta, 0.05);
    const active = Math.abs(getPartLogicOutput(id)) > 0.05;
    rotor.rotation.y += (active ? 22 : idleSpeed) * dt;
  });
  return (
    <group ref={rotorRef}>
      <mesh castShadow material={hubMat}>
        <cylinderGeometry args={[0.055, 0.065, 0.14, 10]} />
      </mesh>
      {[0, 1, 2, 3].map((idx) => (
        <group key={idx} rotation={[0, (idx * Math.PI) / 2, 0]}>
          <mesh castShadow material={bladeMat} position={[0.125, 0, 0]} rotation={[0.42, 0, 0]}>
            <boxGeometry args={[0.18, 0.018, 0.068]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function BoxingGloveVisual({ id, glove, steel }: { id: string; glove: THREE.Material; steel: THREE.Material }) {
  const fist = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const reach = boxingExtension(id) * (BOXING_REACH - 0.3);
    if (fist.current) fist.current.position.z = 0.16 + reach;
    if (rod.current) {
      rod.current.position.z = 0.1 + reach / 2;
      rod.current.scale.y = 0.15 + reach;
    }
  });
  return (
    <>
      <mesh castShadow material={steel} position={[0, 0, -0.12]}>
        <boxGeometry args={[0.24, 0.23, 0.31]} />
      </mesh>
      <mesh ref={rod} castShadow material={steel} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.042, 0.042, 1, 8]} />
      </mesh>
      <group ref={fist} position={[0, 0, 0.16]}>
        <mesh castShadow material={glove} scale={[1.04, 0.9, 1]}>
          <sphereGeometry args={[0.13, 12, 8]} />
        </mesh>
        <mesh castShadow material={glove} position={[0.092, -0.058, 0.012]}>
          <sphereGeometry args={[0.064, 10, 8]} />
        </mesh>
      </group>
    </>
  );
}

function GyroVisual({
  baseMat,
  brassMat,
  tealMat,
}: {
  baseMat: THREE.Material;
  brassMat: THREE.Material;
  tealMat: THREE.Material;
}) {
  const outerRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const coreMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffe066',
        emissive: '#ffaa1d',
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.2,
      }),
    []
  );

  useEffect(() => () => coreMat.dispose(), [coreMat]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    if (outerRingRef.current) outerRingRef.current.rotation.y += 1.8 * dt;
    if (innerRingRef.current) {
      innerRingRef.current.rotation.x += 2.7 * dt;
      innerRingRef.current.rotation.z += 1.4 * dt;
    }
  });

  return (
    <group>
      <mesh castShadow receiveShadow material={baseMat} position={[0, -0.15, 0]}>
        <boxGeometry args={[0.36, 0.08, 0.36]} />
      </mesh>
      <mesh castShadow material={baseMat} position={[-0.14, 0, 0]}>
        <boxGeometry args={[0.05, 0.28, 0.06]} />
      </mesh>
      <mesh castShadow material={baseMat} position={[0.14, 0, 0]}>
        <boxGeometry args={[0.05, 0.28, 0.06]} />
      </mesh>
      <mesh ref={outerRingRef} castShadow material={brassMat} position={[0, 0.02, 0]}>
        <torusGeometry args={[0.145, 0.022, 8, 22]} />
      </mesh>
      <mesh ref={innerRingRef} castShadow material={tealMat} position={[0, 0.02, 0]} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[0.105, 0.02, 8, 20]} />
      </mesh>
      <mesh material={coreMat} position={[0, 0.02, 0]}>
        <sphereGeometry args={[0.055, 12, 10]} />
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
    mass: 14.0,
    linearDamping: 0.9,
    angularDamping: 1.6,
    restitution: 0.03,
    friction: 1.15,
  },
  // Ruedas: baja amortiguación angular y rebote medio para rodar y rebotar suave
  wheel: {
    mass: 3.4,
    linearDamping: 0.22,
    angularDamping: 0.25,
    restitution: 0.14,
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
  battery: { mass: 4.2, linearDamping: 0.75, angularDamping: 1.1, restitution: 0.08, friction: 1.0 },
  woodBarrel: { mass: 6, linearDamping: 0.5, angularDamping: 0.35, restitution: 0.09, friction: 0.82 },
  wing: { mass: 2.8, linearDamping: 0.12, angularDamping: 0.8, restitution: 0.05, friction: 0.7 },
  headlight: { mass: 2.0, linearDamping: 0.65, angularDamping: 1.0, restitution: 0.08, friction: 0.9 },
  seat: { mass: 3.6, linearDamping: 0.7, angularDamping: 1.1, restitution: 0.06, friction: 0.95 },
  thruster: { mass: 3.8, linearDamping: 0.18, angularDamping: 0.45, restitution: 0.1, friction: 0.85 },
  chassis: { mass: 12, linearDamping: 0.75, angularDamping: 1.1, restitution: 0.06, friction: 0.9 },
  cargoRack: { mass: 4.5, linearDamping: 0.7, angularDamping: 1.0, restitution: 0.08, friction: 0.9 },
  timerBox: { mass: 2.2, linearDamping: 0.7, angularDamping: 1.0, restitution: 0.05, friction: 0.95 },
  switchBox: { mass: 2.0, linearDamping: 0.7, angularDamping: 1.0, restitution: 0.05, friction: 0.95 },
  logicAnd: { mass: 2.1, linearDamping: 0.7, angularDamping: 1.0, restitution: 0.05, friction: 0.95 },
  magnet: { mass: 3.6, linearDamping: 0.65, angularDamping: 1.0, restitution: 0.06, friction: 0.95 },
  spring: { mass: 2.6, linearDamping: 0.55, angularDamping: 0.9, restitution: 0.35, friction: 0.85 },
  balloon: { mass: 0.7, linearDamping: 0.85, angularDamping: 1.4, restitution: 0.25, friction: 0.45 },
  fan: { mass: 3.0, linearDamping: 0.35, angularDamping: 0.7, restitution: 0.08, friction: 0.85 },
  horn: { mass: 2.2, linearDamping: 0.65, angularDamping: 0.95, restitution: 0.08, friction: 0.9 },
  gyro: { mass: 2.6, linearDamping: 0.35, angularDamping: 1.6, restitution: 0.08, friction: 0.9 },
  boxingGlove: { mass: 3, linearDamping: 0.6, angularDamping: 0.9, restitution: 0.08, friction: 0.9 },
  droneRotor: { mass: 1.4, linearDamping: 0.38, angularDamping: 0.8, restitution: 0.08, friction: 0.85 },
  // Plataforma de la Mesa de Corte: la masa real sale del área de chapa (ver platformStore).
  platform: { mass: 8, linearDamping: 0.7, angularDamping: 1.1, restitution: 0.05, friction: 0.9 },
  flag: { mass: 0.6, linearDamping: 0.5, angularDamping: 0.9, restitution: 0.08, friction: 0.8 },
};

function PropVisual({ kind, fallback, scale = 1 }: {
  kind: GrabbableKind;
  fallback: React.ReactNode;
  scale?: number | [number, number, number];
}) {
  const url = PROP_MODEL_URLS[kind];
  if (USE_LEGACY_PROP_VISUALS || !url) return fallback;
  return (
    <Suspense fallback={fallback}>
      <group scale={scale}><PropModel url={url} /></group>
    </Suspense>
  );
}

function GrabbableItem({
  id,
  kind,
  position,
  rotation = UNROTATED,
  resetSignal,
}: SingleGrabbableProps) {
  const { rapier } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const appliedSpawn = useRef<{ body: RapierRigidBody; key: string } | null>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const visualGroupRef = useRef<THREE.Group>(null);
  const artworkGroupRef = useRef<THREE.Group>(null);
  const settleTargetPosRef = useRef(new THREE.Vector3());
  const settleTargetQuatRef = useRef(new THREE.Quaternion());
  const highlightGroupRef = useRef<THREE.Group>(null);
  const cyanGlowRef = useRef<THREE.Group>(null);
  const beaconHolderRef = useRef<THREE.Group>(null);
  const sparkBurstRef = useRef(0);
  const idSeed = useMemo(() => id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0), [id]);
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
      getVisualGroup: () => visualGroupRef.current,
      getWorldPos: (out: THREE.Vector3) => {
        const b = bodyRef.current;
        if (!b || !b.isValid()) return false;
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
    const key = [resetSignal, ...position, ...rotation].join(',');
    if (appliedSpawn.current?.body === b && appliedSpawn.current.key === key) return;
    appliedSpawn.current = { body: b, key };
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    b.setEnabled(true);
    b.setBodyType(rapier.RigidBodyType.Dynamic, true);
    b.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
    b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (c) {
      c.setSensor(false);
      c.setEnabled(true);
    }
    if (visualGroupRef.current) {
      visualGroupRef.current.position.set(position[0], position[1], position[2]);
      visualGroupRef.current.quaternion.copy(q);
    }
  }, [resetSignal, position, rotation, rapier]);

  useFrame((state) => {
    const isCarried = grabbableRegistry.carriedId === id;
    const isStored = gameStore.getState().inventorySlots.some((item) => item?.id === id);
    const isTarget = !isStored && grabbableRegistry.highlightedId === id && grabbableRegistry.carriedId === null &&
      !sceneCutStore.isActive();

    if (!isCarried && !isStored && bodyRef.current?.isValid() && bodyRef.current.isEnabled() && bodyRef.current.isDynamic()) {
      const b = bodyRef.current;
      const t = b.translation();
      if (t.y > 65) {
        const lv = b.linvel();
        b.setTranslation({ x: t.x, y: 64, z: t.z }, true);
        if (lv.y > 0) b.setLinvel({ x: lv.x, y: 0, z: lv.z }, true);
      } else if (t.y < -10 || Math.abs(t.x) > 150 || Math.abs(t.z) > 150 || !Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)) {
        b.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }

    if (visualGroupRef.current) {
      visualGroupRef.current.visible = !isStored;
      if (isCarried) {
        visualGroupRef.current.position.copy(grabbableRegistry.carriedVisualPos);
        visualGroupRef.current.quaternion.copy(grabbableRegistry.carriedVisualQuat);
        visualGroupRef.current.scale.setScalar(1);
      } else if (bodyRef.current) {
        const t = bodyRef.current.translation();
        const r = bodyRef.current.rotation();
        settleTargetPosRef.current.set(t.x, t.y, t.z);
        settleTargetQuatRef.current.set(r.x, r.y, r.z, r.w);
        const settle = sampleMountSettle(
          id,
          performance.now() / 1000,
          settleTargetPosRef.current,
          settleTargetQuatRef.current,
          visualGroupRef.current.position,
          visualGroupRef.current.quaternion,
        );
        visualGroupRef.current.scale.setScalar(settle.scale);
      }
    }

    if (artworkGroupRef.current) {
      if (kind === 'part' && !isCarried && !isStored && vehicleFeelState.motorRpmNorm > 0.03 &&
        (vehicleFeelState.driveMotor === id || vehicleFeelState.benchMotors?.has(id))) {
        const vib = vehicleFeelState.motorRpmNorm;
        const elapsed = state.clock.elapsedTime;
        const freq = 34 + vib * 36;
        artworkGroupRef.current.position.set(
          Math.sin(elapsed * freq) * 0.0045 * vib,
          Math.cos(elapsed * freq * 1.37) * 0.0038 * vib,
          Math.sin(elapsed * freq * 0.83) * 0.0032 * vib,
        );
        artworkGroupRef.current.rotation.set(
          Math.sin(elapsed * freq * 1.1) * 0.012 * vib,
          0,
          Math.cos(elapsed * freq * 0.95) * 0.015 * vib,
        );
      } else if (
        artworkGroupRef.current.position.lengthSq() > 0 ||
        artworkGroupRef.current.rotation.x !== 0 ||
        artworkGroupRef.current.rotation.z !== 0
      ) {
        artworkGroupRef.current.position.set(0, 0, 0);
        artworkGroupRef.current.rotation.set(0, 0, 0);
      }
    }

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

    if (cyanGlowRef.current) {
      const hud = gameStore.getState();
      const isWiringTarget =
        hud.pendingWireFrom === id ||
        (hud.wrenchAiming && hud.pendingWireFrom !== null && grabbableRegistry.highlightedId === id);
      const isCyanActive = !isStored && (hud.rotatingTargetId === id || isWiringTarget);
      cyanGlowRef.current.visible = isCyanActive;
      if (isCyanActive) {
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.1;
        cyanGlowRef.current.scale.set(pulse, 1, pulse);
      }
    }
  });

  const phys = PHYSICS_PROPS[kind];

  // Primitivas originales: fallback mientras carga el GLB y modo comparación (?props=legacy)
  const legacyCrate = (
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
  );

  const legacyCanister = (
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
  );

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="dynamic"
        position={position}
        rotation={rotation}
        mass={kind === 'platform' ? undefined : phys.mass}
        linearDamping={phys.linearDamping}
        angularDamping={phys.angularDamping}
        restitution={phys.restitution}
        friction={phys.friction}
        colliders={false}
        userData={{ ecctrl: { excludeRay: true }, grabbableId: id }}
        name={`grabbable-${id}`}
        onCollisionEnter={() => {
          if (kind === 'battery' && bodyRef.current) {
            const v = bodyRef.current.linvel();
            if (Math.hypot(v.x, v.y, v.z) > 0.65) {
              sparkBurstRef.current += 1;
            }
          }
        }}
      >
        {kind === 'crate' && <CuboidCollider ref={colliderRef} args={[0.32, 0.3, 0.32]} />}
        {(kind === 'timerBox' || kind === 'switchBox' || kind === 'logicAnd') && (
          <CuboidCollider ref={colliderRef} args={[0.18, 0.14, 0.18]} />
        )}
        {kind === 'magnet' && <CuboidCollider ref={colliderRef} args={[0.22, 0.16, 0.22]} />}
        {kind === 'wheel' && (
          <CylinderCollider ref={colliderRef} args={[0.14, 0.38]} rotation={[0, 0, Math.PI / 2]} />
        )}
        {kind === 'canister' && <CylinderCollider ref={colliderRef} args={[0.38, 0.22]} />}
        {kind === 'woodBarrel' && <CylinderCollider ref={colliderRef} args={[0.48, 0.36]} />}
        {(kind === 'part' || kind === 'battery') && <CuboidCollider ref={colliderRef} args={[0.27, 0.23, 0.23]} />}
        {kind === 'wing' && <CuboidCollider ref={colliderRef} args={[0.55, 0.07, 0.24]} />}
        {kind === 'headlight' && <CuboidCollider ref={colliderRef} args={[0.15, 0.17, 0.16]} />}
        {kind === 'seat' && <CuboidCollider ref={colliderRef} args={[0.25, 0.31, 0.26]} />}
        {kind === 'thruster' && <CylinderCollider ref={colliderRef} args={[0.34, 0.16]} />}
        {kind === 'chassis' && <CuboidCollider ref={colliderRef} args={[0.55, 0.08, 0.95]} />}
        {kind === 'cargoRack' && <CuboidCollider ref={colliderRef} args={[0.46, 0.12, 0.36]} />}
        {kind === 'spring' && <CylinderCollider ref={colliderRef} args={[0.22, 0.18]} />}
        {kind === 'balloon' && <CylinderCollider ref={colliderRef} args={[0.34, 0.28]} />}
        {kind === 'fan' && <CylinderCollider ref={colliderRef} args={[0.16, 0.26]} />}
        {kind === 'horn' && <CuboidCollider ref={colliderRef} args={[0.18, 0.16, 0.24]} />}
        {kind === 'gyro' && <CuboidCollider ref={colliderRef} args={[0.2, 0.2, 0.2]} />}
        {(kind === 'boxingGlove' || kind === 'droneRotor' || kind === 'flag') && (
          <CuboidCollider ref={colliderRef} args={[...NEW_PROP_BOUNDS[kind]]} />
        )}
        {kind === 'platform' && <PlatformColliders id={id} colliderRef={colliderRef} bodyRef={bodyRef} />}
      </RigidBody>

      {/* Decoupled visual mesh: syncs to Rapier body when free, and directly to carryAnchor when carried */}
      <group ref={visualGroupRef} position={position} rotation={rotation}>
        <group ref={artworkGroupRef} name="prop-artwork">
        {kind === 'crate' && <PropVisual kind={kind} fallback={legacyCrate} />}
        {kind === 'platform' && <PlatformVisual id={id} />}

        {kind === 'wheel' && <PropVisual kind={kind} scale={0.98} fallback={
          <group>
            <mesh castShadow receiveShadow material={materials.rubber} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.38, 0.38, 0.26, 20]} />
            </mesh>
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
        } />}

        {kind === 'canister' && <PropVisual kind={kind} scale={[0.93, 1, 0.96]} fallback={legacyCanister} />}

        {kind === 'part' && <PropVisual kind={kind} scale={0.84} fallback={
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
        } />}
        {kind === 'battery' && (
          <>
            <PropVisual kind={kind} fallback={
              <mesh castShadow receiveShadow material={materials.bracket}>
                <boxGeometry args={[0.54, 0.46, 0.46]} />
              </mesh>
            } />
            <BatterySparks seed={idSeed} burstSignalRef={sparkBurstRef} itemId={id} />
          </>
        )}
        {kind === 'woodBarrel' && <PropVisual kind={kind} scale={[0.98, 1, 0.98]} fallback={
          <mesh castShadow receiveShadow material={materials.woodTrim}>
            <cylinderGeometry args={[0.36, 0.36, 0.96, 16]} />
          </mesh>
        } />}
        {kind === 'wing' && <PropVisual kind={kind} fallback={
          <mesh castShadow receiveShadow material={materials.canisterTeal}>
            <boxGeometry args={[1.1, 0.12, 0.46]} />
          </mesh>
        } />}
        {kind === 'headlight' && <PropVisual kind={kind} fallback={
          <mesh castShadow receiveShadow material={materials.rimYellow}>
            <cylinderGeometry args={[0.14, 0.14, 0.24, 14]} />
          </mesh>
        } />}
        {kind === 'seat' && <PropVisual kind={kind} fallback={
          <mesh castShadow receiveShadow material={materials.redPaint}>
            <boxGeometry args={[0.48, 0.58, 0.48]} />
          </mesh>
        } />}
        {kind === 'thruster' && <PropVisual kind={kind} fallback={
          <mesh castShadow receiveShadow material={materials.redPaint}>
            <cylinderGeometry args={[0.16, 0.16, 0.66, 14]} />
          </mesh>
        } />}
        {kind === 'timerBox' && <PropVisual kind={kind} fallback={
          <group>
            <mesh castShadow receiveShadow material={materials.bracket}>
              <boxGeometry args={[0.36, 0.24, 0.36]} />
            </mesh>
            <mesh castShadow material={materials.rimYellow} position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.1, 0.12, 0.06, 12]} />
            </mesh>
          </group>
        } />}
        {kind === 'switchBox' && <PropVisual kind={kind} fallback={
          <group>
            <mesh castShadow receiveShadow material={materials.bracket}>
              <boxGeometry args={[0.36, 0.22, 0.36]} />
            </mesh>
            <mesh castShadow material={materials.redPaint} position={[0, 0.16, 0]} rotation={[0.35, 0, 0]}>
              <boxGeometry args={[0.06, 0.18, 0.06]} />
            </mesh>
          </group>
        } />}
        {kind === 'logicAnd' && <PropVisual kind={kind} fallback={
          <group>
            <mesh castShadow receiveShadow material={materials.canisterTeal}>
              <boxGeometry args={[0.36, 0.22, 0.36]} />
            </mesh>
            <mesh castShadow material={materials.brass} position={[-0.08, 0.13, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.05, 10]} />
            </mesh>
            <mesh castShadow material={materials.brass} position={[0.08, 0.13, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.05, 10]} />
            </mesh>
          </group>
        } />}
        {kind === 'magnet' && <PropVisual kind={kind} fallback={
          <group>
            <mesh castShadow receiveShadow material={materials.redPaint}>
              <boxGeometry args={[0.42, 0.24, 0.42]} />
            </mesh>
            <mesh castShadow material={materials.copper} position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.16, 0.18, 0.08, 16]} />
            </mesh>
          </group>
        } />}
        {kind === 'chassis' && <PropVisual kind={kind} scale={[0.92, 1, 0.94]} fallback={
          <group>
            <mesh castShadow receiveShadow material={materials.bracket}>
              <boxGeometry args={[0.96, 0.09, 1.88]} />
            </mesh>
            <mesh castShadow receiveShadow material={materials.rimYellow} position={[-0.49, 0.01, 0]}>
              <boxGeometry args={[0.11, 0.12, 1.9]} />
            </mesh>
            <mesh castShadow receiveShadow material={materials.rimYellow} position={[0.49, 0.01, 0]}>
              <boxGeometry args={[0.11, 0.12, 1.9]} />
            </mesh>
            <mesh castShadow material={materials.canisterTeal} position={[0, -0.02, 0.86]}>
              <boxGeometry args={[1.08, 0.1, 0.16]} />
            </mesh>
            <mesh castShadow material={materials.canisterTeal} position={[0, -0.02, -0.86]}>
              <boxGeometry args={[1.08, 0.1, 0.16]} />
            </mesh>
          </group>
        } />}
        {kind === 'cargoRack' && <PropVisual kind={kind} fallback={
          <group>
            <mesh castShadow receiveShadow material={materials.bracket} position={[0, -0.07, 0]}>
              <boxGeometry args={[0.9, 0.06, 0.7]} />
            </mesh>
            <mesh castShadow material={materials.rimYellow} position={[-0.42, 0.03, 0]}>
              <boxGeometry args={[0.06, 0.16, 0.7]} />
            </mesh>
            <mesh castShadow material={materials.rimYellow} position={[0.42, 0.03, 0]}>
              <boxGeometry args={[0.06, 0.16, 0.7]} />
            </mesh>
            <mesh castShadow material={materials.rimYellow} position={[0, 0.03, -0.32]}>
              <boxGeometry args={[0.9, 0.16, 0.06]} />
            </mesh>
          </group>
        } />}
        {kind === 'spring' && <PropVisual kind={kind} fallback={
          <group>
            {/* Base plate */}
            <mesh castShadow receiveShadow material={materials.bracket} position={[0, -0.19, 0]}>
              <cylinderGeometry args={[0.18, 0.19, 0.06, 16]} />
            </mesh>
            {/* Central guide rod */}
            <mesh castShadow material={materials.steel} position={[0, 0, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.38, 10]} />
            </mesh>
            {/* Coiled brass/steel rings */}
            {[-0.12, -0.04, 0.04, 0.12].map((y, idx) => (
              <mesh
                key={idx}
                castShadow
                material={idx % 2 === 0 ? materials.brass : materials.steel}
                position={[0, y, 0]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <torusGeometry args={[0.135, 0.026, 8, 18]} />
              </mesh>
            ))}
            {/* Red jump cap */}
            <mesh castShadow receiveShadow material={materials.redPaint} position={[0, 0.19, 0]}>
              <cylinderGeometry args={[0.19, 0.17, 0.065, 16]} />
            </mesh>
            <mesh castShadow material={materials.rimYellow} position={[0, 0.228, 0]}>
              <cylinderGeometry args={[0.1, 0.12, 0.018, 14]} />
            </mesh>
          </group>
        } />}
        {kind === 'balloon' && <PropVisual kind={kind} fallback={
          <group>
            {/* Main rounded balloon sphere */}
            <mesh castShadow receiveShadow material={materials.redPaint} position={[0, 0.12, 0]} scale={[1, 1.14, 1]}>
              <sphereGeometry args={[0.27, 18, 14]} />
            </mesh>
            {/* Bright yellow equatorial stripe */}
            <mesh castShadow material={materials.rimYellow} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.268, 0.032, 8, 22]} />
            </mesh>
            {/* Balloon knot */}
            <mesh castShadow material={materials.redPaint} position={[0, -0.19, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.055, 0.08, 10]} />
            </mesh>
            {/* Basket tether */}
            <mesh castShadow material={materials.woodTrim} position={[0, -0.27, 0]}>
              <cylinderGeometry args={[0.014, 0.014, 0.14, 8]} />
            </mesh>
            {/* Mini wooden basket / brass collar */}
            <mesh castShadow receiveShadow material={materials.brass} position={[0, -0.32, 0]}>
              <cylinderGeometry args={[0.085, 0.065, 0.07, 12]} />
            </mesh>
          </group>
        } />}
        {kind === 'boxingGlove' && <BoxingGloveVisual id={id} glove={materials.redPaint} steel={materials.bracket} />}
        {kind === 'droneRotor' && (
          <>
            <mesh castShadow material={materials.canisterTeal} position={[0, -0.07, 0]}>
              <cylinderGeometry args={[0.105, 0.12, 0.08, 12]} />
            </mesh>
            <mesh castShadow material={materials.brass} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.255, 0.017, 6, 20]} />
            </mesh>
            <FanBlades id={id} bladeMat={materials.bracket} hubMat={materials.brass} idleSpeed={0} />
          </>
        )}
        {kind === 'flag' && (
          <>
            <mesh castShadow material={materials.brass} position={[-0.15, 0, 0]}>
              <cylinderGeometry args={[0.017, 0.022, 0.72, 8]} />
            </mesh>
            <mesh castShadow material={materials.redPaint} position={[0.004, 0.24, 0]}>
              <boxGeometry args={[0.31, 0.2, 0.023]} />
            </mesh>
            <mesh castShadow material={materials.rimYellow} position={[0.107, 0.24, 0]}>
              <boxGeometry args={[0.043, 0.2, 0.025]} />
            </mesh>
          </>
        )}
        {kind === 'fan' && <PropVisual kind={kind} fallback={
          <group>
            {/* Teal circular duct */}
            <mesh castShadow receiveShadow material={materials.canisterTeal}>
              <cylinderGeometry args={[0.26, 0.26, 0.24, 20, 1, true]} />
            </mesh>
            {/* Top and bottom brass duct rings */}
            <mesh castShadow material={materials.brass} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.255, 0.026, 8, 22]} />
            </mesh>
            <mesh castShadow material={materials.brass} position={[0, -0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.255, 0.026, 8, 22]} />
            </mesh>
            {/* Mounting cross struts */}
            <mesh castShadow material={materials.bracket} position={[0, -0.09, 0]}>
              <boxGeometry args={[0.48, 0.025, 0.04]} />
            </mesh>
            <mesh castShadow material={materials.bracket} position={[0, -0.09, 0]}>
              <boxGeometry args={[0.04, 0.025, 0.48]} />
            </mesh>
            {/* Angled spinning blades */}
            <FanBlades id={id} bladeMat={materials.rimYellow} hubMat={materials.brass} />
          </group>
        } />}
        {kind === 'horn' && <PropVisual kind={kind} fallback={
          <group>
            {/* Steel mounting base */}
            <mesh castShadow receiveShadow material={materials.bracket} position={[0, -0.11, -0.02]}>
              <boxGeometry args={[0.16, 0.08, 0.22]} />
            </mesh>
            {/* Brass megaphone cone pointing +Z */}
            <mesh castShadow receiveShadow material={materials.brass} position={[0, 0.02, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.16, 0.045, 0.3, 16]} />
            </mesh>
            {/* Flared brass rim */}
            <mesh castShadow material={materials.rimYellow} position={[0, 0.02, 0.21]}>
              <torusGeometry args={[0.158, 0.022, 8, 18]} />
            </mesh>
            {/* Brass neck */}
            <mesh castShadow material={materials.copper} position={[0, 0.02, -0.11]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.036, 0.036, 0.08, 10]} />
            </mesh>
            {/* Red rubber squeeze bulb */}
            <mesh castShadow receiveShadow material={materials.redPaint} position={[0, 0.02, -0.19]} scale={[1, 1, 1.25]}>
              <sphereGeometry args={[0.085, 14, 12]} />
            </mesh>
          </group>
        } />}
        {kind === 'gyro' && <PropVisual kind={kind} fallback={
          <GyroVisual
            baseMat={materials.bracket}
            brassMat={materials.brass}
            tealMat={materials.canisterTeal}
          />
        } />}
        </group>
        <group ref={highlightGroupRef} visible={false} position={[0, -0.28, 0]}>
          <mesh material={materials.highlightRing} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.42, 0.5, 24]} />
          </mesh>
        </group>

        <group ref={cyanGlowRef} visible={false}>
          <mesh position={[0, 0.05, 0]}>
            <sphereGeometry args={[0.42, 14, 10]} />
            <meshBasicMaterial
              color="#5ce1ff"
              transparent
              opacity={0.18}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh position={[0, -0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.36, 0.54, 24]} />
            <meshBasicMaterial
              color="#5ce1ff"
              transparent
              opacity={0.85}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      </group>

      <PropEffect id={id} kind={kind} />
      <group ref={beaconHolderRef} visible={false}>
        <GrabBeacon visible />
      </group>
    </>
  );
}

const GRABBABLE_SPAWNS: Omit<SingleGrabbableProps, 'resetSignal'>[] = [
  { id: 'crate-1', kind: 'crate', position: stockedPartPosition(0) },
  { id: 'crate-2', kind: 'crate', position: stockedPartPosition(1) },
  { id: 'crate-3', kind: 'crate', position: stockedPartPosition(2) },
  { id: 'wheel-1', kind: 'wheel', position: starterPartPosition(0), rotation: [0, 0, Math.PI / 2] },
  { id: 'wheel-2', kind: 'wheel', position: starterPartPosition(1), rotation: [0, 0, Math.PI / 2] },
  { id: 'canister-1', kind: 'canister', position: stockedPartPosition(3) },
  { id: 'canister-2', kind: 'canister', position: stockedPartPosition(4) },
  { id: 'part-1', kind: 'part', position: starterPartPosition(5) },
  { id: 'crate-4', kind: 'crate', position: [-15.2, 0.35, 2.2] },
  { id: 'crate-5', kind: 'crate', position: [-15.9, 0.35, 2.9] },
  { id: 'wheel-3', kind: 'wheel', position: starterPartPosition(2), rotation: [0, 0, Math.PI / 2] },
  { id: 'canister-3', kind: 'canister', position: [-14.5, 0.4, -0.6] },
  { id: 'part-2', kind: 'part', position: [-16.8, 0.78, -2.5] },
  { id: 'wheel-4', kind: 'wheel', position: starterPartPosition(3), rotation: [0, 0, Math.PI / 2] },
  { id: 'canister-4', kind: 'canister', position: stockedPartPosition(5) },
  { id: 'part-3', kind: 'part', position: stockedPartPosition(6) },
  { id: 'battery-1', kind: 'battery', position: starterPartPosition(6) },
  { id: 'wood-barrel-1', kind: 'woodBarrel', position: stockedPartPosition(7) },
  { id: 'wing-1', kind: 'wing', position: stockedPartPosition(8) },
  { id: 'wing-2', kind: 'wing', position: stockedPartPosition(9) },
  { id: 'headlight-1', kind: 'headlight', position: stockedPartPosition(10) },
  { id: 'seat-1', kind: 'seat', position: starterPartPosition(4) },
  { id: 'thruster-1', kind: 'thruster', position: stockedPartPosition(11) },
  { id: 'chassis-1', kind: 'chassis', position: stockedPartPosition(12) },
  { id: 'rack-1', kind: 'cargoRack', position: stockedPartPosition(13) },
  { id: 'timer-1', kind: 'timerBox', position: stockedPartPosition(14) },
  { id: 'switch-1', kind: 'switchBox', position: stockedPartPosition(15) },
  { id: 'and-1', kind: 'logicAnd', position: stockedPartPosition(16) },
  { id: 'magnet-1', kind: 'magnet', position: stockedPartPosition(17) },
  { id: 'spring-1', kind: 'spring', position: stockedPartPosition(18) },
  { id: 'spring-2', kind: 'spring', position: stockedPartPosition(19) },
  { id: 'balloon-1', kind: 'balloon', position: stockedPartPosition(20) },
  { id: 'balloon-2', kind: 'balloon', position: stockedPartPosition(21) },
  { id: 'fan-1', kind: 'fan', position: stockedPartPosition(22) },
  { id: 'fan-2', kind: 'fan', position: stockedPartPosition(23) },
  { id: 'horn-1', kind: 'horn', position: stockedPartPosition(24) },
  { id: 'gyro-1', kind: 'gyro', position: stockedPartPosition(25) },
  { id: 'thruster-2', kind: 'thruster', position: stockedPartPosition(26) },
  // Mini 3-barrel bowling pyramid near [3.0, 0.5, 26.5]
  { id: BOWLING_BARREL_IDS[0], kind: 'woodBarrel', position: [2.58, 0.5, 26.5] },
  { id: BOWLING_BARREL_IDS[1], kind: 'woodBarrel', position: [3.42, 0.5, 26.5] },
  { id: BOWLING_BARREL_IDS[2], kind: 'woodBarrel', position: [3.0, 1.48, 26.5] },
];

export function GrabbableProps({ resetSignal }: { resetSignal: number }) {
  const spawnedProps = useGameStore((s) => s.spawnedProps);

  return (
    <group name="grabbable-props">
      {GRABBABLE_SPAWNS.map((spawn) => (
        <GrabbableItem key={spawn.id} {...spawn} resetSignal={resetSignal} />
      ))}
      {spawnedProps.map((item) => (
        <GrabbableItem key={item.id} {...item} resetSignal={resetSignal} />
      ))}
    </group>
  );
}

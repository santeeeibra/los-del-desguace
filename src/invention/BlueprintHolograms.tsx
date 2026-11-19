import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { PRESET_BLUEPRINTS } from '../logic/blueprintManager';
import type { GrabbableKind } from '../props/grabbableRegistry';
import { useGameStore } from '../state/gameStore';
import { FREE_BUILD_ORIGIN, WORKSHOP_ORIGIN } from './workshopAssembly';

const SHARED_BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const SHARED_CYL_GEO = new THREE.CylinderGeometry(1, 1, 1, 14);
const SHARED_SPHERE_GEO = new THREE.SphereGeometry(1, 14, 10);
const SHARED_CONE_GEO = new THREE.ConeGeometry(1, 1, 12);

function HologramShape({ kind, material }: { kind: GrabbableKind; material: THREE.Material }) {
  switch (kind) {
    case 'wheel':
      return (
        <mesh geometry={SHARED_CYL_GEO} material={material} rotation={[0, 0, Math.PI / 2]} scale={[0.37, 0.26, 0.37]} />
      );
    case 'wing':
      return <mesh geometry={SHARED_BOX_GEO} material={material} scale={[1.08, 0.1, 0.44]} />;
    case 'thruster':
    case 'canister':
      return <mesh geometry={SHARED_CYL_GEO} material={material} scale={[0.17, 0.64, 0.17]} />;
    case 'woodBarrel':
      return <mesh geometry={SHARED_CYL_GEO} material={material} scale={[0.35, 0.94, 0.35]} />;
    case 'seat':
      return (
        <group>
          <mesh geometry={SHARED_BOX_GEO} material={material} position={[0, -0.14, 0]} scale={[0.46, 0.18, 0.48]} />
          <mesh geometry={SHARED_BOX_GEO} material={material} position={[0, 0.12, -0.16]} scale={[0.44, 0.38, 0.14]} />
        </group>
      );
    case 'headlight':
      return <mesh geometry={SHARED_CYL_GEO} material={material} rotation={[Math.PI / 2, 0, 0]} scale={[0.14, 0.22, 0.14]} />;
    case 'cargoRack':
      return <mesh geometry={SHARED_BOX_GEO} material={material} scale={[0.88, 0.18, 0.68]} />;
    case 'spring':
      return <mesh geometry={SHARED_CYL_GEO} material={material} scale={[0.18, 0.44, 0.18]} />;
    case 'balloon':
      return <mesh geometry={SHARED_SPHERE_GEO} material={material} position={[0, 0.1, 0]} scale={[0.27, 0.32, 0.27]} />;
    case 'fan':
      return <mesh geometry={SHARED_CYL_GEO} material={material} scale={[0.26, 0.28, 0.26]} />;
    case 'horn':
      return <mesh geometry={SHARED_CONE_GEO} material={material} rotation={[-Math.PI / 2, 0, 0]} scale={[0.16, 0.42, 0.16]} />;
    case 'gyro':
      return (
        <group>
          <mesh geometry={SHARED_BOX_GEO} material={material} position={[0, -0.14, 0]} scale={[0.36, 0.08, 0.36]} />
          <mesh geometry={SHARED_SPHERE_GEO} material={material} position={[0, 0.02, 0]} scale={[0.16, 0.16, 0.16]} />
        </group>
      );
    default:
      return <mesh geometry={SHARED_BOX_GEO} material={material} scale={[0.36, 0.28, 0.36]} />;
  }
}

interface HologramPose {
  pos: [number, number, number];
  quat: [number, number, number, number];
}

function resolveBlueprintPartPoses(
  parts: readonly {
    partId: string;
    parentId?: string;
    localPos: readonly [number, number, number];
    localRot: readonly [number, number, number, number];
  }[],
): Map<string, HologramPose> {
  const byId = new Map(parts.map((part) => [part.partId, part]));
  const resolved = new Map<string, HologramPose>();
  const resolveOne = (partId: string, visiting = new Set<string>()): HologramPose => {
    const cached = resolved.get(partId);
    if (cached) return cached;
    const part = byId.get(partId);
    if (!part || visiting.has(partId)) {
      return { pos: [0, 0, 0], quat: [0, 0, 0, 1] };
    }
    visiting.add(partId);
    const localQuat = new THREE.Quaternion(...part.localRot);
    if (part.parentId && byId.has(part.parentId)) {
      const parentPose = resolveOne(part.parentId, visiting);
      const parentQuat = new THREE.Quaternion(...parentPose.quat);
      const pos = new THREE.Vector3(...part.localPos)
        .applyQuaternion(parentQuat)
        .add(new THREE.Vector3(...parentPose.pos));
      const quat = parentQuat.clone().multiply(localQuat).normalize();
      const result: HologramPose = {
        pos: [pos.x, pos.y, pos.z],
        quat: [quat.x, quat.y, quat.z, quat.w],
      };
      resolved.set(partId, result);
      return result;
    }
    const result: HologramPose = {
      pos: [part.localPos[0], part.localPos[1], part.localPos[2]],
      quat: [localQuat.x, localQuat.y, localQuat.z, localQuat.w],
    };
    resolved.set(partId, result);
    return result;
  };
  for (const part of parts) resolveOne(part.partId);
  return resolved;
}

/**
 * Muestra siluetas fantasma celestes sobre el chasis cuando el jugador equipa el Plano Guía (Slot 6).
 */
export function BlueprintHolograms({ cartBodyRef }: { cartBodyRef: RefObject<RapierRigidBody | null> }) {
  const rootRef = useRef<THREE.Group>(null);
  const inventorySlots = useGameStore((s) => s.inventorySlots);
  const inventorySelection = useGameStore((s) => s.inventorySelection);
  const activeGuideIndex = useGameStore((s) => s.activeGuideIndex);
  const seated = useGameStore((s) => s.seated);

  const isVisible = !seated && inventorySlots[inventorySelection]?.kind === 'blueprint';
  const blueprint = PRESET_BLUEPRINTS[activeGuideIndex % PRESET_BLUEPRINTS.length];

  const holoMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#5ce1ff',
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  const partPoses = useMemo(
    () => (blueprint ? resolveBlueprintPartPoses(blueprint.parts) : new Map<string, HologramPose>()),
    [blueprint]
  );

  useEffect(() => () => holoMat.dispose(), [holoMat]);

  useFrame((state) => {
    if (!isVisible) return;
    const g = rootRef.current;
    const cart = cartBodyRef.current;
    if (g && blueprint?.rootPartId) {
      g.position.set(...FREE_BUILD_ORIGIN);
      g.quaternion.identity();
    } else if (g && cart?.isValid()) {
      const t = cart.translation();
      const r = cart.rotation();
      g.position.set(t.x, t.y, t.z);
      g.quaternion.set(r.x, r.y, r.z, r.w);
    }
    holoMat.opacity = 0.26 + Math.sin(state.clock.elapsedTime * 4) * 0.08;
  });

  if (!isVisible || !blueprint) return null;

  const anchorOrigin = blueprint.rootPartId ? FREE_BUILD_ORIGIN : WORKSHOP_ORIGIN;

  return (
    <group ref={rootRef} position={anchorOrigin} name="blueprint-holograms">
      {blueprint.parts.map((part) => {
        const pose = partPoses.get(part.partId) ?? {
          pos: [part.localPos[0], part.localPos[1], part.localPos[2]] as [number, number, number],
          quat: [part.localRot[0], part.localRot[1], part.localRot[2], part.localRot[3]] as [number, number, number, number],
        };
        return (
          <group
            key={`${blueprint.id}:${part.partId}`}
            position={pose.pos}
            quaternion={pose.quat}
          >
            <HologramShape kind={part.kind} material={holoMat} />
          </group>
        );
      })}
    </group>
  );
}

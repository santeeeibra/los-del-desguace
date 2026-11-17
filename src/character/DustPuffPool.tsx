import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface DustPuffHandle {
  spawnBurst: (x: number, y: number, z: number, kind: 'dust' | 'spark') => void;
}

interface PuffSlot {
  active: boolean;
  age: number;
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  baseScale: number;
  isSpark: boolean;
}

interface DustPuffPoolProps {
  maxCount: number;
}

export const DustPuffPool = forwardRef<DustPuffHandle, DustPuffPoolProps>(function DustPuffPool(
  { maxCount },
  ref
) {
  const dustMeshRef = useRef<THREE.InstancedMesh>(null);
  const sparkMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const slotsRef = useRef<PuffSlot[]>([]);
  if (slotsRef.current.length !== maxCount) {
    slotsRef.current = Array.from({ length: maxCount }, () => ({
      active: false,
      age: 0,
      life: 0.45,
      pos: new THREE.Vector3(0, -50, 0),
      vel: new THREE.Vector3(),
      baseScale: 0.2,
      isSpark: false,
    }));
  }

  const dustMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#efe3cf',
        roughness: 0.95,
        metalness: 0,
        transparent: true,
        opacity: 0.82,
      }),
    []
  );

  const sparkMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffd05b',
        emissive: '#ff8f1f',
        emissiveIntensity: 1.4,
        roughness: 0.3,
        metalness: 0.1,
      }),
    []
  );

  useEffect(() => {
    return () => {
      dustMat.dispose();
      sparkMat.dispose();
    };
  }, [dustMat, sparkMat]);

  useImperativeHandle(
    ref,
    () => ({
      spawnBurst(x: number, y: number, z: number, kind: 'dust' | 'spark') {
        const count = kind === 'spark' ? 6 : 5;
        let spawned = 0;
        const slots = slotsRef.current;
        for (let i = 0; i < slots.length && spawned < count; i++) {
          const slot = slots[i];
          if (!slot.active) {
            const angle = (spawned / count) * Math.PI * 2 + Math.random() * 0.6;
            const speed = kind === 'spark' ? 2.8 + Math.random() * 1.8 : 1.4 + Math.random() * 1.1;
            slot.active = true;
            slot.age = 0;
            slot.life = kind === 'spark' ? 0.34 : 0.48;
            slot.isSpark = kind === 'spark';
            slot.baseScale = kind === 'spark' ? 0.048 : 0.075 + Math.random() * 0.035;
            slot.pos.set(x + Math.cos(angle) * 0.14, y + 0.06, z + Math.sin(angle) * 0.14);
            slot.vel.set(
              Math.cos(angle) * speed,
              kind === 'spark' ? 1.8 + Math.random() * 1.4 : 0.5 + Math.random() * 0.4,
              Math.sin(angle) * speed
            );
            spawned++;
          }
        }
      },
    }),
    []
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const slots = slotsRef.current;
    const dustMesh = dustMeshRef.current;
    const sparkMesh = sparkMeshRef.current;
    if (!dustMesh || !sparkMesh) return;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot.active) {
        dummy.position.set(0, -100, 0);
        dummy.scale.set(0.0001, 0.0001, 0.0001);
        dummy.updateMatrix();
        dustMesh.setMatrixAt(i, dummy.matrix);
        sparkMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      slot.age += dt;
      if (slot.age >= slot.life) {
        slot.active = false;
        dummy.position.set(0, -100, 0);
        dummy.scale.set(0.0001, 0.0001, 0.0001);
        dummy.updateMatrix();
        dustMesh.setMatrixAt(i, dummy.matrix);
        sparkMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const progress = slot.age / slot.life;
      slot.vel.y -= (slot.isSpark ? 7.5 : 1.2) * dt;
      slot.vel.multiplyScalar(1 - Math.min(1, 3.5 * dt));
      slot.pos.addScaledVector(slot.vel, dt);

      const scale = slot.baseScale * (slot.isSpark ? 1 - progress : Math.sin(progress * Math.PI) * 1.25);
      dummy.position.copy(slot.pos);
      dummy.scale.setScalar(Math.max(0.001, scale));
      dummy.updateMatrix();

      if (slot.isSpark) {
        sparkMesh.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(0.0001, 0.0001, 0.0001);
        dummy.updateMatrix();
        dustMesh.setMatrixAt(i, dummy.matrix);
      } else {
        dustMesh.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(0.0001, 0.0001, 0.0001);
        dummy.updateMatrix();
        sparkMesh.setMatrixAt(i, dummy.matrix);
      }
    }

    dustMesh.instanceMatrix.needsUpdate = true;
    sparkMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={dustMeshRef} args={[undefined, undefined, maxCount]} frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <primitive object={dustMat} attach="material" />
      </instancedMesh>
      <instancedMesh ref={sparkMeshRef} args={[undefined, undefined, maxCount]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <primitive object={sparkMat} attach="material" />
      </instancedMesh>
    </group>
  );
});

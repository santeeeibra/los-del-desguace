import { useEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { platformStore } from '../invention/platformStore';
import { PLATFORM_DENSITY, PLATFORM_TEMPLATES, PLATFORM_THICKNESS, gridToRects, rasterize } from '../invention/platformShape';

const FALLBACK_RECTS = gridToRects(rasterize(PLATFORM_TEMPLATES.rect.points));

function usePlatform(id: string) {
  useSyncExternalStore(platformStore.subscribe, platformStore.getNonce);
  const record = platformStore.get(id);
  return { rects: record?.rects ?? FALLBACK_RECTS, version: record?.version ?? -1 };
}

/**
 * Colisionadores de una plataforma recortada: un rectángulo por franja de chapa.
 * El primero (el más grande) es el colisionador "principal" que usa el resto del juego; los demás
 * copian su estado (sensor / activo) para que al cargarla no choquen con el jugador.
 */
export function PlatformColliders({ id, colliderRef, bodyRef }: {
  id: string;
  colliderRef: RefObject<RapierCollider | null>;
  bodyRef: RefObject<RapierRigidBody | null>;
}) {
  const { rects, version } = usePlatform(id);
  const extras = useRef<(RapierCollider | null)[]>([]);

  useEffect(() => {
    // Esperar a que Rapier cree los colisionadores nuevos antes de reaplicar grupos de colisión.
    const raf = requestAnimationFrame(() => {
      bodyRef.current?.wakeUp();
      platformStore.notifyRebuilt(id);
    });
    return () => cancelAnimationFrame(raf);
  }, [id, version, bodyRef]);

  useFrame(() => {
    const primary = colliderRef.current;
    if (!primary?.isValid()) return;
    const sensor = primary.isSensor();
    const enabled = primary.isEnabled();
    const groups = primary.collisionGroups();
    for (const collider of extras.current) {
      if (!collider?.isValid()) continue;
      if (collider.isSensor() !== sensor) collider.setSensor(sensor);
      if (collider.isEnabled() !== enabled) collider.setEnabled(enabled);
      if (collider.collisionGroups() !== groups) collider.setCollisionGroups(groups);
    }
  });

  return (
    <>
      {rects.map((r, index) => (
        <CuboidCollider
          key={`${version}-${index}`}
          ref={(collider: RapierCollider | null) => {
            if (index === 0) (colliderRef as { current: RapierCollider | null }).current = collider;
            else extras.current[index - 1] = collider;
          }}
          args={[r.hx, PLATFORM_THICKNESS / 2, r.hz]}
          position={[r.x, 0, r.z]}
          mass={Math.max(0.05, r.hx * r.hz * 4 * PLATFORM_DENSITY)}
        />
      ))}
    </>
  );
}

export function PlatformVisual({ id }: { id: string }) {
  const { rects } = usePlatform(id);
  const materials = useMemo(() => ({
    top: new THREE.MeshStandardMaterial({ color: '#d9a35a', roughness: 0.78, metalness: 0.05 }),
    edge: new THREE.MeshStandardMaterial({ color: '#7a4a22', roughness: 0.85, metalness: 0.05 }),
  }), []);
  useEffect(() => () => { materials.top.dispose(); materials.edge.dispose(); }, [materials]);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => () => box.dispose(), [box]);
  return (
    <group name="platform-visual">
      {rects.map((r, index) => (
        <group key={index} position={[r.x, 0, r.z]}>
          <mesh geometry={box} material={materials.edge} scale={[r.hx * 2, PLATFORM_THICKNESS, r.hz * 2]} castShadow receiveShadow />
          <mesh geometry={box} material={materials.top} position={[0, PLATFORM_THICKNESS / 2 + 0.002, 0]}
            scale={[Math.max(0.001, r.hx * 2 - 0.012), 0.004, Math.max(0.001, r.hz * 2 - 0.012)]} receiveShadow />
        </group>
      ))}
    </group>
  );
}

import { useEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
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
 * Se crean directo en Rapier con el desplazamiento ya incluido en la descripción (si se mueven
 * después de creados, un cuerpo fijo deja su caja envolvente vieja en la fase amplia).
 * El primero (el más grande) es el colisionador "principal" que usa el resto del juego; los demás
 * copian su estado (sensor / activo). Los grupos de colisión del vehículo se reaplican al reconstruir para que al cargarla no choquen con el jugador.
 */
export function PlatformColliders({ id, colliderRef, bodyRef }: {
  id: string;
  colliderRef: RefObject<RapierCollider | null>;
  bodyRef: RefObject<RapierRigidBody | null>;
}) {
  const { rapier, world } = useRapier();
  const { rects, version } = usePlatform(id);
  const built = useRef<{ version: number; body: RapierRigidBody | null; colliders: RapierCollider[] }>({ version: -2, body: null, colliders: [] });

  useEffect(() => () => {
    const { colliders } = built.current;
    for (const c of colliders) if (c.isValid()) world.removeCollider(c, false);
    built.current = { version: -2, body: null, colliders: [] };
  }, [world]);

  useFrame(() => {
    const body = bodyRef.current;
    if (!body?.isValid()) return;
    const state = built.current;
    if (state.version !== version || state.body !== body) {
      const previous = state.colliders[0];
      const sensor = previous?.isValid() ? previous.isSensor() : false;
      const enabled = previous?.isValid() ? previous.isEnabled() : true;
      for (const c of state.colliders) if (c.isValid()) world.removeCollider(c, false);
      const colliders = rects.map((r) => {
        const desc = rapier.ColliderDesc.cuboid(r.hx, PLATFORM_THICKNESS / 2, r.hz)
          .setTranslation(r.x, 0, r.z)
          .setMass(Math.max(0.05, r.hx * r.hz * 4 * PLATFORM_DENSITY))
          .setFriction(0.9)
          .setRestitution(0.05);
        const collider = world.createCollider(desc, body);
        collider.setSensor(sensor);
        collider.setEnabled(enabled);
        return collider;
      });
      built.current = { version, body, colliders };
      (colliderRef as { current: RapierCollider | null }).current = colliders[0] ?? null;
      body.wakeUp();
      platformStore.notifyRebuilt(id);
      return;
    }
    const [primary, ...extras] = state.colliders;
    if (!primary?.isValid()) return;
    const sensor = primary.isSensor();
    const enabled = primary.isEnabled();
    for (const collider of extras) {
      if (!collider.isValid()) continue;
      if (collider.isSensor() !== sensor) collider.setSensor(sensor);
      if (collider.isEnabled() !== enabled) collider.setEnabled(enabled);
    }
  });

  return null;
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

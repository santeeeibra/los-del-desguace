import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAfterPhysicsStep, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { grabbableRegistry } from '../../props/grabbableRegistry';
import { useGameModeStore } from '../gameModes';
import { DELIVERY_CARGO_ID, DELIVERY_CARGO_SPAWN, DELIVERY_ZONE, deliveryStore, impactDeltaV, inDeliveryZone, useDeliveryStore } from './deliveryStore';

/** Tras arrancar el recorrido o soltar la carga, ignora el primer instante (la caja se acomoda). */
const SETTLE_SEC = 0.35;
/** Pasos de física a esperar antes de colocar la carga: deja terminar el «Reiniciar Piezas». */
const PLACE_AFTER_STEPS = 6;

/**
 * Lógica de escena de Entrega Delicada: avanza el reloj con el paso físico
 * (no depende de los fps), mide los golpes de la carga y detecta la entrega.
 * Solo se monta en el modo `delivery`.
 */
export function DeliveryController() {
  const mode = useGameModeStore((s) => s.mode);
  if (mode !== 'delivery') return null;
  return <DeliveryRuntime />;
}

function DeliveryRuntime() {
  const { world } = useRapier();
  const prevVel = useRef<THREE.Vector3 | null>(null);
  const settle = useRef(SETTLE_SEC);
  const placeIn = useRef(PLACE_AFTER_STEPS);
  const resetNonce = useDeliveryStore((s) => s.resetNonce);
  const phase = useDeliveryStore((s) => s.match.phase);

  useEffect(() => {
    prevVel.current = null;
    settle.current = SETTLE_SEC;
  }, [resetNonce, phase]);

  useEffect(() => {
    placeIn.current = PLACE_AFTER_STEPS;
  }, [resetNonce]);

  // Solo en desarrollo: ganchos para pruebas automáticas en el navegador.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__delivery = {
      state: () => deliveryStore.getState().match,
      /** Levanta la carga `h` metros y la suelta para medir el daño por caída. */
      dropCargo: (h: number) => {
        const cargo = grabbableRegistry.getById(DELIVERY_CARGO_ID)?.getBody();
        if (!cargo?.isValid()) return false;
        const t = cargo.translation();
        cargo.setTranslation({ x: t.x, y: t.y + h, z: t.z }, true);
        cargo.setLinvel({ x: 0, y: 0, z: 0 }, true);
        prevVel.current = null;
        return true;
      },
      /** Apoya la carga en la zona de entrega (para probar el resultado sin manejar). */
      placeCargoInZone: () => {
        const cargo = grabbableRegistry.getById(DELIVERY_CARGO_ID)?.getBody();
        if (!cargo?.isValid()) return false;
        const [x, , z] = DELIVERY_ZONE.position;
        cargo.setTranslation({ x, y: 0.4, z }, true);
        cargo.setLinvel({ x: 0, y: 0, z: 0 }, true);
        prevVel.current = null;
        settle.current = SETTLE_SEC;
        return true;
      },
    };
    return () => {
      delete w.__delivery;
    };
  }, []);

  useAfterPhysicsStep(() => {
    const dt = world.timestep;
    if (placeIn.current > 0 && --placeIn.current === 0) {
      const cargo = grabbableRegistry.getById(DELIVERY_CARGO_ID)?.getBody();
      if (cargo?.isValid()) {
        const [x, y, z] = DELIVERY_CARGO_SPAWN;
        cargo.setTranslation({ x, y, z }, true);
        cargo.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        cargo.setLinvel({ x: 0, y: 0, z: 0 }, true);
        cargo.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
    deliveryStore.tick(dt);
    const { match } = deliveryStore.getState();
    if (match.phase !== 'run') return;

    const body = grabbableRegistry.getById(DELIVERY_CARGO_ID)?.getBody();
    const carried = grabbableRegistry.carriedId === DELIVERY_CARGO_ID;
    if (!body || !body.isValid() || carried || !body.isEnabled()) {
      // En la mano del jugador la caja no recibe golpes; al soltarla se vuelve a medir desde cero.
      prevVel.current = null;
      settle.current = SETTLE_SEC;
      return;
    }
    const v = body.linvel();
    const prev = prevVel.current;
    if (settle.current > 0) settle.current -= dt;
    else if (prev) {
      const deltaV = impactDeltaV(prev, v, world.gravity.y, dt);
      deliveryStore.impact({ deltaV }, performance.now());
    }
    prevVel.current = (prev ?? new THREE.Vector3()).set(v.x, v.y, v.z);

    if (inDeliveryZone(body.translation())) deliveryStore.deliver();
  });

  return (
    <>
      <DeliveryZoneMarker />
      <CargoMarker />
    </>
  );
}

/** Aro en el piso que marca dónde entregar. */
function DeliveryZoneMarker() {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ring.current) ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2.4) * 0.04);
  });
  const [x, y, z] = DELIVERY_ZONE.position;
  return (
    <group position={[x, y, z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[DELIVERY_ZONE.radius - 0.25, DELIVERY_ZONE.radius, 48]} />
        <meshBasicMaterial color="#ffe066" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[DELIVERY_ZONE.radius - 0.25, 48]} />
        <meshBasicMaterial color="#e39a24" transparent opacity={0.22} />
      </mesh>
      {/* Poste con cartel de madera */}
      <mesh position={[DELIVERY_ZONE.radius + 0.3, 1, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 2, 8]} />
        <meshStandardMaterial color="#6d3f1d" />
      </mesh>
      <mesh position={[DELIVERY_ZONE.radius + 0.3, 1.95, 0]}>
        <boxGeometry args={[0.9, 0.45, 0.08]} />
        <meshStandardMaterial color="#e6b770" />
      </mesh>
    </group>
  );
}

/** Flecha flotante sobre la carga para no perderla de vista. */
function CargoMarker() {
  const arrow = useRef<THREE.Group>(null);
  const tmp = useRef(new THREE.Vector3());
  useFrame(({ clock }) => {
    const entry = grabbableRegistry.getById(DELIVERY_CARGO_ID);
    const g = arrow.current;
    if (!g || !entry) return;
    const ok = entry.getWorldPos(tmp.current);
    g.visible = ok;
    if (ok) g.position.set(tmp.current.x, tmp.current.y + 0.85 + Math.sin(clock.elapsedTime * 3) * 0.06, tmp.current.z);
  });
  return (
    <group ref={arrow}>
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.16, 0.32, 4]} />
        <meshBasicMaterial color="#df6e50" />
      </mesh>
    </group>
  );
}

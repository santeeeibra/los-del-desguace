import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { playWeldClank } from '../audio/sfxEngine';
import {
  CAR_CHUNKS,
  CAR_KINDS,
  CAR_SIZE,
  CHUNK_MASS_FRACTION,
  layoutBarrier,
  type BarrierId,
  type CarSpec,
} from '../modes/carBarriers';

/** Segundos tras el nacimiento durante los que se ignoran fuerzas (la pila se está asentando). */
const SETTLE_SEC = 1.5;
/** Segundos que viven los trozos antes de desaparecer (para cuidar el rendimiento). */
const CHUNK_LIFE_MS = 35000;

const CAR_COLORS = ['#b4553a', '#c9923f', '#8a9a6b', '#7a8b99'];
const CAR_COLORS_HEAVY = ['#6d3426', '#7d5a2a', '#4f5a3f', '#4a545c'];
const YELLOW = new THREE.MeshStandardMaterial({ color: '#f2c138', roughness: 0.5, metalness: 0.1 });

const carMats = {
  light: CAR_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0.25 })),
  heavy: CAR_COLORS_HEAVY.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, metalness: 0.3 })),
};

function matFor(car: CarSpec): THREE.Material {
  return (car.barrier === 'a' ? carMats.light : carMats.heavy)[car.variant % 4];
}

const BASE = import.meta.env.BASE_URL;
const carUrl = (car: CarSpec) => `${BASE}models/levels/cars/car-${car.weak ? 'weak-' : ''}${CAR_KINDS[car.variant % 4]}.glb`;
const chunkUrl = (car: CarSpec) => `${BASE}models/levels/cars/car-chunks-${CAR_KINDS[car.variant % 4]}.glb`;

/** La barrera pesada se ve más oscura: se oscurecen copias de los materiales (una por material). */
const darkMats = new Map<THREE.Material, THREE.Material>();
function darken(m: THREE.Material): THREE.Material {
  let d = darkMats.get(m);
  if (!d) {
    d = m.clone();
    const col = (d as THREE.MeshStandardMaterial).color;
    if (col) col.multiplyScalar(0.62);
    darkMats.set(m, d);
  }
  return d;
}

function prepare(root: THREE.Object3D, heavy: boolean, shadow: boolean): THREE.Object3D {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    if (heavy) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(darken) : darken(mesh.material);
  });
  return root;
}

/** Si el modelo falta o está corrupto se muestran las cajas de prueba. */
class ModelBoundary extends Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function CarGlb({ car }: { car: CarSpec }) {
  const { scene } = useGLTF(carUrl(car), false, false);
  const model = useMemo(() => prepare(scene.clone(true), car.barrier === 'b', true), [scene, car.barrier]);
  return <primitive object={model} />;
}

function ChunkGlb({ d, name }: { d: Debris; name: string }) {
  const { scene } = useGLTF(chunkUrl(d.car), false, false);
  const model = useMemo(() => {
    const node = scene.getObjectByName(name);
    return node ? prepare(node.clone(true), d.car.barrier === 'b', false) : null;
  }, [scene, name, d.car.barrier]);
  return model ? <primitive object={model} /> : null;
}

function CarBoxes({ car }: { car: CarSpec }) {
  return (
    <>
      <mesh material={matFor(car)} castShadow receiveShadow>
        <boxGeometry args={[CAR_SIZE[0], CAR_SIZE[1] * 0.62, CAR_SIZE[2]]} />
      </mesh>
      <mesh material={matFor(car)} position={[-0.2, CAR_SIZE[1] * 0.4, 0]} castShadow>
        <boxGeometry args={[CAR_SIZE[0] * 0.5, CAR_SIZE[1] * 0.38, CAR_SIZE[2] * 0.9]} />
      </mesh>
      {car.weak && (
        <group position={[-0.2, CAR_SIZE[1] * 0.6, 0]}>
          <mesh material={YELLOW} rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[1.6, 0.05, 0.22]} />
          </mesh>
          <mesh material={YELLOW} rotation={[0, -Math.PI / 4, 0]}>
            <boxGeometry args={[1.6, 0.05, 0.22]} />
          </mesh>
        </group>
      )}
    </>
  );
}

interface Debris {
  key: string;
  name: 'roof' | 'hood' | 'door' | 'chassis';
  pos: [number, number, number];
  quat: [number, number, number, number];
  vel: [number, number, number];
  size: readonly [number, number, number];
  mass: number;
  car: CarSpec;
}

function ChunkBox({ d }: { d: Debris }) {
  return (
    <mesh material={matFor(d.car)} castShadow receiveShadow>
      <boxGeometry args={[d.size[0], d.size[1], d.size[2]]} />
    </mesh>
  );
}

function CarChunk({ d }: { d: Debris }) {
  return (
    <RigidBody
      colliders={false}
      position={d.pos}
      quaternion={d.quat}
      linearVelocity={d.vel}
      linearDamping={0.15}
      angularDamping={0.3}
    >
      <CuboidCollider args={[d.size[0] / 2, d.size[1] / 2, d.size[2] / 2]} mass={d.mass} friction={0.8} restitution={0.05} />
      <ModelBoundary fallback={<ChunkBox d={d} />}>
        <Suspense fallback={<ChunkBox d={d} />}>
          <ChunkGlb d={d} name={d.name} />
        </Suspense>
      </ModelBoundary>
    </RigidBody>
  );
}

function Car({
  car,
  origin,
  onBreak,
}: {
  car: CarSpec;
  origin: readonly [number, number, number];
  onBreak: (car: CarSpec, body: RapierRigidBody) => void;
}) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const bornAt = useRef(performance.now());
  const done = useRef(false);
  const pos: [number, number, number] = [origin[0] + car.pos[0], origin[1] + car.pos[1], origin[2] + car.pos[2]];

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      position={pos}
      linearDamping={0.12}
      angularDamping={0.4}
      onContactForce={(e) => {
        if (done.current || !bodyRef.current) return;
        if (performance.now() - bornAt.current < SETTLE_SEC * 1000) return;
        if (e.totalForceMagnitude < car.breakForce) return;
        done.current = true;
        onBreak(car, bodyRef.current);
      }}
    >
      <CuboidCollider
        ref={(c) => {
          // Solo avisa de contactos fuertes: evita miles de eventos por el roce de la pila
          c?.setContactForceEventThreshold(car.breakForce * 0.5);
        }}
        args={[CAR_SIZE[0] / 2, CAR_SIZE[1] / 2, CAR_SIZE[2] / 2]}
        mass={car.mass}
        friction={0.7}
        restitution={0.05}
      />
      <ModelBoundary fallback={<CarBoxes car={car} />}>
        <Suspense fallback={<CarBoxes car={car} />}>
          <CarGlb car={car} />
        </Suspense>
      </ModelBoundary>
    </RigidBody>
  );
}

/**
 * Una barrera de autos apilados. Cada auto es un cuerpo dinámico: se empuja, y si el choque supera su
 * umbral se parte en trozos más livianos. `runKey` reconstruye la pila al reiniciar el nivel.
 */
export function CarBarrier({
  id,
  origin,
  runKey,
}: {
  id: BarrierId;
  origin: readonly [number, number, number];
  runKey: number;
}) {
  const cars = useMemo(() => layoutBarrier(id), [id]);
  const [broken, setBroken] = useState<Record<string, true>>({});
  const [debris, setDebris] = useState<Debris[]>([]);
  const timers = useRef<number[]>([]);

  // Al reiniciar el nivel (o cambiar de nivel) se rearma la pila.
  useEffect(() => {
    setBroken({});
    setDebris([]);
    return () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    };
  }, [runKey]);

  const handleBreak = (car: CarSpec, body: RapierRigidBody) => {
    const t = body.translation();
    const r = body.rotation();
    const v = body.linvel();
    const quat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const created: Debris[] = CAR_CHUNKS.map((c, i) => {
      const off = new THREE.Vector3(c.offset[0], c.offset[1], c.offset[2]).applyQuaternion(quat);
      return {
        key: `${car.id}-${runKey}-${i}`,
        name: c.name,
        pos: [t.x + off.x, t.y + off.y, t.z + off.z],
        quat: [r.x, r.y, r.z, r.w],
        // Cada trozo sale con un empujón extra hacia afuera para que se vea el estallido
        vel: [v.x + off.x * 1.2, v.y + 1 + Math.abs(off.y), v.z + off.z * 1.2],
        size: c.size,
        mass: car.mass * CHUNK_MASS_FRACTION,
        car,
      };
    });
    setBroken((b) => ({ ...b, [car.id]: true }));
    setDebris((d) => [...d, ...created]);
    playWeldClank();
    const keys = new Set(created.map((c) => c.key));
    timers.current.push(
      window.setTimeout(() => setDebris((d) => d.filter((x) => !keys.has(x.key))), CHUNK_LIFE_MS),
    );
  };

  return (
    <>
      {cars.map((car) =>
        broken[car.id] ? null : (
          <Car key={`${car.id}-${runKey}`} car={car} origin={origin} onBreak={handleBreak} />
        ),
      )}
      {debris.map((d) => (
        <CarChunk key={d.key} d={d} />
      ))}
    </>
  );
}

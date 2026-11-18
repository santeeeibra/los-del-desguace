import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { InventorCharacter, type CharacterAnimData } from '../character/InventorCharacter';
import type { GrabbableKind } from '../props/grabbableRegistry';
import { InventorCharacterLegacy } from './legacy/InventorCharacterLegacy';

/**
 * Laboratorio visual SOLO de desarrollo (`?lab=character`).
 * Muestra varias combinaciones cabeza/ropa con el mismo cuerpo base, desde
 * ángulos fijos y con poses de animación simuladas. No forma parte del juego.
 */

type Pose = 'idle' | 'walk' | 'run' | 'jump' | 'carry' | 'carryWalk';
type View = 'front' | 'side' | 'back' | 'threeQuarter' | 'firstPerson';

export interface LabCombo {
  label: string;
  props: Record<string, unknown>;
  /** Renderiza la copia congelada del cuerpo anterior (comparación antes/después). */
  legacy?: boolean;
}

const VIEW_ANGLES: Record<Exclude<View, 'firstPerson'>, number> = {
  front: 0,
  threeQuarter: Math.PI / 4,
  side: Math.PI / 2,
  back: Math.PI,
};

function makeAnim(): CharacterAnimData {
  return {
    speed: 0,
    verticalSpeed: 0,
    isOnGround: true,
    isMoving: false,
    isRunning: false,
    isCarrying: false,
    carriedKind: null,
    carryDist: 0.65,
    carryLift: 0.12,
    accelForward: 0,
    turnRate: 0,
    takeoffImpulse: 0,
    landImpulse: 0,
    bumpImpulse: 0,
  };
}

function applyPose(a: CharacterAnimData, pose: Pose, t: number, kind: GrabbableKind) {
  const carrying = pose === 'carry' || pose === 'carryWalk';
  a.isCarrying = carrying;
  a.carriedKind = carrying ? kind : null;
  a.speed = pose === 'walk' || pose === 'carryWalk' ? 2.4 : pose === 'run' ? 5.6 : 0;
  a.isMoving = a.speed > 0;
  a.isRunning = pose === 'run';
  a.isOnGround = pose !== 'jump';
  a.verticalSpeed = pose === 'jump' ? Math.sin(t * 2) * 3 : 0;
}

function LabCharacter({
  combo,
  x,
  pose,
  firstPerson,
  kind,
  yaw,
}: {
  combo: LabCombo;
  x: number;
  yaw: number;
  pose: Pose;
  firstPerson: boolean;
  kind: GrabbableKind;
}) {
  const animRef = useRef<CharacterAnimData>(makeAnim());
  const carryRef = useRef<THREE.Group>(null);
  useFrame((s) => applyPose(animRef.current, pose, s.clock.elapsedTime, kind));
  const carrying = pose === 'carry' || pose === 'carryWalk';
  const Body = combo.legacy ? InventorCharacterLegacy : InventorCharacter;
  return (
    // La raíz del personaje se desplaza −0.66 (visualYOffset); compensamos para pies en y=0.
    <group position={[x, 0.66, 0]} rotation={[0, yaw, 0]}>
      <Body
        animDataRef={animRef}
        carryAnchorRef={carryRef}
        firstPersonHideHead={firstPerson}
        {...(combo.props as object)}
      />
      {carrying && <CarryBox anchorRef={carryRef} />}
    </group>
  );
}

function CarryBox({ anchorRef }: { anchorRef: React.RefObject<THREE.Group | null> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!anchorRef.current || !meshRef.current) return;
    anchorRef.current.getWorldPosition(v);
    meshRef.current.parent?.worldToLocal(v);
    meshRef.current.position.copy(v);
  });
  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.42, 0.34, 0.36]} />
      <meshStandardMaterial color="#b07a45" />
    </mesh>
  );
}

function CameraRig({ view, count, spacing }: { view: View; count: number; spacing: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (view === 'firstPerson') {
      // Ojo aproximado de la cámara de juego en primera persona, sobre el primer personaje.
      cam.fov = 70;
      cam.position.set(0, 1.05, 0.12);
      cam.lookAt(0, 0.55, 1.2);
    } else {
      const width = (count - 1) * spacing;
      // Distancia para que entren todos según el aspecto del lienzo (fov vertical 30°).
      const aspect = size.width / size.height;
      const halfW = width / 2 + 0.6;
      const fitW = halfW / (Math.tan(THREE.MathUtils.degToRad(15)) * aspect);
      const dist = Math.max(3.4, fitW + 0.4);
      // La cámara queda de frente; cada personaje gira sobre sí mismo (ver `yaw`).
      cam.fov = 30;
      cam.position.set(width / 2, 0.9, dist);
      cam.lookAt(width / 2, 0.62, 0);
    }
    cam.updateProjectionMatrix();
  }, [camera, view, count, spacing, size.width, size.height]);
  return null;
}

export function CharacterLab({ combos }: { combos: LabCombo[] }) {
  const params = new URLSearchParams(window.location.search);
  const [view, setView] = useState<View>((params.get('view') as View) ?? 'front');
  const [pose, setPose] = useState<Pose>((params.get('pose') as Pose) ?? 'idle');
  const kind = (params.get('kind') as GrabbableKind) ?? 'crate';
  const spacing = 1.0;
  const fp = view === 'firstPerson';
  const shown = fp ? combos.slice(0, 1) : combos;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#cfd6da' }}>
      <Canvas shadows camera={{ position: [0, 1, 4], fov: 30 }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#cfd6da']} />
        <hemisphereLight args={['#ffffff', '#8a8f94', 1.1]} />
        <directionalLight position={[3, 5, 4]} intensity={1.8} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[(shown.length - 1) * spacing * 0.5, 0, 0]}>
          <planeGeometry args={[30, 30]} />
          <meshStandardMaterial color="#b8bec2" />
        </mesh>
        {shown.map((c, i) => (
          <LabCharacter key={c.label} combo={c} x={i * spacing} pose={pose} firstPerson={fp} kind={kind} yaw={fp ? 0 : -VIEW_ANGLES[view as Exclude<View, 'firstPerson'>]} />
        ))}
        <CameraRig view={view} count={shown.length} spacing={spacing} />
      </Canvas>
      <div style={{ position: 'absolute', top: 8, left: 8, font: '12px sans-serif', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['front', 'threeQuarter', 'side', 'back', 'firstPerson'] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)} disabled={v === view}>{v}</button>
        ))}
        <span style={{ width: 12 }} />
        {(['idle', 'walk', 'run', 'jump', 'carry', 'carryWalk'] as Pose[]).map((p) => (
          <button key={p} onClick={() => setPose(p)} disabled={p === pose}>{p}</button>
        ))}
      </div>
      {!fp && (
        <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, display: 'flex', justifyContent: 'space-around', font: '12px sans-serif' }}>
          {shown.map((c) => <span key={c.label}>{c.label}</span>)}
        </div>
      )}
    </div>
  );
}

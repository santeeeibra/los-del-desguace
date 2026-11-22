import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import type { CameraTargetSource } from '../controls/ThirdPersonCamera';
import { playWeldClank } from '../audio/sfxEngine';
import {
  EXPEDITION_LEVEL_BY_ID,
  expeditionStore,
  useExpeditionStore,
  type ExpeditionLevelDef,
} from '../modes/expeditionLevels';
import { gameStore } from '../state/gameStore';
import { weightMultiple } from '../physics/jointLoad';
import { registerChargeStation } from '../props/chargeStations';
import { resetPartConditions, setPartCondition } from '../props/partCondition';
import { registerMagneticAnchor, registerWorldTags } from '../props/worldTags';
import type { GrabbableKind } from '../props/grabbableRegistry';
import { BreakableFixedJoint } from './BreakableJoint';
import { CarBarrier } from './CarBarriers';
import { LevelArt, useGreyboxVisible } from './LevelArt';

/**
 * Materiales compartidos de bajo costo (sin texturas pesadas ni luces extra) para mantener
 * 60 FPS constantes en niveles extensos estilo PEAK tanto en PC como en móvil.
 */
const MATS = {
  deck: new THREE.MeshStandardMaterial({ color: '#5c5852', roughness: 0.9, metalness: 0.12 }),
  deckDark: new THREE.MeshStandardMaterial({ color: '#3f3d39', roughness: 0.92, metalness: 0.18 }),
  wood: new THREE.MeshStandardMaterial({ color: '#b57b42', roughness: 0.85, metalness: 0.04 }),
  woodDark: new THREE.MeshStandardMaterial({ color: '#7a4b23', roughness: 0.88, metalness: 0.05 }),
  steel: new THREE.MeshStandardMaterial({ color: '#747e85', roughness: 0.55, metalness: 0.55 }),
  rust: new THREE.MeshStandardMaterial({ color: '#b85332', roughness: 0.78, metalness: 0.28 }),
  tealContainer: new THREE.MeshStandardMaterial({ color: '#2b6e6c', roughness: 0.74, metalness: 0.25 }),
  craneOrange: new THREE.MeshStandardMaterial({ color: '#e07a24', roughness: 0.62, metalness: 0.3 }),
  hazardYellow: new THREE.MeshStandardMaterial({ color: '#f2c138', roughness: 0.52, metalness: 0.2 }),
  oil: new THREE.MeshStandardMaterial({ color: '#171514', roughness: 0.18, metalness: 0.45 }),
  cliff: new THREE.MeshStandardMaterial({ color: '#9c7352', roughness: 0.95, metalness: 0.04 }),
  cliffTop: new THREE.MeshStandardMaterial({ color: '#b88b62', roughness: 0.92, metalness: 0.04 }),
  beaconOff: new THREE.MeshStandardMaterial({ color: '#f2b63d', emissive: '#e0891b', emissiveIntensity: 0.65, roughness: 0.35 }),
  beaconOn: new THREE.MeshStandardMaterial({ color: '#6ff7b6', emissive: '#2bd989', emissiveIntensity: 1.15, roughness: 0.3 }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffd94a', emissive: '#e09b14', emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.8 }),
  furnace: new THREE.MeshStandardMaterial({ color: '#ff7a2b', emissive: '#ff5114', emissiveIntensity: 1.3, roughness: 0.4 }),
  windRibbon: new THREE.MeshBasicMaterial({ color: '#eefaff', transparent: true, opacity: 0.52 }),
  fragile: new THREE.MeshStandardMaterial({ color: '#d49a2a', roughness: 0.65, metalness: 0.28 }),
  fragileWarn: new THREE.MeshStandardMaterial({ color: '#e64d2e', emissive: '#c42e12', emissiveIntensity: 0.65, roughness: 0.5 }),
};

/** Bloque estático liviano (un solo RigidBody fixed + box mesh). */
function Block({
  pos,
  size,
  rot,
  mat = MATS.deck,
  shadow = true,
}: {
  pos: [number, number, number];
  size: [number, number, number];
  rot?: [number, number, number];
  mat?: THREE.Material;
  shadow?: boolean;
}) {
  const visible = useGreyboxVisible();
  return (
    <RigidBody type="fixed" position={pos} rotation={rot} colliders={false}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
      <mesh material={mat} castShadow={shadow} receiveShadow visible={visible}>
        <boxGeometry args={size} />
      </mesh>
    </RigidBody>
  );
}

/** Decoración de prueba que se oculta cuando el nivel ya tiene su arte .glb. */
function GreyboxOnly({ children }: { children: React.ReactNode }) {
  return <group visible={useGreyboxVisible()}>{children}</group>;
}

/** Baliza de punto de control visible a larga distancia. */
function CheckpointBeacon({
  pos,
  active,
}: {
  pos: [number, number, number];
  active: boolean;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.y = clock.elapsedTime * 1.4;
      ringRef.current.position.y = 3.2 + Math.sin(clock.elapsedTime * 2.8) * 0.16;
    }
  });
  return (
    <group position={pos}>
      <mesh position={[0, 1.4, 0]} material={MATS.steel} castShadow>
        <cylinderGeometry args={[0.14, 0.2, 2.8, 8]} />
      </mesh>
      <mesh position={[0, 2.9, 0]} material={active ? MATS.beaconOn : MATS.beaconOff}>
        <octahedronGeometry args={[0.38, 0]} />
      </mesh>
      <mesh ref={ringRef} position={[0, 3.2, 0]} rotation={[Math.PI / 2, 0, 0]} material={active ? MATS.beaconOn : MATS.beaconOff}>
        <torusGeometry args={[0.9, 0.08, 6, 18]} />
      </mesh>
    </group>
  );
}

/** Arco de meta / cima estilo PEAK. */
function SummitArch({ pos, completed }: { pos: [number, number, number]; completed: boolean }) {
  const haloRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (haloRef.current) haloRef.current.rotation.z = clock.elapsedTime * 1.1;
  });
  return (
    <group position={pos}>
      <mesh position={[-3.2, 2.6, 0]} material={MATS.hazardYellow} castShadow>
        <boxGeometry args={[0.55, 5.2, 0.55]} />
      </mesh>
      <mesh position={[3.2, 2.6, 0]} material={MATS.hazardYellow} castShadow>
        <boxGeometry args={[0.55, 5.2, 0.55]} />
      </mesh>
      <mesh position={[0, 5.3, 0]} material={MATS.woodDark} castShadow>
        <boxGeometry args={[7.2, 0.75, 0.7]} />
      </mesh>
      <mesh ref={haloRef} position={[0, 3.1, 0]} material={completed ? MATS.beaconOn : MATS.gold}>
        <torusGeometry args={[1.65, 0.14, 8, 24]} />
      </mesh>
    </group>
  );
}

/** Tuerca Dorada coleccionable secreta del nivel. */
function GoldenNutPickup({ pos, collected }: { pos: [number, number, number]; collected: boolean }) {
  const nutRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!nutRef.current || collected) return;
    nutRef.current.rotation.y = clock.elapsedTime * 2.1;
    nutRef.current.rotation.x = Math.sin(clock.elapsedTime * 1.5) * 0.25;
    nutRef.current.position.y = pos[1] + Math.sin(clock.elapsedTime * 3.2) * 0.18;
  });
  if (collected) return null;
  return (
    <mesh ref={nutRef} position={pos} material={MATS.gold} castShadow>
      <torusGeometry args={[0.42, 0.18, 6, 6]} />
    </mesh>
  );
}

/**
 * Controlador común de expedición: cronómetro, checkpoints, caída al vacío,
 * recolección de Tuerca Dorada y meta final.
 */
function useExpeditionTracker(
  def: ExpeditionLevelDef,
  playerSourceRef: React.RefObject<CameraTargetSource>,
  checkpointIndex: number,
  goldenNutCollected: boolean,
  completedNow: boolean,
) {
  const playerPos = useRef(new THREE.Vector3());
  const fallCooldown = useRef(0);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    expeditionStore.tick(dt);
    fallCooldown.current = Math.max(0, fallCooldown.current - dt);

    if (!playerSourceRef.current.getTargetPosition(playerPos.current)) return;
    const lx = playerPos.current.x - def.origin[0];
    const ly = playerPos.current.y - def.origin[1];
    const lz = playerPos.current.z - def.origin[2];

    // Caída al vacío → reaparición instantánea en el último checkpoint
    if (ly < def.fallKillY && fallCooldown.current <= 0) {
      fallCooldown.current = 1.0;
      expeditionStore.respawnAtCheckpoint();
      gameStore.setWireHint('Volviste al último punto de control');
      return;
    }

    // Checkpoints intermedios
    for (let i = 0; i < def.checkpointsLocal.length; i++) {
      if (i + 1 <= checkpointIndex) continue;
      const [cx, cy, cz] = def.checkpointsLocal[i];
      if (Math.hypot(lx - cx, ly - cy, lz - cz) < 4.0) {
        expeditionStore.reachCheckpoint(i + 1);
        gameStore.celebrate(`¡Punto de control ${i + 1}!`, def.title);
      }
    }

    // Tuerca Dorada secreta
    if (!goldenNutCollected) {
      const [gx, gy, gz] = def.goldenNutLocal;
      if (Math.hypot(lx - gx, ly - gy, lz - gz) < 2.2) {
        expeditionStore.collectGoldenNut();
        gameStore.celebrate('¡Tuerca Dorada!', `Encontrada en ${def.title}`, 'achievement');
      }
    }

    // Meta / Cima final
    if (!completedNow) {
      const [fx, fy, fz] = def.goalLocal;
      if (Math.hypot(lx - fx, ly - fy, lz - fz) < 4.2) {
        expeditionStore.completeActiveLevel();
        gameStore.celebrate(`¡Nivel ${def.number} completado!`, def.title, 'achievement');
      }
    }
  });

  return playerPos;
}

/* ═══════════════════════════════════════════════════════════════════════════
   NIVEL 1 — EL PUENTE DEL ABISMO (98 m · un problema físico, un invento)
   Bahía de armado → puente angosto de 66 m sobre un abismo → plataforma final.
   Ruta a pie (opcional, mucho más lenta): rampa izquierda, barro del fondo, rampa derecha.
   ═══════════════════════════════════════════════════════════════════════════ */
const RAMP_ANGLE = Math.atan2(12, 22);

function Level1BridgeAbyss({
  def,
  playerSourceRef,
  checkpointIndex,
  goldenNutCollected,
  completedNow,
}: {
  def: ExpeditionLevelDef;
  playerSourceRef: React.RefObject<CameraTargetSource>;
  checkpointIndex: number;
  goldenNutCollected: boolean;
  completedNow: boolean;
}) {
  useExpeditionTracker(def, playerSourceRef, checkpointIndex, goldenNutCollected, completedNow);
  const oilRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (oilRef.current) oilRef.current.position.y = -11.88 + Math.sin(clock.elapsedTime * 2.2) * 0.03;
  });

  return (
    <group position={def.origin}>
      {/* Bahía de armado (z = -1..13): plataforma sólida, con pista pintada y bordes bajos */}
      <Block pos={[0, -6.5, 6]} size={[24, 13, 14]} mat={MATS.deck} />
      <GreyboxOnly>
        <mesh position={[0, 0.03, 6]} material={MATS.hazardYellow} receiveShadow>
          <boxGeometry args={[11, 0.06, 8]} />
        </mesh>
        <mesh position={[0, 0.07, 6]} material={MATS.deckDark} receiveShadow>
          <boxGeometry args={[10.4, 0.06, 7.4]} />
        </mesh>
      </GreyboxOnly>
      <Block pos={[-11.8, 0.5, 6]} size={[0.4, 1.2, 14]} mat={MATS.woodDark} />
      <Block pos={[11.8, 0.5, 6]} size={[0.4, 1.2, 14]} mat={MATS.woodDark} />
      <Block pos={[0, 0.5, -0.8]} size={[24, 1.2, 0.4]} mat={MATS.woodDark} />

      {/* Abismo: paredes y fondo de barro (z = 13..80, fondo en y = -12) */}
      <Block pos={[0, -12.5, 46]} size={[48, 1, 72]} mat={MATS.deckDark} shadow={false} />
      <GreyboxOnly>
        <mesh ref={oilRef} position={[0, -11.88, 46]} material={MATS.oil} receiveShadow>
          <boxGeometry args={[47, 0.1, 67]} />
        </mesh>
      </GreyboxOnly>
      <Block pos={[-24.5, -6, 46]} size={[1, 12, 68]} mat={MATS.cliff} />
      <Block pos={[24.5, -6, 46]} size={[1, 12, 68]} mat={MATS.cliff} />

      {/* El puente angosto (3 m de ancho × 67 m), con bordes señalizados */}
      <Block pos={[0, -0.25, 46.5]} size={[3, 0.5, 67]} mat={MATS.wood} />
      <GreyboxOnly>
        <mesh position={[-1.35, 0.03, 46.5]} material={MATS.hazardYellow}>
          <boxGeometry args={[0.2, 0.06, 67]} />
        </mesh>
        <mesh position={[1.35, 0.03, 46.5]} material={MATS.hazardYellow}>
          <boxGeometry args={[0.2, 0.06, 67]} />
        </mesh>
      </GreyboxOnly>
      <CheckpointBeacon pos={[0, 0, 46]} active={checkpointIndex >= 1} />

      {/* Ruta a pie (larga): rampa izquierda hacia el fondo y rampa derecha hacia la salida */}
      <Block pos={[-8, -6.44, 22.76]} size={[6, 1, 25.1]} rot={[RAMP_ANGLE, 0, 0]} mat={MATS.woodDark} />
      <Block pos={[8, -6.44, 69.24]} size={[6, 1, 25.1]} rot={[-RAMP_ANGLE, 0, 0]} mat={MATS.woodDark} />
      <GoldenNutPickup pos={[def.goldenNutLocal[0], def.goldenNutLocal[1], def.goldenNutLocal[2]]} collected={goldenNutCollected} />

      {/* Plataforma final (z = 80..98) con Checkpoint 2 y meta */}
      <Block pos={[0, -6.5, 89]} size={[24, 13, 18]} mat={MATS.deck} />
      <CheckpointBeacon pos={[0, 0, 84]} active={checkpointIndex >= 2} />
      <SummitArch pos={[0, 0.1, 96]} completed={completedNow} />
    </group>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   NIVEL 2 — EL CALLEJÓN DE LOS AUTOS (98 m · dos barreras de autos que se rompen por impacto)
   Bahía de armado → callejón de 17 m tapado por una barrera liviana (z 33..41) y una pesada
   (z 60..70) → portón del taller. Ruta a pie opcional: pasarela elevada sobre el lado izquierdo.
   ═══════════════════════════════════════════════════════════════════════════ */
const CATWALK_Y = 5;
const CATWALK_X = -7;
const UP_RAMP_ANGLE = Math.atan2(CATWALK_Y, 17);
const DOWN_RAMP_ANGLE = Math.atan2(CATWALK_Y, 12);

function Level2CarAlley({
  def,
  playerSourceRef,
  checkpointIndex,
  goldenNutCollected,
  completedNow,
}: {
  def: ExpeditionLevelDef;
  playerSourceRef: React.RefObject<CameraTargetSource>;
  checkpointIndex: number;
  goldenNutCollected: boolean;
  completedNow: boolean;
}) {
  useExpeditionTracker(def, playerSourceRef, checkpointIndex, goldenNutCollected, completedNow);
  const { runNonce } = useExpeditionStore();
  const upLen = Math.hypot(17, CATWALK_Y);
  const downLen = Math.hypot(12, CATWALK_Y);

  return (
    <>
      <group position={def.origin}>
        {/* Bahía de armado (z = -1..13) */}
        <Block pos={[0, -6.5, 6]} size={[24, 13, 14]} mat={MATS.deck} />
        <GreyboxOnly>
          <mesh position={[0, 0.03, 6]} material={MATS.hazardYellow} receiveShadow>
            <boxGeometry args={[11, 0.06, 8]} />
          </mesh>
          <mesh position={[0, 0.07, 6]} material={MATS.deckDark} receiveShadow>
            <boxGeometry args={[10.4, 0.06, 7.4]} />
          </mesh>
        </GreyboxOnly>
        <Block pos={[-11.8, 0.5, 6]} size={[0.4, 1.2, 14]} mat={MATS.woodDark} />
        <Block pos={[11.8, 0.5, 6]} size={[0.4, 1.2, 14]} mat={MATS.woodDark} />
        <Block pos={[0, 0.5, -0.8]} size={[24, 1.2, 0.4]} mat={MATS.woodDark} />

        {/* Callejón (z = 13..98, 17 m de ancho) con paredes de contenedores de 6 m */}
        <Block pos={[0, -3.5, 55.5]} size={[17, 7, 85]} mat={MATS.deck} />
        <Block pos={[-9, 3, 55.5]} size={[1, 6, 85]} mat={MATS.tealContainer} />
        <Block pos={[9, 3, 55.5]} size={[1, 6, 85]} mat={MATS.rust} />
        <Block pos={[-10.75, 3, 13.5]} size={[3.5, 6, 1]} mat={MATS.deckDark} />
        <Block pos={[10.75, 3, 13.5]} size={[3.5, 6, 1]} mat={MATS.deckDark} />
        <Block pos={[0, 3, 98.5]} size={[17, 6, 1]} mat={MATS.deckDark} />

        <CheckpointBeacon pos={[0, 0, 50]} active={checkpointIndex >= 1} />
        <CheckpointBeacon pos={[0, 0, 80]} active={checkpointIndex >= 2} />
        <SummitArch pos={[0, 0.1, 96]} completed={completedNow} />

        {/* Ruta a pie (opcional): rampa de subida, pasarela sobre el lado izquierdo y rampa de bajada */}
        <Block
          pos={[CATWALK_X, CATWALK_Y / 2 - 0.24, 21.5 + 0.08]}
          size={[3, 0.5, upLen]}
          rot={[-UP_RAMP_ANGLE, 0, 0]}
          mat={MATS.woodDark}
        />
        <Block pos={[CATWALK_X, CATWALK_Y - 0.25, 58]} size={[3, 0.5, 56]} mat={MATS.wood} />
        <Block
          pos={[CATWALK_X, CATWALK_Y / 2 - 0.23, 92 - 0.1]}
          size={[3, 0.5, downLen]}
          rot={[DOWN_RAMP_ANGLE, 0, 0]}
          mat={MATS.woodDark}
        />
        <GoldenNutPickup pos={[def.goldenNutLocal[0], def.goldenNutLocal[1], def.goldenNutLocal[2]]} collected={goldenNutCollected} />
      </group>

      {/* Barreras de autos: cuerpos dinámicos en coordenadas de mundo; se rearman al reiniciar */}
      <CarBarrier id="a" origin={def.origin} runKey={runNonce} />
      <CarBarrier id="b" origin={def.origin} runKey={runNonce} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   NIVEL 3 — LA PLANTA TRITURADORA (104 m · MARTILLOS, PUENTE Y COMPUERTA)
   ═══════════════════════════════════════════════════════════════════════════ */
function PendulumHammer({
  origin,
  localPos,
  phase,
}: {
  origin: readonly [number, number, number];
  localPos: [number, number, number];
  phase: number;
}) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const zAxis = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  useFrame(({ clock }) => {
    if (!bodyRef.current?.isValid()) return;
    const angle = Math.sin(clock.elapsedTime * 1.75 + phase) * 0.92;
    const armLen = 4.6;
    const px = origin[0] + localPos[0] + Math.sin(angle) * armLen;
    const py = origin[1] + localPos[1] - Math.cos(angle) * armLen;
    const pz = origin[2] + localPos[2];
    bodyRef.current.setNextKinematicTranslation({ x: px, y: py, z: pz });
    quat.setFromAxisAngle(zAxis, angle);
    bodyRef.current.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
  });

  return (
    <group>
      {/* Arco superior del martillo */}
      <mesh position={[localPos[0], localPos[1], localPos[2]]} material={MATS.steel}>
        <boxGeometry args={[12.4, 0.7, 0.7]} />
      </mesh>
      <RigidBody ref={bodyRef} type="kinematicPosition" position={[localPos[0], localPos[1] - 4.6, localPos[2]]} colliders={false}>
        <CuboidCollider args={[1.1, 0.85, 0.9]} />
        <mesh position={[0, 2.3, 0]} material={MATS.steel}>
          <boxGeometry args={[0.28, 4.6, 0.28]} />
        </mesh>
        <mesh material={MATS.rust} castShadow receiveShadow>
          <boxGeometry args={[2.2, 1.7, 1.8]} />
        </mesh>
        <mesh position={[0, 0, 0.92]} material={MATS.hazardYellow}>
          <boxGeometry args={[1.8, 0.32, 0.08]} />
        </mesh>
      </RigidBody>
    </group>
  );
}

function CollapsibleBridgeTile({
  origin,
  localPos,
  playerPosRef,
}: {
  origin: readonly [number, number, number];
  localPos: [number, number, number];
  playerPosRef: React.RefObject<THREE.Vector3>;
}) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const [warn, setWarn] = useState(false);
  const timerRef = useRef(0);
  const stateRef = useRef<'solid' | 'shaking' | 'fallen'>('solid');

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const lx = playerPosRef.current.x - origin[0];
    const ly = playerPosRef.current.y - origin[1];
    const lz = playerPosRef.current.z - origin[2];

    const onTile =
      Math.abs(lx - localPos[0]) < 3.4 &&
      Math.abs(lz - localPos[2]) < 2.5 &&
      Math.abs(ly - localPos[1]) < 2.2;

    if (stateRef.current === 'solid' && onTile) {
      stateRef.current = 'shaking';
      timerRef.current = 1.1;
      setWarn(true);
    } else if (stateRef.current === 'shaking') {
      timerRef.current -= dt;
      if (timerRef.current <= 0) {
        stateRef.current = 'fallen';
        timerRef.current = 3.8;
        playWeldClank();
      }
    } else if (stateRef.current === 'fallen') {
      timerRef.current -= dt;
      if (timerRef.current <= 0) {
        stateRef.current = 'solid';
        setWarn(false);
      }
    }

    if (bodyRef.current?.isValid()) {
      let yOffset = 0;
      let xShake = 0;
      if (stateRef.current === 'shaking') {
        xShake = Math.sin(clock.elapsedTime * 42) * 0.08;
        yOffset = -0.06;
      } else if (stateRef.current === 'fallen') {
        yOffset = -8.5;
      }
      bodyRef.current.setNextKinematicTranslation({
        x: origin[0] + localPos[0] + xShake,
        y: origin[1] + localPos[1] + yOffset,
        z: origin[2] + localPos[2],
      });
    }
  });

  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" position={localPos} colliders={false}>
      <CuboidCollider args={[3.3, 0.28, 2.3]} />
      <mesh material={warn ? MATS.fragileWarn : MATS.fragile} castShadow receiveShadow>
        <boxGeometry args={[6.6, 0.56, 4.6]} />
      </mesh>
    </RigidBody>
  );
}

function Level3CrusherPlant({
  def,
  playerSourceRef,
  checkpointIndex,
  goldenNutCollected,
  completedNow,
}: {
  def: ExpeditionLevelDef;
  playerSourceRef: React.RefObject<CameraTargetSource>;
  checkpointIndex: number;
  goldenNutCollected: boolean;
  completedNow: boolean;
}) {
  const playerPos = useExpeditionTracker(def, playerSourceRef, checkpointIndex, goldenNutCollected, completedNow);
  const [gateOpen, setGateOpen] = useState(false);
  const gateTimerRef = useRef(0);
  const gateYRef = useRef(2.6);
  const gateBodyRef = useRef<RapierRigidBody | null>(null);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const lx = playerPos.current.x - def.origin[0];
    const ly = playerPos.current.y - def.origin[1];
    const lz = playerPos.current.z - def.origin[2];

    // Placa de presión en [0, 0.4, 84]
    if (Math.hypot(lx, ly - 0.5, lz - 84) < 2.8) {
      if (!gateOpen) {
        setGateOpen(true);
        playWeldClank();
        gameStore.celebrate('¡Compuerta abierta!', '14 segundos para cruzar');
      }
      gateTimerRef.current = 14.0;
    } else if (gateOpen) {
      gateTimerRef.current -= dt;
      if (gateTimerRef.current <= 0) setGateOpen(false);
    }

    const targetY = gateOpen ? 7.6 : 2.6;
    gateYRef.current = THREE.MathUtils.lerp(gateYRef.current, targetY, 1 - Math.exp(-3.5 * dt));
    if (gateBodyRef.current?.isValid()) {
      gateBodyRef.current.setNextKinematicTranslation({
        x: def.origin[0],
        y: def.origin[1] + gateYRef.current,
        z: def.origin[2] + 92,
      });
    }
  });

  return (
    <group position={def.origin}>
      {/* Sala de salida (z = 0..12) */}
      <Block pos={[0, -0.5, 6]} size={[14, 1, 12]} mat={MATS.deck} />

      {/* SALA 1: Galería de Martillos Pendulares (z = 12..42) */}
      <Block pos={[0, -0.5, 27]} size={[10.5, 1, 30]} mat={MATS.deckDark} />
      {/* Pasarelas altas laterales para parkour a pie */}
      <Block pos={[-7.0, 2.2, 27]} size={[2.6, 0.5, 28]} mat={MATS.steel} />
      <Block pos={[7.0, 2.2, 27]} size={[2.6, 0.5, 28]} mat={MATS.steel} />
      <Block pos={[-7.0, 1.0, 12.2]} size={[2.6, 0.4, 3.6]} rot={[-0.45, 0, 0]} mat={MATS.wood} />
      <Block pos={[7.0, 1.0, 12.2]} size={[2.6, 0.4, 3.6]} rot={[-0.45, 0, 0]} mat={MATS.wood} />
      {/* Columnas de fundición con brillo cálido */}
      {[15, 27, 39].map((z) => (
        <group key={z}>
          <mesh position={[-8.6, 3.5, z]} material={MATS.deckDark}>
            <boxGeometry args={[0.9, 8.0, 0.9]} />
          </mesh>
          <mesh position={[8.6, 3.5, z]} material={MATS.deckDark}>
            <boxGeometry args={[0.9, 8.0, 0.9]} />
          </mesh>
          <mesh position={[-8.1, 1.6, z]} material={MATS.furnace}>
            <boxGeometry args={[0.15, 2.2, 0.5]} />
          </mesh>
          <mesh position={[8.1, 1.6, z]} material={MATS.furnace}>
            <boxGeometry args={[0.15, 2.2, 0.5]} />
          </mesh>
        </group>
      ))}
      <PendulumHammer origin={def.origin} localPos={[0, 6.2, 18]} phase={0} />
      <PendulumHammer origin={def.origin} localPos={[0, 6.2, 27]} phase={2.1} />
      <PendulumHammer origin={def.origin} localPos={[0, 6.2, 36]} phase={4.2} />

      {/* Viga alta con Tuerca Dorada sobre el Martillo #2 */}
      <Block pos={[-3.5, 4.4, 27]} size={[4.2, 0.4, 1.6]} rot={[0, 0, 0.46]} mat={MATS.wood} />
      <Block pos={[0, 5.9, 27]} size={[3.0, 0.45, 2.2]} mat={MATS.steel} />
      <GoldenNutPickup pos={[def.goldenNutLocal[0], def.goldenNutLocal[1], def.goldenNutLocal[2]]} collected={goldenNutCollected} />

      {/* Plataforma Checkpoint 1 (z = 42..48) */}
      <Block pos={[0, -0.5, 45]} size={[13, 1, 6]} mat={MATS.deck} />
      <CheckpointBeacon pos={[0, 0, 44]} active={checkpointIndex >= 1} />

      {/* SALA 2: Puente Colapsable de Vigas (z = 48..73) */}
      <Block pos={[0, -0.35, 50.5]} size={[7.2, 0.6, 4.6]} mat={MATS.steel} />
      <CollapsibleBridgeTile origin={def.origin} localPos={[0, -0.35, 55.6]} playerPosRef={playerPos} />
      <CollapsibleBridgeTile origin={def.origin} localPos={[0, -0.35, 60.8]} playerPosRef={playerPos} />
      <CollapsibleBridgeTile origin={def.origin} localPos={[0, -0.35, 66.0]} playerPosRef={playerPos} />
      <Block pos={[0, -0.35, 71.0]} size={[7.2, 0.6, 4.6]} mat={MATS.steel} />
      {/* Vigas laterales finas (parkour de precisión) */}
      <Block pos={[-5.2, -0.2, 60.5]} size={[1.1, 0.5, 25]} mat={MATS.craneOrange} />
      <Block pos={[5.2, -0.2, 60.5]} size={[1.1, 0.5, 25]} mat={MATS.craneOrange} />

      {/* Plataforma Checkpoint 2 + Sala de Compuerta (z = 73..92) */}
      <Block pos={[0, -0.5, 82.5]} size={[14, 1, 19]} mat={MATS.deck} />
      <CheckpointBeacon pos={[0, 0, 76]} active={checkpointIndex >= 2} />

      {/* Placa de presión hidráulica */}
      <Block pos={[0, 0.14, 84]} size={[4.2, 0.28, 3.6]} mat={gateOpen ? MATS.beaconOn : MATS.hazardYellow} />

      {/* Marco y Compuerta Hidráulica cinemática (z = 92) */}
      <Block pos={[-5.8, 3.2, 92]} size={[2.2, 6.4, 1.4]} mat={MATS.deckDark} />
      <Block pos={[5.8, 3.2, 92]} size={[2.2, 6.4, 1.4]} mat={MATS.deckDark} />
      <Block pos={[0, 6.2, 92]} size={[13.8, 1.2, 1.6]} mat={MATS.deckDark} />
      <RigidBody ref={gateBodyRef} type="kinematicPosition" position={[0, 2.6, 92]} colliders={false}>
        <CuboidCollider args={[4.6, 2.6, 0.45]} />
        <mesh material={MATS.rust} castShadow receiveShadow>
          <boxGeometry args={[9.2, 5.2, 0.9]} />
        </mesh>
        <mesh position={[0, -1.6, -0.48]} material={MATS.hazardYellow}>
          <boxGeometry args={[8.4, 0.45, 0.08]} />
        </mesh>
      </RigidBody>

      {/* Andamio lateral para cruzar por arriba a pie */}
      <Block pos={[-7.6, 1.6, 86.5]} size={[2.4, 0.5, 4.2]} rot={[-0.38, 0, 0]} mat={MATS.wood} />
      <Block pos={[-7.6, 4.2, 90.5]} size={[2.4, 0.5, 4.8]} rot={[-0.38, 0, 0]} mat={MATS.wood} />
      <Block pos={[-7.6, 6.6, 94.5]} size={[2.8, 0.5, 4.2]} mat={MATS.steel} />

      {/* Podio Maestro Final (z = 92..108) */}
      <Block pos={[0, -0.5, 100]} size={[14, 1, 16]} mat={MATS.deck} />
      <Block pos={[0, 0.5, 101]} size={[8, 1.0, 6]} mat={MATS.wood} />
      <SummitArch pos={[0, 1.0, 101]} completed={completedNow} />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   NIVEL 4 — OPERACIÓN: PILAS DEL CONTROL (nocturno, vertical)
   Bahía + patio con faro y autos viejos → rampa 4x4 con postes magnéticos → meseta → cima.
   ═══════════════════════════════════════════════════════════════════════════ */
const L4_RAMP1 = { z0: 56, z1: 100, rise: 18 };
const L4_RAMP2 = { z0: 108, z1: 128, y0: 18, y1: 30 };
const L4_LIGHTHOUSE: [number, number, number] = [-16, 0, 34];
const L4_DOME_ID = 'level4-lighthouse-dome';

/** Piezas del patio (locales). `condition` deja la pieza descargada o rota para reparar. */
const L4_YARD_PARTS: { kind: GrabbableKind; pos: [number, number, number]; condition?: 'broken' | 'discharged' }[] = [
  { kind: 'chassis', pos: [16, 1.4, 36] },
  { kind: 'wheel', pos: [13, 1, 32] },
  { kind: 'wheel', pos: [19, 1, 32] },
  { kind: 'wheel', pos: [13, 1, 40] },
  { kind: 'wheel', pos: [19, 1, 40] },
  { kind: 'seat', pos: [21, 1, 44] },
  { kind: 'part', pos: [22, 1, 34], condition: 'broken' },
  { kind: 'battery', pos: [22, 1, 38], condition: 'discharged' },
  { kind: 'crate', pos: [-6, 1, 9] },
  { kind: 'crate', pos: [-8, 1, 9] },
  { kind: 'thruster', pos: [-4, 1, 12] },
  { kind: 'thruster', pos: [-6, 1, 12] },
  { kind: 'magnet', pos: [-10, 1, 11] },
];

function ramp1Y(z: number) {
  return ((z - L4_RAMP1.z0) / (L4_RAMP1.z1 - L4_RAMP1.z0)) * L4_RAMP1.rise;
}

function Lighthouse({ resetKey }: { resetKey: number }) {
  const domeRef = useRef<RapierRigidBody>(null);
  const towerRef = useRef<RapierRigidBody>(null);
  const beamRef = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const [fallen, setFallen] = useState(false);
  const DOME_MASS = 80;

  useEffect(() => {
    setFallen(false);
    return registerWorldTags(L4_DOME_ID, {
      isMagnetic: true,
      isCuttable: true,
      conductsPower: false,
      breakForce: weightMultiple(DOME_MASS, 14),
    });
  }, [resetKey]);

  useFrame((_, dt) => {
    if (beamRef.current) beamRef.current.rotation.y += dt * 0.7;
  });

  return (
    <group position={L4_LIGHTHOUSE}>
      <RigidBody ref={towerRef} type="fixed" position={[0, 5, 0]} colliders={false}>
        <CylinderCollider args={[5, 1.7]} />
        <mesh material={MATS.rust} castShadow receiveShadow>
          <cylinderGeometry args={[1.2, 1.7, 10, 12]} />
        </mesh>
        <mesh position={[0, 1.5, 0]} material={MATS.hazardYellow}>
          <cylinderGeometry args={[1.5, 1.55, 1.1, 12]} />
        </mesh>
        <mesh position={[0, -1.5, 0]} material={MATS.hazardYellow}>
          <cylinderGeometry args={[1.62, 1.66, 1.1, 12]} />
        </mesh>
      </RigidBody>
      <RigidBody ref={domeRef} type="dynamic" position={[0, 10.9, 0]} colliders={false} key={`dome-${resetKey}`}>
        <CylinderCollider args={[0.8, 1.4]} mass={DOME_MASS} />
        <mesh material={MATS.steel} castShadow>
          <cylinderGeometry args={[1.4, 1.4, 1.6, 12]} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[1.05, 1.05, 1.1, 12]} />
          <meshStandardMaterial color="#fff2b0" emissive="#ffe27a" emissiveIntensity={3} />
        </mesh>
        <group ref={beamRef} position={[0, 0.2, 0]}>
          <spotLight
            position={[0, 0, 0]}
            target={target}
            color="#fff0c0"
            intensity={900}
            angle={0.42}
            penumbra={0.55}
            distance={110}
            decay={1.6}
          />
          <primitive object={target} position={[40, -3, 0]} />
        </group>
      </RigidBody>
      {!fallen && (
        <BreakableFixedJoint
          getBodyA={() => towerRef.current}
          getBodyB={() => domeRef.current}
          limits={{ breakForce: weightMultiple(DOME_MASS, 14), breakTorque: 900 }}
          grindableIds={[L4_DOME_ID]}
          watchConsumedIds={[L4_DOME_ID]}
          onBreak={() => gameStore.setWireHint('¡Se cayó el faro!')}
          resetKey={resetKey}
        />
      )}
    </group>
  );
}

function MagneticPole({ id, pos, height, origin }: { id: string; pos: [number, number, number]; height: number; origin: readonly [number, number, number] }) {
  useEffect(
    () =>
      registerMagneticAnchor(id, {
        x: origin[0] + pos[0],
        z: origin[2] + pos[2],
        yMin: origin[1] + pos[1],
        yMax: origin[1] + pos[1] + height,
        range: 2.2,
      }),
    [id, pos, height, origin],
  );
  return (
    <RigidBody type="fixed" position={[pos[0], pos[1] + height / 2, pos[2]]} colliders={false}>
      <CylinderCollider args={[height / 2, 0.22]} />
      <mesh material={MATS.steel} castShadow>
        <cylinderGeometry args={[0.18, 0.18, height, 8]} />
      </mesh>
      <mesh position={[0, height / 2 - 0.2, 0]} material={MATS.hazardYellow}>
        <cylinderGeometry args={[0.24, 0.24, 0.4, 8]} />
      </mesh>
    </RigidBody>
  );
}

function ChargeStationProp({ id, pos }: { id: string; pos: [number, number, number] }) {
  useEffect(() => registerChargeStation(id, pos), [id, pos]);
  return (
    <group position={pos}>
      <Block pos={[0, 0.9, 0]} size={[1.6, 1.8, 1.2]} mat={MATS.craneOrange} />
      <mesh position={[0, 2.1, 0]}>
        <boxGeometry args={[0.9, 0.5, 0.2]} />
        <meshStandardMaterial color="#6cf2a8" emissive="#35e08a" emissiveIntensity={2.2} />
      </mesh>
      <pointLight position={[0, 2.4, 0.8]} color="#6cf2a8" intensity={14} distance={9} decay={2} />
    </group>
  );
}

function DonorCarShell({ pos, rotY = 0 }: { pos: [number, number, number]; rotY?: number }) {
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <Block pos={[0, 0.7, 0]} size={[2.2, 0.9, 4.4]} mat={MATS.rust} />
      <Block pos={[0, 1.5, -0.3]} size={[1.9, 0.8, 2.2]} mat={MATS.woodDark} />
    </group>
  );
}

function Level4Batteries({
  def,
  playerSourceRef,
  checkpointIndex,
  goldenNutCollected,
  completedNow,
}: {
  def: ExpeditionLevelDef;
  playerSourceRef: React.RefObject<CameraTargetSource>;
  checkpointIndex: number;
  goldenNutCollected: boolean;
  completedNow: boolean;
}) {
  useExpeditionTracker(def, playerSourceRef, checkpointIndex, goldenNutCollected, completedNow);
  const { runNonce } = useExpeditionStore();

  // Piezas del patio: se crean al iniciar el nivel y se quitan al salir o reintentar.
  useEffect(() => {
    resetPartConditions();
    const ids: string[] = [];
    for (const p of L4_YARD_PARTS) {
      const entry = gameStore.spawnExtraPart(p.kind, [def.origin[0] + p.pos[0], def.origin[1] + p.pos[1], def.origin[2] + p.pos[2]]);
      if (!entry) continue;
      ids.push(entry.id);
      if (p.condition) setPartCondition(entry.id, p.condition);
    }
    return () => {
      for (const id of ids) gameStore.removeExtraPart(id);
    };
  }, [runNonce, def.origin]);

  const rampLen1 = Math.hypot(L4_RAMP1.z1 - L4_RAMP1.z0, L4_RAMP1.rise);
  const ang1 = Math.atan2(L4_RAMP1.rise, L4_RAMP1.z1 - L4_RAMP1.z0);
  const rampLen2 = Math.hypot(L4_RAMP2.z1 - L4_RAMP2.z0, L4_RAMP2.y1 - L4_RAMP2.y0);
  const ang2 = Math.atan2(L4_RAMP2.y1 - L4_RAMP2.y0, L4_RAMP2.z1 - L4_RAMP2.z0);

  return (
    <group position={def.origin}>
      {/* Bahía de armado (z = 0..16) y patio (z = 16..56) */}
      <Block pos={[0, -6.5, 28]} size={[60, 13, 56]} mat={MATS.deck} />
      <Block pos={[0, 0.4, -0.8]} size={[60, 1, 0.4]} mat={MATS.woodDark} />
      <Block pos={[-30.2, 0.8, 28]} size={[0.4, 1.8, 56]} mat={MATS.woodDark} />
      <Block pos={[30.2, 0.8, 28]} size={[0.4, 1.8, 56]} mat={MATS.woodDark} />
      <GreyboxOnly>
        <mesh position={[0, 0.03, 8]} material={MATS.hazardYellow} receiveShadow>
          <boxGeometry args={[12, 0.06, 10]} />
        </mesh>
      </GreyboxOnly>

      <ChargeStationProp id="level4-generator" pos={[11, 0, 8]} />
      <Lighthouse resetKey={runNonce} />
      <DonorCarShell pos={[16, 0, 36]} rotY={0.2} />
      <DonorCarShell pos={[24, 0, 46]} rotY={-0.5} />
      <DonorCarShell pos={[10, 0, 48]} rotY={1.1} />

      {/* Rampa 1 (ruta 4x4) con postes metálicos a los costados para trepar con imán */}
      <Block pos={[0, L4_RAMP1.rise / 2 - 0.5, (L4_RAMP1.z0 + L4_RAMP1.z1) / 2]} size={[12, 1, rampLen1]} rot={[-ang1, 0, 0]} mat={MATS.deckDark} />
      {[66, 78, 90].map((z, i) => (
        <group key={z}>
          <MagneticPole id={`level4-pole-l${i}`} pos={[-9, ramp1Y(z) - 1, z]} height={14} origin={def.origin} />
          <MagneticPole id={`level4-pole-r${i}`} pos={[9, ramp1Y(z) - 1, z]} height={14} origin={def.origin} />
        </group>
      ))}
      <CheckpointBeacon pos={[0, ramp1Y(80), 80]} active={checkpointIndex >= 1} />

      {/* Meseta (z = 100..108) y rampa 2 */}
      <Block pos={[0, L4_RAMP2.y0 - 0.5, 104]} size={[14, 1, 8.4]} mat={MATS.deck} />
      <CheckpointBeacon pos={[0, L4_RAMP2.y0, 104]} active={checkpointIndex >= 2} />
      <Block pos={[0, (L4_RAMP2.y0 + L4_RAMP2.y1) / 2 - 0.5, (L4_RAMP2.z0 + L4_RAMP2.z1) / 2]} size={[10, 1, rampLen2]} rot={[-ang2, 0, 0]} mat={MATS.deckDark} />

      {/* Cima con las pilas del control */}
      <Block pos={[0, L4_RAMP2.y1 - 0.5, 134]} size={[16, 1, 12]} mat={MATS.deck} />
      <SummitArch pos={[0, L4_RAMP2.y1, 134]} completed={completedNow} />
      {[-0.5, 0.5].map((dx) => (
        <mesh key={dx} position={[dx, L4_RAMP2.y1 + 1.3, 134]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 0.9, 10]} />
          <meshStandardMaterial color="#ffd23a" emissive="#ffb800" emissiveIntensity={completedNow ? 0.4 : 2.4} />
        </mesh>
      ))}

      {/* Ruta escondida a la Tuerca Dorada: escalones por el costado izquierdo, fuera del camino obvio */}
      <Block pos={[-22, 0.6, 66]} size={[3, 1.2, 3]} mat={MATS.wood} />
      <Block pos={[-22, 1.6, 70]} size={[3, 1.2, 3]} mat={MATS.wood} />
      <Block pos={[-22, 2.6, 74]} size={[3, 1.2, 3]} mat={MATS.wood} />
      <Block pos={[-22, 3.6, 79]} size={[5, 1.2, 5]} mat={MATS.woodDark} />
      <GoldenNutPickup pos={[def.goldenNutLocal[0], def.goldenNutLocal[1], def.goldenNutLocal[2]]} collected={goldenNutCollected} />
    </group>
  );
}

/**
 * Monta únicamente el nivel de expedición activo (0 costo de GPU/física cuando estás en el taller).
 */
export function ExpeditionLevels({
  playerSourceRef,
}: {
  playerSourceRef: React.RefObject<CameraTargetSource>;
}) {
  const { activeLevelId, checkpointIndex, goldenNutThisRun, completedNow } = useExpeditionStore();
  // Al cambiar de nivel, limpiar cualquier aviso viejo
  useEffect(() => {
    if (activeLevelId) {
      const def = EXPEDITION_LEVEL_BY_ID[activeLevelId];
      gameStore.celebrate(`Nivel ${def.number} · ${def.title}`, def.subtitle);
    }
  }, [activeLevelId]);

  if (!activeLevelId) return null;
  const def = EXPEDITION_LEVEL_BY_ID[activeLevelId];

  const levelProps = {
    def,
    playerSourceRef,
    checkpointIndex,
    goldenNutCollected: goldenNutThisRun,
    completedNow,
  };
  // LevelArt carga el .glb del nivel (si existe) y oculta los bloques de prueba; la física no cambia.
  return (
    <LevelArt levelId={activeLevelId} origin={def.origin}>
      {activeLevelId === 'level-1-swamp' && <Level1BridgeAbyss {...levelProps} />}
      {activeLevelId === 'level-2-wind' && <Level2CarAlley {...levelProps} />}
      {activeLevelId === 'level-3-crusher' && <Level3CrusherPlant {...levelProps} />}
      {activeLevelId === 'level-4-batteries' && <Level4Batteries {...levelProps} />}
    </LevelArt>
  );
}

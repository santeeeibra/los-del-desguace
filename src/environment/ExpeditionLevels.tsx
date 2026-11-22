import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import type { CameraTargetSource } from '../controls/ThirdPersonCamera';
import { playWeldClank } from '../audio/sfxEngine';
import {
  EXPEDITION_LEVEL_BY_ID,
  expeditionStore,
  localToWorld,
  useExpeditionStore,
  windGustFactor,
  type ExpeditionLevelDef,
} from '../modes/expeditionLevels';
import { gameStore } from '../state/gameStore';

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
  return (
    <RigidBody type="fixed" position={pos} rotation={rot} colliders={false}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
      <mesh material={mat} castShadow={shadow} receiveShadow>
        <boxGeometry args={size} />
      </mesh>
    </RigidBody>
  );
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
   NIVEL 1 — EL PANTANO DE ACEITE Y LA GRÚA ROTA (98 m)
   ═══════════════════════════════════════════════════════════════════════════ */
function Level1OilSwamp({
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
  const [bridgeLowered, setBridgeLowered] = useState(false);
  const bridgeBodyRef = useRef<RapierRigidBody | null>(null);
  const bridgeAngleRef = useRef(0.92);
  const bridgeQuat = useMemo(() => new THREE.Quaternion(), []);
  const bridgeAxis = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const oilRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    if (oilRef.current) {
      oilRef.current.position.y = -0.34 + Math.sin(clock.elapsedTime * 2.2) * 0.03;
    }

    // Detectar activación del contrapeso del puente levadizo (en [4.2, 0.8, 46])
    if (!bridgeLowered) {
      const lx = playerPos.current.x - def.origin[0];
      const ly = playerPos.current.y - def.origin[1];
      const lz = playerPos.current.z - def.origin[2];
      if (Math.hypot(lx - 4.2, ly - 0.8, lz - 46) < 2.2) {
        setBridgeLowered(true);
        playWeldClank();
        gameStore.celebrate('¡Puente levadizo bajado!', 'Paso libre sobre la quebrada');
      }
    }

    // Animar suavemente el puente levadizo cinemático
    const targetAngle = bridgeLowered ? 0 : 0.92;
    if (Math.abs(bridgeAngleRef.current - targetAngle) > 0.002) {
      bridgeAngleRef.current = THREE.MathUtils.lerp(bridgeAngleRef.current, targetAngle, 1 - Math.exp(-3.2 * dt));
    }
    if (bridgeBodyRef.current?.isValid()) {
      const a = bridgeAngleRef.current;
      // Pivote en z = 49, y = 0.0 (extiende 11m hacia +Z)
      const halfLen = 5.5;
      const worldPivot = localToWorld(def.origin, [0, 0.0, 49]);
      bridgeBodyRef.current.setNextKinematicTranslation({
        x: worldPivot[0],
        y: worldPivot[1] + Math.sin(a) * halfLen,
        z: worldPivot[2] + Math.cos(a) * halfLen,
      });
      bridgeQuat.setFromAxisAngle(bridgeAxis, -a);
      bridgeBodyRef.current.setNextKinematicRotation({
        x: bridgeQuat.x, y: bridgeQuat.y, z: bridgeQuat.z, w: bridgeQuat.w,
      });
    }
  });

  return (
    <group position={def.origin}>
      {/* Plataforma de salida (0..11m) */}
      <Block pos={[0, -0.5, 5]} size={[14, 1, 12]} mat={MATS.deck} />
      <Block pos={[-6.8, 0.5, 5]} size={[0.4, 1.2, 12]} mat={MATS.woodDark} />
      <Block pos={[6.8, 0.5, 5]} size={[0.4, 1.2, 12]} mat={MATS.woodDark} />

      {/* TRAMO 1: Fosa de barro/aceite (z = 11..37, 26m de largo) */}
      <Block pos={[0, -1.1, 24]} size={[18, 1, 28]} mat={MATS.deckDark} shadow={false} />
      <mesh ref={oilRef} position={[0, -0.34, 24]} material={MATS.oil} receiveShadow>
        <boxGeometry args={[17.6, 0.14, 26]} />
      </mesh>
      {/* Islas / pasarela central irregular para vehículos */}
      <Block pos={[0, -0.32, 17]} size={[4.2, 0.5, 5.5]} rot={[0.04, 0.08, 0]} mat={MATS.wood} />
      <Block pos={[1.2, -0.25, 25]} size={[4.0, 0.5, 6.2]} rot={[-0.03, -0.1, 0]} mat={MATS.wood} />
      <Block pos={[-0.8, -0.3, 33]} size={[4.4, 0.5, 5.2]} rot={[0.03, 0.06, 0]} mat={MATS.wood} />

      {/* Ruta de Parkour elevada por contenedores volcados (izquierda y derecha) */}
      <Block pos={[-6.2, 0.9, 15]} size={[2.8, 2.2, 6.2]} rot={[0.08, 0.12, -0.08]} mat={MATS.tealContainer} />
      <Block pos={[-5.4, 1.5, 22.5]} size={[2.6, 2.2, 5.8]} rot={[-0.06, -0.08, 0.06]} mat={MATS.rust} />
      <Block pos={[-6.0, 1.1, 30.2]} size={[2.8, 2.2, 6.0]} rot={[0.05, 0.1, 0]} mat={MATS.tealContainer} />
      <Block pos={[6.2, 0.8, 19]} size={[2.6, 2.0, 6.4]} rot={[-0.06, -0.12, 0.08]} mat={MATS.rust} />
      <Block pos={[5.6, 1.2, 28]} size={[2.6, 2.0, 6.0]} rot={[0.08, 0.08, -0.06]} mat={MATS.tealContainer} />

      {/* Isla Checkpoint 1 (z = 37..49) */}
      <Block pos={[0, -0.5, 43]} size={[14, 1, 12]} mat={MATS.deck} />
      <CheckpointBeacon pos={[0, 0, 40]} active={checkpointIndex >= 1} />

      {/* Contrapeso / Interruptor del puente levadizo */}
      <Block pos={[4.2, 0.25, 46]} size={[2.2, 0.5, 2.2]} mat={bridgeLowered ? MATS.beaconOn : MATS.hazardYellow} />
      <mesh position={[4.2, 1.35, 46]} material={bridgeLowered ? MATS.beaconOn : MATS.beaconOff}>
        <boxGeometry args={[0.35, 1.8, 0.35]} />
      </mesh>

      {/* TRAMO 2: Quebrada de la Grúa Rota (z = 49..60, brecha de 11m) */}
      <RigidBody ref={bridgeBodyRef} type="kinematicPosition" position={[0, 0, 54.5]} colliders={false}>
        <CuboidCollider args={[3.2, 0.28, 5.5]} />
        <mesh material={MATS.hazardYellow} castShadow receiveShadow>
          <boxGeometry args={[6.4, 0.56, 11]} />
        </mesh>
      </RigidBody>

      {/* Grúa pórtico caída al costado izquierdo (ruta de parkour aéreo + cabina con Tuerca Dorada) */}
      <Block pos={[-5.8, 2.2, 49]} size={[2.2, 4.4, 2.2]} mat={MATS.craneOrange} />
      <Block pos={[-5.8, 4.6, 52.5]} size={[2.2, 0.5, 5.5]} rot={[-0.36, 0, 0]} mat={MATS.craneOrange} />
      {/* Cabina de la grúa con Tuerca Dorada */}
      <Block pos={[-5.8, 5.9, 56]} size={[3.2, 0.5, 3.6]} mat={MATS.craneOrange} />
      <Block pos={[-5.8, 3.8, 60.2]} size={[1.8, 0.45, 6.2]} rot={[0.38, 0, 0]} mat={MATS.craneOrange} />
      {/* Escalera de cajas para subir a la grúa a pie */}
      <Block pos={[-5.8, 0.7, 45.2]} size={[2.2, 1.4, 2.0]} mat={MATS.wood} />
      <Block pos={[-5.8, 1.9, 46.9]} size={[2.2, 1.4, 1.8]} mat={MATS.wood} />
      <GoldenNutPickup pos={[def.goldenNutLocal[0], def.goldenNutLocal[1], def.goldenNutLocal[2]]} collected={goldenNutCollected} />

      {/* Plataforma tras el puente + Checkpoint 2 (z = 60..77) */}
      <Block pos={[0, -0.5, 68.5]} size={[14, 1, 17]} mat={MATS.deck} />
      <CheckpointBeacon pos={[0, 0, 74]} active={checkpointIndex >= 2} />

      {/* TRAMO 3: Rampa larga hacia el Muelle Alto (z = 77..92, sube a y = 6.5m) */}
      <Block pos={[0, 2.8, 84.5]} size={[9.5, 0.8, 16.8]} rot={[-0.39, 0, 0]} mat={MATS.wood} />
      {/* Pasarela lateral con chicanas para parkour */}
      <Block pos={[6.2, 1.8, 80.5]} size={[2.4, 0.5, 5.2]} rot={[-0.32, 0, 0]} mat={MATS.steel} />
      <Block pos={[6.2, 4.4, 86.5]} size={[2.4, 0.5, 5.6]} rot={[-0.32, 0, 0]} mat={MATS.steel} />
      {/* Muelle de Cima (z = 92..102, y = 6.5m) */}
      <Block pos={[0, 6.0, 96.5]} size={[14, 1.0, 10]} mat={MATS.deck} />
      <SummitArch pos={[0, 6.5, 96]} completed={completedNow} />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   NIVEL 2 — EL CAÑÓN DEL VIENTO (92 m · 24 m DE ALTURA ESTILO PEAK)
   ═══════════════════════════════════════════════════════════════════════════ */
function WindTurbine({
  pos,
  dir,
  phase,
}: {
  pos: [number, number, number];
  dir: 1 | -1;
  phase: number;
}) {
  const bladesRef = useRef<THREE.Group>(null);
  const sockRef = useRef<THREE.Mesh>(null);
  const ribbonRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const gust = windGustFactor(clock.elapsedTime, phase);
    if (bladesRef.current) {
      bladesRef.current.rotation.x += dt * (2.5 + gust * 14);
    }
    if (sockRef.current) {
      sockRef.current.rotation.z = dir * (0.35 + gust * 1.15);
    }
    if (ribbonRef.current) {
      ribbonRef.current.visible = gust > 0.12;
      ribbonRef.current.position.x = dir * (2.4 + ((clock.elapsedTime * 11 + phase * 3) % 10));
      ribbonRef.current.scale.x = 0.6 + gust * 1.6;
    }
  });

  return (
    <group position={pos}>
      {/* Carcasa de la turbina */}
      <mesh material={MATS.steel} castShadow>
        <cylinderGeometry args={[2.2, 2.2, 1.4, 12]} />
      </mesh>
      <group ref={bladesRef} position={[dir * 0.85, 0, 0]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[(i * Math.PI) / 2, 0, 0]} position={[0, 0, 0]} material={MATS.hazardYellow}>
            <boxGeometry args={[0.16, 3.6, 0.45]} />
          </mesh>
        ))}
      </group>
      {/* Manga de viento animada */}
      <mesh ref={sockRef} position={[0, 2.6, 0]} material={MATS.craneOrange}>
        <coneGeometry args={[0.35, 1.7, 8]} />
      </mesh>
      {/* Cinta visual de ráfaga */}
      <mesh ref={ribbonRef} position={[dir * 4, 0, 0]} material={MATS.windRibbon}>
        <boxGeometry args={[2.6, 0.14, 0.14]} />
      </mesh>
    </group>
  );
}

function Level2WindCanyon({
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

  return (
    <group position={def.origin}>
      {/* Base de salida (y = 0) */}
      <Block pos={[0, -0.5, 5]} size={[14, 1, 12]} mat={MATS.cliffTop} />
      <Block pos={[0, -4.5, 5]} size={[16, 7, 14]} mat={MATS.cliff} shadow={false} />

      {/* TRAMO 1: Subida a la Isla 1 (z = 11..34, y = 0 → 7m) */}
      {/* Rampa de lanzamiento central */}
      <Block pos={[0, 2.9, 21]} size={[7.6, 0.8, 19.5]} rot={[-0.36, 0, 0]} mat={MATS.wood} />
      {/* Escalones laterales para escalada a pie */}
      <Block pos={[-5.4, 1.5, 14]} size={[3.2, 0.7, 3.6]} mat={MATS.cliffTop} />
      <Block pos={[-6.0, 3.2, 19]} size={[3.2, 0.7, 3.6]} mat={MATS.cliffTop} />
      <Block pos={[-5.2, 4.9, 24.5]} size={[3.2, 0.7, 3.6]} mat={MATS.cliffTop} />
      <Block pos={[-4.8, 6.2, 29.5]} size={[3.6, 0.7, 4.0]} mat={MATS.cliffTop} />

      {/* Turbina #1 (sopla hacia +X en z = 22) */}
      <WindTurbine pos={[-8.8, 4.2, 22]} dir={1} phase={0} />

      {/* Isla 1 + Checkpoint 1 (z = 31..41, y = 7m) */}
      <Block pos={[0, 6.5, 36]} size={[13, 1.0, 10]} mat={MATS.cliffTop} />
      <Block pos={[0, 2.0, 36]} size={[11, 8, 9]} mat={MATS.cliff} shadow={false} />
      <CheckpointBeacon pos={[0, 7.0, 36]} active={checkpointIndex >= 1} />

      {/* TRAMO 2: Corredor de Viento Cruzado (z = 41..66, y = 7 → 16m) */}
      <Block pos={[0, 9.2, 46.5]} size={[6.8, 0.7, 11.5]} rot={[-0.38, 0, 0]} mat={MATS.steel} />
      <Block pos={[0, 11.4, 53.5]} size={[8.5, 0.9, 5.5]} mat={MATS.deck} />
      <Block pos={[0, 13.8, 61.0]} size={[6.8, 0.7, 11.5]} rot={[-0.38, 0, 0]} mat={MATS.steel} />

      {/* Turbinas cruzadas alternadas */}
      <WindTurbine pos={[8.6, 11.8, 48]} dir={-1} phase={1.5} />
      <WindTurbine pos={[-8.6, 14.8, 59]} dir={1} phase={3.8} />

      {/* Repisa secreta detrás de la zona media con Tuerca Dorada */}
      <Block pos={[-6.4, 14.3, 53]} size={[3.4, 0.6, 3.4]} mat={MATS.wood} />
      <GoldenNutPickup pos={[def.goldenNutLocal[0], def.goldenNutLocal[1], def.goldenNutLocal[2]]} collected={goldenNutCollected} />

      {/* Isla 2 + Checkpoint 2 (z = 66..74, y = 16m) */}
      <Block pos={[0, 15.5, 70]} size={[12, 1.0, 9]} mat={MATS.cliffTop} />
      <Block pos={[0, 9.0, 70]} size={[9.5, 12, 7.5]} mat={MATS.cliff} shadow={false} />
      <CheckpointBeacon pos={[0, 16.0, 70]} active={checkpointIndex >= 2} />

      {/* TRAMO 3: Ascenso Final al Faro (z = 74..86, y = 16 → 24m) */}
      <Block pos={[0, 19.6, 80]} size={[6.2, 0.8, 15.0]} rot={[-0.48, 0, 0]} mat={MATS.wood} />
      {/* Vigas escalonadas laterales (ruta alternativa a pie) */}
      <Block pos={[4.8, 17.6, 76.5]} size={[2.8, 0.6, 3.2]} mat={MATS.steel} />
      <Block pos={[5.2, 19.8, 80.5]} size={[2.8, 0.6, 3.2]} mat={MATS.steel} />
      <Block pos={[4.6, 22.0, 84.5]} size={[2.8, 0.6, 3.2]} mat={MATS.steel} />

      {/* Cima — Helipuerto del Faro (z = 86..96, y = 24m) */}
      <Block pos={[0, 23.5, 91]} size={[14, 1.0, 11]} mat={MATS.deck} />
      <Block pos={[0, 14.0, 91]} size={[10, 18, 9]} mat={MATS.cliff} shadow={false} />
      {/* Torre del Faro decorativa */}
      <mesh position={[5.2, 27.5, 94.5]} material={MATS.rust} castShadow>
        <cylinderGeometry args={[1.0, 1.4, 7.5, 10]} />
      </mesh>
      <mesh position={[5.2, 31.8, 94.5]} material={MATS.gold}>
        <cylinderGeometry args={[1.15, 1.15, 1.2, 10]} />
      </mesh>
      <SummitArch pos={[0, 24.0, 90]} completed={completedNow} />
    </group>
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

  if (activeLevelId === 'level-1-swamp') {
    return (
      <Level1OilSwamp
        def={def}
        playerSourceRef={playerSourceRef}
        checkpointIndex={checkpointIndex}
        goldenNutCollected={goldenNutThisRun}
        completedNow={completedNow}
      />
    );
  }
  if (activeLevelId === 'level-2-wind') {
    return (
      <Level2WindCanyon
        def={def}
        playerSourceRef={playerSourceRef}
        checkpointIndex={checkpointIndex}
        goldenNutCollected={goldenNutThisRun}
        completedNow={completedNow}
      />
    );
  }
  return (
    <Level3CrusherPlant
      def={def}
      playerSourceRef={playerSourceRef}
      checkpointIndex={checkpointIndex}
      goldenNutCollected={goldenNutThisRun}
      completedNow={completedNow}
    />
  );
}

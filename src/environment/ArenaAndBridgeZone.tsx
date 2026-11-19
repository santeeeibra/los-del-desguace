import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { getSharedTextures, PALETTE } from '../config/visualConfig';
import type { CameraTargetSource } from '../controls/ThirdPersonCamera';
import {
  arenaAndBridgeStore,
  BRIDGE_GOAL_POS,
  BRIDGE_START_POS,
  getDroneWorldPosition,
  isOutsideRobotArena,
  ROBOT_ARENA_CENTER,
  ROBOT_ARENA_RADIUS,
  useArenaAndBridgeState,
} from '../modes/arenaAndBridge';

const ROBOT_SPAWNS: readonly { id: string; pos: [number, number, number]; color: string }[] = [
  { id: 'rival-bot-1', pos: [ROBOT_ARENA_CENTER[0] - 2.6, 1.05, ROBOT_ARENA_CENTER[2] - 2.2], color: PALETTE.metalRed },
  { id: 'rival-bot-2', pos: [ROBOT_ARENA_CENTER[0] + 2.6, 1.05, ROBOT_ARENA_CENTER[2] - 2.4], color: PALETTE.metalRust },
];

const BRIDGE_PLANKS_Z = [24.9, 26.9, 28.9, 30.9, 32.9] as const;

export function ArenaAndBridgeZone({
  resetSignal,
  playerSourceRef,
}: {
  resetSignal: number;
  playerSourceRef: React.RefObject<CameraTargetSource>;
}) {
  const textures = useMemo(() => getSharedTextures(), []);
  const abState = useArenaAndBridgeState();
  const robotRefs = useRef<Record<string, RapierRigidBody | null>>({});
  const droneGroupRefs = useRef<Record<string, THREE.Group | null>>({});
  const rotorRefs = useRef<Record<string, THREE.Mesh | null>>({});
  const plankBodyRefs = useRef<Record<number, RapierRigidBody | null>>({});
  const lastNonceRef = useRef(-1);
  const playerPosition = useMemo(() => new THREE.Vector3(), []);

  const materials = useMemo(
    () => ({
      arenaFloor: new THREE.MeshStandardMaterial({
        color: '#464a50',
        map: textures.corrugatedMap,
        bumpMap: textures.corrugatedBumpMap,
        bumpScale: 0.025,
        roughness: 0.65,
        metalness: 0.35,
      }),
      hazard: new THREE.MeshStandardMaterial({
        map: textures.hazardMap,
        roughness: 0.72,
        metalness: 0.08,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: PALETTE.metalDark,
        roughness: 0.55,
        metalness: 0.72,
      }),
      wood: new THREE.MeshStandardMaterial({
        map: textures.woodMap,
        roughness: 0.84,
        metalness: 0.0,
      }),
      botBodyRed: new THREE.MeshStandardMaterial({
        color: PALETTE.metalRed,
        roughness: 0.5,
        metalness: 0.35,
      }),
      botBodyRust: new THREE.MeshStandardMaterial({
        color: PALETTE.metalRust,
        roughness: 0.62,
        metalness: 0.32,
      }),
      botVisor: new THREE.MeshStandardMaterial({
        color: '#ff4229',
        emissive: '#ff2b12',
        emissiveIntensity: 1.5,
        roughness: 0.25,
      }),
      droneCore: new THREE.MeshStandardMaterial({
        color: '#ff9b26',
        emissive: '#ff6a00',
        emissiveIntensity: 1.25,
        roughness: 0.3,
        metalness: 0.4,
      }),
      droneRing: new THREE.MeshBasicMaterial({
        color: '#ffd147',
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      }),
      bridgeHealthy: new THREE.MeshStandardMaterial({
        color: '#5ab863',
        map: textures.woodMap,
        roughness: 0.78,
      }),
      bridgeWarn: new THREE.MeshStandardMaterial({
        color: '#f2b138',
        map: textures.woodMap,
        roughness: 0.78,
      }),
      bridgeDanger: new THREE.MeshStandardMaterial({
        color: '#df5038',
        map: textures.woodMap,
        roughness: 0.78,
      }),
      cableSteel: new THREE.MeshStandardMaterial({
        color: '#2d333a',
        roughness: 0.5,
        metalness: 0.75,
      }),
      pitFloor: new THREE.MeshStandardMaterial({
        color: '#251a14',
        roughness: 0.96,
      }),
    }),
    [textures]
  );

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [materials]);

  // Reset físico cuando cambia resetSignal o arenaAndBridgeStore.getResetNonce()
  const storeNonce = arenaAndBridgeStore.getResetNonce();
  useEffect(() => {
    const combined = resetSignal * 1000 + storeNonce;
    if (lastNonceRef.current === combined) return;
    lastNonceRef.current = combined;
    for (const spawn of ROBOT_SPAWNS) {
      const body = robotRefs.current[spawn.id];
      if (!body?.isValid()) continue;
      body.setTranslation({ x: spawn.pos[0], y: spawn.pos[1], z: spawn.pos[2] }, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.wakeUp();
    }
    BRIDGE_PLANKS_Z.forEach((pz, idx) => {
      const pb = plankBodyRefs.current[idx];
      if (!pb?.isValid()) return;
      pb.setTranslation({ x: -12, y: 0.82, z: pz }, true);
      pb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      pb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      pb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
  }, [resetSignal, storeNonce]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const playerPos = playerSourceRef.current.getTargetPosition(playerPosition) ? playerPosition : null;

    // 1. IA simple y física de los 2 Robots Rivales en la Arena del Yunke
    for (let i = 0; i < ROBOT_SPAWNS.length; i++) {
      const spawn = ROBOT_SPAWNS[i];
      const body = robotRefs.current[spawn.id];
      if (!body?.isValid()) continue;
      const t = body.translation();
      const botState = abState.robots.find((r) => r.id === spawn.id);
      if (botState?.knockedOut) continue;

      if (isOutsideRobotArena(t.x, t.y, t.z)) {
        arenaAndBridgeStore.markRobotKnockedOut(spawn.id);
        continue;
      }

      // Target: si el jugador está dentro/cerca del ring, perseguirlo; si no, patrullar en círculo dentro del ring
      const distPlayerToArena = playerPos
        ? Math.hypot(playerPos.x - ROBOT_ARENA_CENTER[0], playerPos.z - ROBOT_ARENA_CENTER[2])
        : 999;
      let targetX = ROBOT_ARENA_CENTER[0] + Math.cos(state.clock.elapsedTime * 0.9 + i * Math.PI) * 3.2;
      let targetZ = ROBOT_ARENA_CENTER[2] + Math.sin(state.clock.elapsedTime * 0.9 + i * Math.PI) * 3.2;
      if (playerPos && distPlayerToArena < ROBOT_ARENA_RADIUS + 0.5) {
        targetX = playerPos.x;
        targetZ = playerPos.z;
      }

      const dx = targetX - t.x;
      const dz = targetZ - t.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.25) {
        const lv = body.linvel();
        const horizSpeed = Math.hypot(lv.x, lv.z);
        if (horizSpeed < 4.2) {
          const push = 26 * dt;
          body.applyImpulse({ x: (dx / dist) * push, y: 0, z: (dz / dist) * push }, true);
        }
      }
    }

    // 2. Animar Drones Aéreos según el estado del store
    const currentDrones = arenaAndBridgeStore.getState().drones;
    for (const drone of currentDrones) {
      const grp = droneGroupRefs.current[drone.id];
      if (!grp) continue;
      grp.visible = !drone.destroyed;
      if (!drone.destroyed) {
        const [x, y, z] = getDroneWorldPosition(drone);
        grp.position.set(x, y, z);
        grp.rotation.y = -drone.angle;
        const rotor = rotorRefs.current[drone.id];
        if (rotor) rotor.rotation.y += dt * 18;
      }
    }

    // 3. Actualizar deflexión visual/física de los tablones del Puente (*Poly Bridge*)
    const stressRatio = (100 - abState.bridgeIntegrity) / 100;
    BRIDGE_PLANKS_Z.forEach((pz, idx) => {
      const pb = plankBodyRefs.current[idx];
      if (!pb?.isValid()) return;
      const isCenterPlank = idx >= 1 && idx <= 3;
      if (abState.bridgeCollapsed && isCenterPlank) {
        pb.setNextKinematicTranslation({ x: -12, y: -1.8, z: pz });
        pb.setNextKinematicRotation({ x: 0.35 * (idx - 2), y: 0, z: 0.2, w: 0.92 });
      } else {
        const sag = (idx === 2 ? 1.0 : idx === 1 || idx === 3 ? 0.65 : 0.25) * stressRatio * 0.42;
        pb.setNextKinematicTranslation({ x: -12, y: 0.82 - sag, z: pz });
        pb.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
      }
    });
  });

  const bridgeMat =
    abState.bridgeIntegrity > 60
      ? materials.bridgeHealthy
      : abState.bridgeIntegrity > 28
        ? materials.bridgeWarn
        : materials.bridgeDanger;

  return (
    <group name="arena-and-bridge-zone">
      {/* ==================== 1. ARENA DE COMBATE DE ROBOTS ==================== */}
      <group position={[ROBOT_ARENA_CENTER[0], 0, ROBOT_ARENA_CENTER[2]]}>
        <RigidBody type="fixed" colliders={false} friction={0.85}>
          {/* Plataforma principal circular elevada */}
          <CylinderCollider args={[0.22, ROBOT_ARENA_RADIUS]} position={[0, 0.22, 0]} />
          {/* Dos rampas anchas de acceso desde el taller */}
          <CuboidCollider args={[2.1, 0.12, 2.2]} position={[-6.4, 0.14, 5.2]} rotation={[0.18, -0.78, 0]} />
          <CuboidCollider args={[2.1, 0.12, 2.2]} position={[0, 0.14, 7.8]} rotation={[0.18, 0, 0]} />
        </RigidBody>

        <mesh receiveShadow material={materials.arenaFloor} position={[0, 0.22, 0]}>
          <cylinderGeometry args={[ROBOT_ARENA_RADIUS, ROBOT_ARENA_RADIUS + 0.35, 0.44, 24]} />
        </mesh>
        <mesh receiveShadow material={materials.hazard} position={[0, 0.445, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ROBOT_ARENA_RADIUS - 0.55, ROBOT_ARENA_RADIUS, 24]} />
        </mesh>

        {/* Rampas visuales de entrada */}
        <mesh receiveShadow castShadow material={materials.wood} position={[-6.4, 0.14, 5.2]} rotation={[0.18, -0.78, 0]}>
          <boxGeometry args={[4.2, 0.24, 4.4]} />
        </mesh>
        <mesh receiveShadow castShadow material={materials.wood} position={[0, 0.14, 7.8]} rotation={[0.18, 0, 0]}>
          <boxGeometry args={[4.2, 0.24, 4.4]} />
        </mesh>

        {/* Postes de esquina decorativos con faroles */}
        {[0, 1, 2, 3].map((corner) => {
          const ang = (corner * Math.PI) / 2 + Math.PI / 4;
          const px = Math.cos(ang) * (ROBOT_ARENA_RADIUS + 0.3);
          const pz = Math.sin(ang) * (ROBOT_ARENA_RADIUS + 0.3);
          return (
            <group key={corner} position={[px, 0, pz]}>
              <mesh castShadow material={materials.steel} position={[0, 1.35, 0]}>
                <cylinderGeometry args={[0.12, 0.15, 2.7, 8]} />
              </mesh>
              <mesh material={materials.botVisor} position={[0, 2.75, 0]}>
                <sphereGeometry args={[0.2, 10, 10]} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* 2 Robots Rivales de Chatarra (física dinámica real) */}
      {ROBOT_SPAWNS.map((spawn, idx) => (
        <RigidBody
          key={spawn.id}
          ref={(b) => {
            robotRefs.current[spawn.id] = b;
          }}
          type="dynamic"
          colliders={false}
          position={spawn.pos}
          mass={11}
          linearDamping={0.85}
          angularDamping={1.5}
          friction={0.65}
          restitution={0.25}
        >
          <CuboidCollider args={[0.52, 0.55, 0.52]} />
          {/* Chasis y cuerpo */}
          <mesh castShadow receiveShadow material={idx === 0 ? materials.botBodyRed : materials.botBodyRust} position={[0, -0.05, 0]}>
            <boxGeometry args={[0.98, 0.72, 0.98]} />
          </mesh>
          {/* Cabeza y visor LED */}
          <mesh castShadow material={materials.steel} position={[0, 0.45, 0]}>
            <boxGeometry args={[0.58, 0.34, 0.52]} />
          </mesh>
          <mesh material={materials.botVisor} position={[0, 0.47, 0.27]}>
            <boxGeometry args={[0.42, 0.12, 0.04]} />
          </mesh>
          {/* Parachoques de choque */}
          <mesh castShadow material={materials.hazard} position={[0, -0.25, 0.52]}>
            <boxGeometry args={[1.05, 0.22, 0.14]} />
          </mesh>
        </RigidBody>
      ))}

      {/* ==================== 2. DRONES DE DUELO AÉREO ==================== */}
      {abState.drones.map((drone) => (
        <group
          key={drone.id}
          ref={(g) => {
            droneGroupRefs.current[drone.id] = g;
          }}
          position={getDroneWorldPosition(drone)}
        >
          <mesh material={materials.steel}>
            <sphereGeometry args={[0.62, 14, 12]} />
          </mesh>
          <mesh material={materials.droneCore} position={[0, -0.1, 0]}>
            <sphereGeometry args={[0.42, 12, 10]} />
          </mesh>
          <mesh
            ref={(m) => {
              rotorRefs.current[drone.id] = m;
            }}
            material={materials.hazard}
            position={[0, 0.68, 0]}
          >
            <boxGeometry args={[2.1, 0.08, 0.24]} />
          </mesh>
          {/* Aro luminoso para verlo fácil desde tierra/aire */}
          <mesh material={materials.droneRing} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.05, 1.28, 24]} />
          </mesh>
        </group>
      ))}

      {/* ==================== 3. CIRCUITO DE INGENIERÍA (POLY BRIDGE) ==================== */}
      <group name="poly-bridge-circuit">
        {/* Rampa de acceso + Plataforma A + Plataforma Meta B */}
        <RigidBody type="fixed" colliders={false} friction={0.9}>
          <CuboidCollider args={[2.2, 0.15, 2.1]} position={[-12, 0.42, 19.3]} rotation={[-0.22, 0, 0]} />
          <CuboidCollider args={[2.3, 0.45, 2.0]} position={[-12, 0.45, 22.0]} />
          <CuboidCollider args={[2.4, 0.45, 2.3]} position={[BRIDGE_GOAL_POS[0], 0.45, BRIDGE_GOAL_POS[2] - 0.5]} />
        </RigidBody>

        {/* Visuales de Rampa y Plataformas A / B */}
        <mesh receiveShadow castShadow material={materials.wood} position={[-12, 0.42, 19.3]} rotation={[-0.22, 0, 0]}>
          <boxGeometry args={[4.4, 0.3, 4.2]} />
        </mesh>
        <mesh receiveShadow castShadow material={materials.arenaFloor} position={[BRIDGE_START_POS[0], 0.45, BRIDGE_START_POS[2]]}>
          <boxGeometry args={[4.6, 0.9, 4.0]} />
        </mesh>
        <mesh receiveShadow castShadow material={materials.arenaFloor} position={[BRIDGE_GOAL_POS[0], 0.45, BRIDGE_GOAL_POS[2] - 0.5]}>
          <boxGeometry args={[4.8, 0.9, 4.6]} />
        </mesh>

        {/* Señalización del Foso debajo del puente */}
        <mesh receiveShadow material={materials.pitFloor} position={[-12, 0.015, 29]}>
          <boxGeometry args={[5.4, 0.03, 10.2]} />
        </mesh>
        <mesh receiveShadow material={materials.hazard} position={[-14.6, 0.03, 29]}>
          <boxGeometry args={[0.28, 0.05, 10.2]} />
        </mesh>
        <mesh receiveShadow material={materials.hazard} position={[-9.4, 0.03, 29]}>
          <boxGeometry args={[0.28, 0.05, 10.2]} />
        </mesh>

        {/* Torres metálicas y cables tensores del puente */}
        {[-14.2, -9.8].map((px) => (
          <group key={px}>
            <mesh castShadow material={materials.steel} position={[px, 2.3, 23.9]}>
              <boxGeometry args={[0.24, 3.8, 0.24]} />
            </mesh>
            <mesh castShadow material={materials.steel} position={[px, 2.3, 33.9]}>
              <boxGeometry args={[0.24, 3.8, 0.24]} />
            </mesh>
            <mesh material={materials.cableSteel} position={[px, 2.45, 26.4]} rotation={[-0.58, 0, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 5.2, 6]} />
            </mesh>
            <mesh material={materials.cableSteel} position={[px, 2.45, 31.4]} rotation={[0.58, 0, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 5.2, 6]} />
            </mesh>
          </group>
        ))}

        {/* 5 Tramos físicos del puente (kinematicPosition con deflexión y colapso) */}
        {BRIDGE_PLANKS_Z.map((pz, idx) => (
          <RigidBody
            key={pz}
            ref={(b) => {
              plankBodyRefs.current[idx] = b;
            }}
            type="kinematicPosition"
            colliders={false}
            position={[-12, 0.82, pz]}
            friction={0.95}
          >
            <CuboidCollider args={[1.95, 0.12, 0.94]} />
            <mesh castShadow receiveShadow material={bridgeMat}>
              <boxGeometry args={[3.9, 0.24, 1.88]} />
            </mesh>
          </RigidBody>
        ))}

        {/* Arco de Meta en Plataforma B */}
        <group position={[BRIDGE_GOAL_POS[0], 0.9, BRIDGE_GOAL_POS[2] + 0.8]}>
          <mesh castShadow material={materials.steel} position={[-2.1, 1.6, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 3.2, 8]} />
          </mesh>
          <mesh castShadow material={materials.steel} position={[2.1, 1.6, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 3.2, 8]} />
          </mesh>
          <mesh castShadow material={materials.hazard} position={[0, 3.1, 0]}>
            <boxGeometry args={[4.5, 0.42, 0.22]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

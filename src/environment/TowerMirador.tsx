import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { getSharedTextures, PALETTE } from '../config/visualConfig';
import { TOWER_DECK_HEIGHT, TOWER_ORIGIN, TOWER_STEPS } from '../modes/towerMirador';
import { useGameStore } from '../state/gameStore';

export function TowerMirador() {
  const found = useGameStore((state) => state.towerNutFound);
  const reward = useRef<THREE.Group>(null);
  const textures = getSharedTextures();
  const sign = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#442411';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#edc887';
    ctx.fillRect(12, 12, 488, 168);
    ctx.fillStyle = '#bb8146';
    for (const y of [64, 117, 169]) ctx.fillRect(12, y, 488, 4);
    ctx.fillStyle = '#3b1e0a';
    ctx.textAlign = 'center';
    ctx.font = 'bold 45px Trebuchet MS';
    ctx.fillText('TORRE MIRADOR', 256, 81);
    ctx.font = 'bold 30px Trebuchet MS';
    ctx.fillText('A pie o en tu invento', 256, 140);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, []);
  useEffect(() => () => sign.dispose(), [sign]);

  useFrame(({ clock }) => {
    if (!reward.current) return;
    const time = clock.elapsedTime;
    reward.current.rotation.y = time * 1.5;
    reward.current.position.y = TOWER_DECK_HEIGHT + 0.95 + Math.sin(time * 2.7) * 0.14;
  });

  return (
    <group name="torre-mirador" position={TOWER_ORIGIN}>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[1.72, 0.16, 1.32]} position={[0, TOWER_DECK_HEIGHT - 0.16, 0]} />
        {TOWER_STEPS.map(({ x, top }) => (
          <CuboidCollider key={x} args={[0.37, top / 2, 0.9]} position={[x, top / 2, 0]} />
        ))}
      </RigidBody>

      {TOWER_STEPS.map(({ x, top }, index) => (
        <mesh key={x} receiveShadow position={[x, top / 2, 0]}>
          <boxGeometry args={[0.74, top, 1.8]} />
          <meshStandardMaterial
            color={index % 2 === 0 ? PALETTE.metalRed : PALETTE.metalTeal}
            map={textures.corrugatedMap}
            roughness={0.83}
          />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, TOWER_DECK_HEIGHT - 0.16, 0]}>
        <boxGeometry args={[3.44, 0.32, 2.64]} />
        <meshStandardMaterial map={textures.woodMap} color="#ddae68" roughness={0.84} />
      </mesh>
      {[-1.45, 1.45].flatMap((x) => [-1.08, 1.08].map((z) => (
        <mesh key={`${x}:${z}`} position={[x, TOWER_DECK_HEIGHT / 2, z]}>
          <boxGeometry args={[0.19, TOWER_DECK_HEIGHT, 0.19]} />
          <meshStandardMaterial color={PALETTE.metalDark} roughness={0.74} />
        </mesh>
      )))}
      <group position={[8.65, 1.2, -1.35]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, -0.6, -0.05]}>
          <boxGeometry args={[0.15, 1.2, 0.15]} />
          <meshStandardMaterial color="#603715" />
        </mesh>
        <mesh>
          <planeGeometry args={[2.05, 0.77]} />
          <meshBasicMaterial map={sign} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {!found && (
        <group ref={reward} position={[0, TOWER_DECK_HEIGHT + 0.95, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.28, 0.11, 6, 6]} />
            <meshStandardMaterial color="#ffc34b" emissive="#f79721" emissiveIntensity={0.55} metalness={0.65} roughness={0.22} />
          </mesh>
        </group>
      )}
    </group>
  );
}

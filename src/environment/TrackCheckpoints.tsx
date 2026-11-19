import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  FLIGHT_TARGET_POS,
  RACE_CHECKPOINTS,
  useGameModeStore,
  type GameModeId,
} from '../modes/gameModes';
import { WORKSHOP_CONTRACTS, useContractStore } from '../modes/contracts';
function ActiveModeCheckpoints({ mode }: { mode: Exclude<GameModeId, 'sandbox'> }) {
  const checkpointIndex = useGameModeStore((s) => s.checkpointIndex);
  const raceFinished = useGameModeStore((s) => s.raceFinished);
  const flightTargetReached = useGameModeStore((s) => s.flightTargetReached);

  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ringRef.current) {
      const t = state.clock.elapsedTime;
      const pulse = 1 + Math.sin(t * 3.5) * 0.04;
      ringRef.current.scale.setScalar(pulse);
    }
  });

  if (mode === 'race') {
    if (raceFinished) return null;
    const pos = RACE_CHECKPOINTS[checkpointIndex] ?? RACE_CHECKPOINTS[0];
    return (
      <mesh ref={ringRef} position={pos} name="race-active-checkpoint"
        rotation={[0, checkpointIndex === 2 ? Math.PI / 2 : 0, 0]}>
        <torusGeometry args={[1.9, 0.14, 16, 40]} />
        <meshStandardMaterial
          color="#ffe066"
          emissive="#ffe066"
          emissiveIntensity={0.85}
          roughness={0.25}
          metalness={0.15}
        />
      </mesh>
    );
  }

  return (
    <mesh ref={ringRef} position={FLIGHT_TARGET_POS} name="flight-target-ring">
      <torusGeometry args={[2.2, 0.16, 16, 40]} />
      <meshStandardMaterial
        color={flightTargetReached ? '#80efd2' : '#ffe066'}
        emissive={flightTargetReached ? '#80efd2' : '#ffe066'}
        emissiveIntensity={0.85}
        roughness={0.25}
        metalness={0.15}
      />
    </mesh>
  );
}

function ContractTargetRing({ position }: { position: readonly [number, number, number] }) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ringRef.current) {
      const t = state.clock.elapsedTime;
      const pulse = 1 + Math.sin(t * 3.8) * 0.06;
      ringRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <mesh ref={ringRef} position={[position[0], position[1], position[2]]} name="contract-target-ring">
      <torusGeometry args={[2.1, 0.16, 16, 40]} />
      <meshStandardMaterial
        color="#ffb347"
        emissive="#ff9f1c"
        emissiveIntensity={1.05}
        roughness={0.22}
        metalness={0.18}
      />
    </mesh>
  );
}

export function TrackCheckpoints() {
  const mode = useGameModeStore((s) => s.mode);
  const activeContractId = useContractStore((s) => s.activeContractId);
  const completedNow = useContractStore((s) => s.completedNow);

  const activeContract =
    activeContractId && !completedNow
      ? WORKSHOP_CONTRACTS.find((c) => c.id === activeContractId)
      : undefined;

  return (
    <>
      {mode !== 'sandbox' && <ActiveModeCheckpoints mode={mode} />}
      {activeContract && activeContract.kind === 'reach' && (
        <ContractTargetRing position={activeContract.targetPos} />
      )}
    </>
  );
}

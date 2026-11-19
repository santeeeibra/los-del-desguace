import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DEFAULT_CHISPA_APPEARANCE } from '../character/characterAppearance';
import { buildCharacterAppearance } from '../character/characterCustomization';
import { InventorCharacter, type CharacterAnimData } from '../character/InventorCharacter';
import { useMultiplayerStore } from './multiplayerStore';
import type { PlayerSnapshot } from './netProtocol';

function RemotePlayerAvatar({ snapshot }: { snapshot: PlayerSnapshot }) {
  const groupRef = useRef<THREE.Group>(null);
  const initialPosition = useRef(new THREE.Vector3(...snapshot.pos));
  const carryAnchorRef = useRef<THREE.Group>(null);
  const animDataRef = useRef<CharacterAnimData>({
    speed: 0,
    verticalSpeed: 0,
    isOnGround: true,
    isMoving: false,
    isRunning: false,
    isCarrying: false,
    carriedKind: null,
    carryDist: 0.72,
    carryLift: -0.04,
    accelForward: 0,
    turnRate: 0,
    takeoffImpulse: 0,
    landImpulse: 0,
    bumpImpulse: 0,
  });

  const appearance = useMemo(() => {
    if (snapshot.characterConfig) {
      return {
        ...buildCharacterAppearance(snapshot.characterConfig),
        id: `remote-${snapshot.id}`,
        displayName: snapshot.name,
      };
    }
    return {
      ...DEFAULT_CHISPA_APPEARANCE,
      id: `remote-${snapshot.id}`,
      displayName: snapshot.name,
      palette: {
        ...DEFAULT_CHISPA_APPEARANCE.palette,
        overall: snapshot.colorHex,
        hardhat: snapshot.colorHex,
      },
    };
  }, [snapshot.id, snapshot.name, snapshot.colorHex, snapshot.characterConfig]);

  useFrame((_, rawDelta) => {
    const g = groupRef.current;
    if (!g) return;
    const alpha = 1 - Math.exp(-Math.min(rawDelta, 0.05) * 14);
    g.position.x = THREE.MathUtils.lerp(g.position.x, snapshot.pos[0], alpha);
    g.position.y = THREE.MathUtils.lerp(g.position.y, snapshot.pos[1], alpha);
    g.position.z = THREE.MathUtils.lerp(g.position.z, snapshot.pos[2], alpha);
    g.rotation.y = snapshot.yaw;

    animDataRef.current.speed = snapshot.speed;
    animDataRef.current.isMoving = snapshot.speed > 0.25;
    animDataRef.current.isOnGround = snapshot.isOnGround;
    animDataRef.current.isCarrying = snapshot.isCarrying;
  });

  return (
    <group ref={groupRef} position={initialPosition.current}>
      <group ref={carryAnchorRef} />
      <InventorCharacter
        animDataRef={animDataRef}
        carryAnchorRef={carryAnchorRef}
        appearance={appearance}
        headId={snapshot.characterConfig?.headShape}
        outfitId={snapshot.characterConfig?.outfitId}
        activeEmote={snapshot.emote ?? null}
        seated={Boolean(snapshot.seatedId)}
      />
    </group>
  );
}

/**
 * Renderiza a los jugadores remotos (hasta 5 compañeros) interpolados suavemente.
 */
export function RemotePlayers() {
  const { role, players, localPlayerId } = useMultiplayerStore();
  if (role === 'offline') return null;

  const remotes = Object.values(players).filter((p) => p.id !== localPlayerId);
  return (
    <group name="remote-players">
      {remotes.map((snap) => (
        <RemotePlayerAvatar key={snap.id} snapshot={snap} />
      ))}
    </group>
  );
}

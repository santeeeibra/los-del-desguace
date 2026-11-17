import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { ScrapCart } from '../cart/ScrapCart';
import { PALETTE, QUALITY_PRESETS } from '../config/visualConfig';
import { ThirdPersonCamera, type CameraTargetSource } from '../controls/ThirdPersonCamera';
import { useKeyboardInput } from '../controls/playerInput';
import { ScrapyardWorkshop } from '../environment/ScrapyardWorkshop';
import { PlayerRig } from '../physics/PlayerRig';
import { GrabbableProps } from '../props/GrabbableProps';
import { gameStore, useGameStore } from '../state/gameStore';

function SceneReadyNotifier() {
  useEffect(() => {
    gameStore.setSceneReady(true);
    return () => gameStore.setSceneReady(false);
  }, []);
  return null;
}

function ProceduralSkyDome() {
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[48, 24, 16]} />
      <meshBasicMaterial color={PALETTE.skyTop} side={THREE.BackSide} fog={false} />
    </mesh>
  );
}

export function DesguaceScene() {
  useKeyboardInput();

  const quality = useGameStore((s) => s.quality);
  const resetNonce = useGameStore((s) => s.resetNonce);
  const preset = QUALITY_PRESETS[quality];

  const cameraSourceRef = useRef<CameraTargetSource>({
    getTargetPosition: () => false,
    getExcludedBodyHandle: () => null,
    getShakeIntensity: () => 0,
  });

  return (
    <Canvas
      shadows={preset.shadows ? 'percentage' : false}
      dpr={preset.dpr}
      camera={{ fov: 50, near: 0.15, far: 110, position: [2.2, 3.2, 9.6] }}
      gl={{
        antialias: preset.antialias,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
    >
      <color attach="background" args={[PALETTE.fogColor]} />
      <fog attach="fog" args={[PALETTE.fogColor, 24, 56]} />

      <ProceduralSkyDome />

      {/* Warm golden-hour key sunlight with tight frustum around the workshop */}
      <directionalLight
        position={[14, 19, 11]}
        intensity={2.45}
        color={PALETTE.sunColor}
        castShadow={preset.shadows}
        shadow-mapSize-width={preset.shadowMapSize}
        shadow-mapSize-height={preset.shadowMapSize}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={46}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />

      {/* Cool sky / warm earth fill */}
      <hemisphereLight args={[PALETTE.hemiSky, PALETTE.hemiGround, 0.72]} />

      {/* Offline procedural IBL environment for crisp metal, brass & goggle reflections */}
      <Environment resolution={preset.envResolution} frames={1}>
        <group rotation={[-Math.PI / 3, 0, 0]}>
          <Lightformer
            form="circle"
            intensity={3.5}
            color="#ffe5ba"
            scale={8}
            position={[10, 12, 8]}
          />
          <Lightformer
            form="rect"
            intensity={1.3}
            color="#8ec4f0"
            scale={[18, 10, 1]}
            position={[0, 10, -8]}
          />
          <Lightformer
            form="rect"
            intensity={0.9}
            color="#c78a52"
            scale={[22, 22, 1]}
            position={[0, -6, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        </group>
      </Environment>

      <Suspense fallback={null}>
        <Physics timeStep={1 / 60} interpolate gravity={[0, -18, 0]}>
          <ScrapyardWorkshop extraProps={preset.extraProps} />
          <ScrapCart />
          <GrabbableProps resetSignal={resetNonce} />
          <PlayerRig
            maxDustPuffs={preset.maxDustPuffs}
            resetSignal={resetNonce}
            cameraSourceRef={cameraSourceRef}
          />
          <ThirdPersonCamera targetSourceRef={cameraSourceRef} resetSignal={resetNonce} />
          <SceneReadyNotifier />
        </Physics>
      </Suspense>
    </Canvas>
  );
}

import { DeliveryController } from '../modes/delivery/DeliveryController';
import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Physics, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { ScrapCart } from '../cart/ScrapCart';
import { unlockAudio } from '../audio/sfxEngine';
import { PALETTE, QUALITY_PRESETS } from '../config/visualConfig';
import { GameCameraRig } from '../controls/GameCameraRig';
import { type CameraTargetSource } from '../controls/ThirdPersonCamera';
import { ArenaAndBridgeZone } from '../environment/ArenaAndBridgeZone';
import { ScrapyardWorkshop } from '../environment/ScrapyardWorkshop';
import { TestTrackAndYard } from '../environment/TestTrackAndYard';
import { TowerMirador } from '../environment/TowerMirador';
import { TrackCheckpoints } from '../environment/TrackCheckpoints';
import { BlueprintHolograms } from '../invention/BlueprintHolograms';
import { WorkshopChassis, WorkshopDrumStand } from '../invention/WorkshopChassis';
import { LogicCables } from '../logic/LogicCables';
import { contraptionGraph } from '../logic/contraptionRegistry';
import { RemotePlayers } from '../multiplayer/RemotePlayers';
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
  const skyMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTopColor: { value: new THREE.Color(PALETTE.skyTop) },
          uHorizonColor: { value: new THREE.Color(PALETTE.skyHorizon) },
        },
        vertexShader: `
          varying float vHeight;
          void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vHeight = normalize(position).y;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: `
          uniform vec3 uTopColor;
          uniform vec3 uHorizonColor;
          varying float vHeight;
          void main() {
            float t = pow(clamp(vHeight * 1.15 + 0.05, 0.0, 1.0), 0.72);
            gl_FragColor = vec4(mix(uHorizonColor, uTopColor, t), 1.0);
          }
        `,
      }),
    [],
  );

  useEffect(() => () => skyMaterial.dispose(), [skyMaterial]);

  return (
    <mesh scale={[-1, 1, 1]} position={[0, 0, 10]} material={skyMaterial}>
      <sphereGeometry args={[86, 24, 16]} />
    </mesh>
  );
}

const SUN_OFFSET = new THREE.Vector3(18, 26, 20);
const SHADOW_TEXEL_SNAP = 0.25;

function FollowSunLight({
  targetSourceRef,
  castShadow,
  shadowMapSize,
}: {
  targetSourceRef: RefObject<CameraTargetSource>;
  castShadow: boolean;
  shadowMapSize: number;
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetObj = useMemo(() => new THREE.Object3D(), []);
  const scratchTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const light = lightRef.current;
    if (!light) return;
    if (targetSourceRef.current.getTargetPosition(scratchTarget)) {
      const sx = Math.round(scratchTarget.x / SHADOW_TEXEL_SNAP) * SHADOW_TEXEL_SNAP;
      const sz = Math.round(scratchTarget.z / SHADOW_TEXEL_SNAP) * SHADOW_TEXEL_SNAP;
      targetObj.position.set(sx, 0, sz);
      light.position.set(sx + SUN_OFFSET.x, SUN_OFFSET.y, sz + SUN_OFFSET.z);
    }
    targetObj.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={targetObj} />
      <directionalLight
        ref={lightRef}
        target={targetObj}
        position={[18, 26, 20]}
        intensity={2.45}
        color={PALETTE.sunColor}
        castShadow={castShadow}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={72}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  );
}

export function DesguaceScene() {
  const quality = useGameStore((s) => s.quality);
  const resetNonce = useGameStore((s) => s.resetNonce);
  const preset = QUALITY_PRESETS[quality];
  const cartBodyRef = useRef<RapierRigidBody>(null);

  const cameraSourceRef = useRef<CameraTargetSource>({
    getTargetPosition: () => false,
    getExcludedBodyHandle: () => null,
    getShakeIntensity: () => 0,
  });

  return (
    <Canvas
      shadows={preset.shadows ? 'percentage' : false}
      dpr={preset.dpr}
      camera={{ fov: 62, near: 0.06, far: 110, position: [2.2, 3.2, 9.6] }}
      style={{ touchAction: 'none' }}
      onCreated={({ gl }) => {
        gl.domElement.tabIndex = 0;
        gl.domElement.setAttribute('aria-label', 'Escena de Los del Desguace');
        unlockAudio();
      }}
      gl={{
        antialias: preset.antialias,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
    >
      <color attach="background" args={[PALETTE.fogColor]} />
      <fog attach="fog" args={[PALETTE.fogColor, 36, 84]} />

      <ProceduralSkyDome />

      {/* Warm golden-hour key sunlight following the player for crisp shadows */}
      <FollowSunLight
        targetSourceRef={cameraSourceRef}
        castShadow={preset.shadows}
        shadowMapSize={preset.shadowMapSize}
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
          <TestTrackAndYard extraProps={preset.extraProps} />
          <TowerMirador />
          <ArenaAndBridgeZone resetSignal={resetNonce} playerSourceRef={cameraSourceRef} />
          <TrackCheckpoints />
          <DeliveryController />
          <ScrapCart position={[9, 0, -7.45]} rotation={[0, 0, 0]} />
          <WorkshopChassis bodyRef={cartBodyRef} />
          <BlueprintHolograms cartBodyRef={cartBodyRef} />
          <WorkshopDrumStand />
          <GrabbableProps resetSignal={resetNonce} />
          <LogicCables graph={contraptionGraph} />
          <RemotePlayers />
          <PlayerRig
            maxDustPuffs={preset.maxDustPuffs}
            resetSignal={resetNonce}
            cameraSourceRef={cameraSourceRef}
            cartBodyRef={cartBodyRef}
          />
          <GameCameraRig targetSourceRef={cameraSourceRef} resetSignal={resetNonce} />
          <SceneReadyNotifier />
        </Physics>
      </Suspense>
    </Canvas>
  );
}

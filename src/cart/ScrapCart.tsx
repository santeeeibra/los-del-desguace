import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { getSharedTextures, PALETTE } from '../config/visualConfig';

interface ScrapCartProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function ScrapCart({ position = [2.6, 0, -0.8], rotation = [0, -0.45, 0] }: ScrapCartProps) {
  const fanRef = useRef<THREE.Group>(null);
  const engineBlockRef = useRef<THREE.Group>(null);
  const exhaustCapRef = useRef<THREE.Mesh>(null);
  const textures = useMemo(() => getSharedTextures(), []);

  const materials = useMemo(
    () => ({
      chassisYellow: new THREE.MeshStandardMaterial({
        color: PALETTE.metalYellow,
        roughness: 0.48,
        metalness: 0.32,
      }),
      fenderTeal: new THREE.MeshStandardMaterial({
        color: PALETTE.metalTeal,
        roughness: 0.52,
        metalness: 0.28,
      }),
      darkIron: new THREE.MeshStandardMaterial({
        color: PALETTE.metalDark,
        roughness: 0.6,
        metalness: 0.65,
      }),
      brushedSteel: new THREE.MeshStandardMaterial({
        color: PALETTE.metalSteel,
        roughness: 0.3,
        metalness: 0.88,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: PALETTE.brass,
        roughness: 0.28,
        metalness: 0.9,
      }),
      redPaint: new THREE.MeshStandardMaterial({
        color: PALETTE.metalRed,
        roughness: 0.45,
        metalness: 0.28,
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: PALETTE.rubberTire,
        roughness: 0.92,
        metalness: 0.03,
      }),
      seatFabric: new THREE.MeshStandardMaterial({
        color: PALETTE.fabricSeat,
        roughness: 0.93,
        metalness: 0.0,
      }),
      woodRack: new THREE.MeshStandardMaterial({
        map: textures.woodMap,
        roughness: 0.85,
        metalness: 0.0,
      }),
      headlight: new THREE.MeshStandardMaterial({
        color: '#fff1b8',
        emissive: '#ffbe4d',
        emissiveIntensity: 0.75,
        roughness: 0.2,
        metalness: 0.1,
      }),
    }),
    [textures]
  );

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [materials]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    if (fanRef.current) {
      fanRef.current.rotation.z += dt * 11.5;
    }
    if (engineBlockRef.current) {
      // Gentle sputtery idle chug
      engineBlockRef.current.position.y = 0.66 + Math.sin(t * 28) * 0.006;
      engineBlockRef.current.rotation.z = Math.cos(t * 21) * 0.012;
    }
    if (exhaustCapRef.current) {
      exhaustCapRef.current.rotation.x = -0.18 + Math.max(0, Math.sin(t * 13)) * 0.28;
    }
  });

  const renderWheel = (
    x: number,
    y: number,
    z: number,
    radius: number,
    width: number,
    rimMat: THREE.Material
  ) => (
    <group position={[x, y, z]}>
      {/* Chunky tire */}
      <mesh castShadow receiveShadow material={materials.rubber} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius, radius, width, 18]} />
      </mesh>
      {/* Tire sidewall bevel ring */}
      <mesh material={materials.rubber} rotation={[0, Math.PI / 2, 0]} position={[x > 0 ? width * 0.45 : -width * 0.45, 0, 0]}>
        <torusGeometry args={[radius * 0.72, radius * 0.16, 8, 16]} />
      </mesh>
      {/* Painted rim */}
      <mesh castShadow material={rimMat} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.56, radius * 0.56, width + 0.02, 14]} />
      </mesh>
      {/* Steel hubcap */}
      <mesh castShadow material={materials.brushedSteel} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.24, radius * 0.24, width + 0.05, 10]} />
      </mesh>
    </group>
  );

  return (
    <RigidBody type="fixed" position={position} rotation={rotation} colliders={false} name="scrap-cart">
      {/* Compound colliders matching chassis, engine, seat, and rear cargo rack */}
      <CuboidCollider args={[0.92, 0.36, 1.48]} position={[0, 0.46, 0]} />
      <CuboidCollider args={[0.62, 0.28, 0.52]} position={[0, 1.0, 0.15]} />
      <CuboidCollider args={[0.74, 0.22, 0.58]} position={[0, 0.92, -0.98]} />

      <group>
        {/* CHASSIS FRAME (Tubular welded rails + bumpers) */}
        <mesh castShadow receiveShadow material={materials.chassisYellow} position={[-0.58, 0.42, 0]}>
          <boxGeometry args={[0.12, 0.14, 2.72]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.chassisYellow} position={[0.58, 0.42, 0]}>
          <boxGeometry args={[0.12, 0.14, 2.72]} />
        </mesh>
        {/* Floor pan */}
        <mesh castShadow receiveShadow material={materials.darkIron} position={[0, 0.38, 0.1]}>
          <boxGeometry args={[1.1, 0.08, 2.3]} />
        </mesh>
        {/* Front crooked scrap bumper + headlights */}
        <mesh castShadow receiveShadow material={materials.darkIron} position={[0, 0.44, 1.42]} rotation={[0, 0, 0.02]}>
          <boxGeometry args={[1.42, 0.14, 0.16]} />
        </mesh>
        <mesh castShadow material={materials.fenderTeal} position={[0, 0.56, 1.12]}>
          <boxGeometry args={[1.02, 0.22, 0.55]} />
        </mesh>
        <group position={[-0.36, 0.64, 1.38]}>
          <mesh castShadow material={materials.darkIron} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.11, 0.12, 0.14, 12]} />
          </mesh>
          <mesh material={materials.headlight} position={[0, 0, 0.075]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.02, 12]} />
          </mesh>
        </group>
        <group position={[0.36, 0.64, 1.38]}>
          <mesh castShadow material={materials.darkIron} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.11, 0.12, 0.14, 12]} />
          </mesh>
          <mesh material={materials.headlight} position={[0, 0, 0.075]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.02, 12]} />
          </mesh>
        </group>

        {/* AXLES & SUSPENSION STRUTS */}
        <mesh castShadow material={materials.darkIron} position={[0, 0.36, 0.96]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, 1.72, 10]} />
        </mesh>
        <mesh castShadow material={materials.darkIron} position={[0, 0.44, -0.96]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.065, 0.065, 1.82, 10]} />
        </mesh>

        {/* 4 WHEELS (2 front, 2 larger rear) */}
        {renderWheel(-0.92, 0.36, 0.96, 0.36, 0.24, materials.redPaint)}
        {renderWheel(0.92, 0.36, 0.96, 0.36, 0.24, materials.redPaint)}
        {renderWheel(-0.96, 0.44, -0.96, 0.44, 0.3, materials.chassisYellow)}
        {renderWheel(0.96, 0.44, -0.96, 0.44, 0.3, materials.chassisYellow)}

        {/* STEERING COLUMN & CROOKED WHEEL */}
        <group position={[0, 0.78, 0.72]} rotation={[-0.58, 0, 0]}>
          <mesh castShadow material={materials.darkIron}>
            <cylinderGeometry args={[0.04, 0.045, 0.62, 10]} />
          </mesh>
          <mesh castShadow material={materials.rubber} position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.21, 0.032, 8, 18]} />
          </mesh>
          <mesh castShadow material={materials.chassisYellow} position={[0, 0.32, 0]}>
            <boxGeometry args={[0.38, 0.04, 0.04]} />
          </mesh>
        </group>

        {/* FABRIC BUCKET SEAT */}
        <group position={[0, 0.64, 0.16]}>
          {/* Seat base */}
          <mesh castShadow receiveShadow material={materials.seatFabric} position={[0, 0, 0.05]}>
            <boxGeometry args={[0.66, 0.16, 0.58]} />
          </mesh>
          {/* Side bolsters */}
          <mesh castShadow material={materials.seatFabric} position={[-0.29, 0.12, 0.05]}>
            <boxGeometry args={[0.1, 0.16, 0.56]} />
          </mesh>
          <mesh castShadow material={materials.seatFabric} position={[0.29, 0.12, 0.05]}>
            <boxGeometry args={[0.1, 0.16, 0.56]} />
          </mesh>
          {/* Backrest */}
          <mesh castShadow receiveShadow material={materials.seatFabric} position={[0, 0.36, -0.22]} rotation={[-0.16, 0, 0]}>
            <boxGeometry args={[0.64, 0.62, 0.14]} />
          </mesh>
          {/* Rollbar hoop behind seat */}
          <mesh castShadow material={materials.fenderTeal} position={[-0.36, 0.48, -0.28]}>
            <cylinderGeometry args={[0.04, 0.04, 0.84, 10]} />
          </mesh>
          <mesh castShadow material={materials.fenderTeal} position={[0.36, 0.48, -0.28]}>
            <cylinderGeometry args={[0.04, 0.04, 0.84, 10]} />
          </mesh>
          <mesh castShadow material={materials.fenderTeal} position={[0, 0.9, -0.28]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.04, 0.76, 10]} />
          </mesh>
        </group>

        {/* REAR CARGO RACK (Wood planks + tubular steel rails) */}
        <group position={[0, 0.68, -0.98]}>
          {/* Wooden bed planks */}
          <mesh castShadow receiveShadow material={materials.woodRack} position={[0, 0.02, 0]}>
            <boxGeometry args={[1.28, 0.09, 1.02]} />
          </mesh>
          {/* Side & back metal rails */}
          <mesh castShadow material={materials.chassisYellow} position={[-0.64, 0.24, 0]}>
            <boxGeometry args={[0.07, 0.36, 1.04]} />
          </mesh>
          <mesh castShadow material={materials.chassisYellow} position={[0.64, 0.24, 0]}>
            <boxGeometry args={[0.07, 0.36, 1.04]} />
          </mesh>
          <mesh castShadow material={materials.chassisYellow} position={[0, 0.24, -0.5]}>
            <boxGeometry args={[1.28, 0.36, 0.07]} />
          </mesh>
          {/* Corner posts */}
          <mesh castShadow material={materials.darkIron} position={[-0.64, 0.26, -0.5]}>
            <cylinderGeometry args={[0.05, 0.05, 0.46, 8]} />
          </mesh>
          <mesh castShadow material={materials.darkIron} position={[0.64, 0.26, -0.5]}>
            <cylinderGeometry args={[0.05, 0.05, 0.46, 8]} />
          </mesh>
        </group>

        {/* EXPOSED SCRAP ENGINE (Mounted prominently on side/rear-right of rack for clear silhouette!) */}
        <group ref={engineBlockRef} position={[0.42, 0.66, -0.34]}>
          {/* Main block */}
          <mesh castShadow receiveShadow material={materials.brushedSteel}>
            <boxGeometry args={[0.46, 0.38, 0.48]} />
          </mesh>
          {/* Twin V-cylinders */}
          <mesh castShadow material={materials.darkIron} position={[-0.08, 0.24, 0.06]} rotation={[0, 0, 0.28]}>
            <cylinderGeometry args={[0.11, 0.11, 0.24, 12]} />
          </mesh>
          <mesh castShadow material={materials.darkIron} position={[0.1, 0.24, -0.06]} rotation={[0, 0, -0.28]}>
            <cylinderGeometry args={[0.11, 0.11, 0.24, 12]} />
          </mesh>
          {/* Brass fuel tank cylinder */}
          <mesh castShadow material={materials.brass} position={[-0.16, 0.28, -0.2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.09, 0.09, 0.3, 12]} />
          </mesh>
          {/* Spinning cooling fan */}
          <group ref={fanRef} position={[0.25, 0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
            <mesh material={materials.redPaint}>
              <boxGeometry args={[0.28, 0.06, 0.02]} />
            </mesh>
            <mesh material={materials.redPaint}>
              <boxGeometry args={[0.06, 0.28, 0.02]} />
            </mesh>
            <mesh material={materials.brass} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.04, 10]} />
            </mesh>
          </group>
          {/* Vertical exhaust stack with rattling cap */}
          <mesh castShadow material={materials.darkIron} position={[0.16, 0.44, -0.18]}>
            <cylinderGeometry args={[0.05, 0.06, 0.62, 10]} />
          </mesh>
          <mesh ref={exhaustCapRef} castShadow material={materials.brass} position={[0.16, 0.76, -0.18]}>
            <cylinderGeometry args={[0.065, 0.065, 0.025, 10]} />
          </mesh>
        </group>
      </group>
    </RigidBody>
  );
}

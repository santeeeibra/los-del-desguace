import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { getSharedTextures, PALETTE } from '../config/visualConfig';

interface ScrapyardWorkshopProps {
  extraProps: boolean;
}

export function ScrapyardWorkshop({ extraProps }: ScrapyardWorkshopProps) {
  const awningRef = useRef<THREE.Mesh>(null);
  const textures = useMemo(() => getSharedTextures(), []);

  // Create blueprint canvas texture once for the workshop back wall
  const blueprintTex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1f4264';
      ctx.fillRect(0, 0, 256, 160);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      for (let x = 0; x < 256; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 160);
        ctx.stroke();
      }
      for (let y = 0; y < 160; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }
      // Simple chalk/blueprint cart diagram
      ctx.strokeStyle = '#dff3ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(56, 58, 138, 38);
      ctx.beginPath();
      ctx.arc(82, 108, 18, 0, Math.PI * 2);
      ctx.arc(172, 108, 22, 0, Math.PI * 2);
      ctx.stroke();
      // Seat & steering line
      ctx.beginPath();
      ctx.moveTo(116, 58);
      ctx.lineTo(116, 30);
      ctx.moveTo(154, 58);
      ctx.lineTo(170, 34);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, []);

  const materials = useMemo(
    () => ({
      earth: new THREE.MeshStandardMaterial({
        color: '#b88f64',
        roughness: 0.96,
        metalness: 0.0,
      }),
      concrete: new THREE.MeshStandardMaterial({
        map: textures.concreteMap,
        roughness: 0.9,
        metalness: 0.02,
      }),
      hazard: new THREE.MeshStandardMaterial({
        map: textures.hazardMap,
        roughness: 0.72,
        metalness: 0.08,
      }),
      wood: new THREE.MeshStandardMaterial({
        map: textures.woodMap,
        roughness: 0.85,
        metalness: 0.0,
      }),
      woodDark: new THREE.MeshStandardMaterial({
        color: PALETTE.woodDark,
        roughness: 0.88,
        metalness: 0.0,
      }),
      metalTeal: new THREE.MeshStandardMaterial({
        color: PALETTE.metalTeal,
        map: textures.corrugatedMap,
        roughness: 0.56,
        metalness: 0.28,
      }),
      metalRust: new THREE.MeshStandardMaterial({
        color: PALETTE.metalRust,
        map: textures.corrugatedMap,
        roughness: 0.68,
        metalness: 0.24,
      }),
      metalYellow: new THREE.MeshStandardMaterial({
        color: PALETTE.metalYellow,
        roughness: 0.5,
        metalness: 0.3,
      }),
      metalRed: new THREE.MeshStandardMaterial({
        color: PALETTE.metalRed,
        roughness: 0.52,
        metalness: 0.28,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: PALETTE.metalDark,
        roughness: 0.55,
        metalness: 0.72,
      }),
      brightSteel: new THREE.MeshStandardMaterial({
        color: PALETTE.metalSteel,
        roughness: 0.32,
        metalness: 0.88,
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: PALETTE.rubberTire,
        roughness: 0.92,
        metalness: 0.02,
      }),
      canvasAwning: new THREE.MeshStandardMaterial({
        color: PALETTE.awningCanvas,
        roughness: 0.94,
        metalness: 0.0,
      }),
      lampBulb: new THREE.MeshStandardMaterial({
        color: '#fff4cc',
        emissive: PALETTE.lampWarm,
        emissiveIntensity: 1.8,
        roughness: 0.2,
        metalness: 0.0,
      }),
      blueprint: new THREE.MeshStandardMaterial({
        map: blueprintTex,
        roughness: 0.82,
        metalness: 0.02,
      }),
    }),
    [textures, blueprintTex]
  );

  useEffect(() => {
    return () => {
      blueprintTex.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [blueprintTex, materials]);

  useFrame((state) => {
    if (awningRef.current) {
      awningRef.current.rotation.x = 0.22 + Math.sin(state.clock.elapsedTime * 2.1) * 0.025;
    }
  });

  const renderLamp = (x: number, y: number, z: number) => (
    <group position={[x, y, z]}>
      <mesh material={materials.steel} position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 8]} />
      </mesh>
      <mesh castShadow material={materials.metalRed}>
        <coneGeometry args={[0.28, 0.2, 14, 1, true]} />
      </mesh>
      <mesh material={materials.lampBulb} position={[0, -0.06, 0]}>
        <sphereGeometry args={[0.09, 10, 10]} />
      </mesh>
    </group>
  );

  const renderBarrel = (x: number, y: number, z: number, mat: THREE.Material) => (
    <group position={[x, y, z]}>
      <mesh castShadow receiveShadow material={mat}>
        <cylinderGeometry args={[0.36, 0.36, 0.96, 14]} />
      </mesh>
      <mesh material={materials.steel} position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.375, 0.375, 0.05, 14]} />
      </mesh>
      <mesh material={materials.steel} position={[0, -0.22, 0]}>
        <cylinderGeometry args={[0.375, 0.375, 0.05, 14]} />
      </mesh>
    </group>
  );

  return (
    <group name="scrapyard-workshop">
      {/* GROUND PLANE & CONCRETE WORKSHOP SLAB */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        {/* Ground collision covers entire expanded campus (workshop + west patio + south track) */}
        <CuboidCollider args={[36, 0.5, 36]} position={[0, -0.5, 12]} />
        {/* Warm sandy scrapyard dirt ground */}
        <mesh receiveShadow material={materials.earth} position={[0, -0.02, 12]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[96, 96]} />
        </mesh>
        {/* Main concrete workshop floor */}
        <mesh receiveShadow material={materials.concrete} position={[0, 0.005, -0.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[18, 16]} />
        </mesh>
        {/* Painted hazard bay frame around the cart area */}
        <mesh receiveShadow material={materials.hazard} position={[2.6, 0.012, -2.55]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.4, 0.24]} />
        </mesh>
        <mesh receiveShadow material={materials.hazard} position={[2.6, 0.012, 0.95]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.4, 0.24]} />
        </mesh>
      </RigidBody>

      {/* COVERED WORKSHOP SHED ("EL GALPÓN") */}
      <RigidBody type="fixed" colliders={false}>
        {/* Back wall & side wing colliders for solid camera raycast testing */}
        <CuboidCollider args={[5.5, 2.0, 0.22]} position={[-1.5, 2.0, -7.2]} />
        <CuboidCollider args={[0.22, 2.0, 2.5]} position={[-6.8, 2.0, -4.9]} />
        {/* Steel support posts */}
        <CuboidCollider args={[0.16, 1.85, 0.16]} position={[-6.7, 1.85, -2.4]} />
        <CuboidCollider args={[0.16, 1.85, 0.16]} position={[-1.5, 1.85, -2.4]} />
        <CuboidCollider args={[0.16, 1.85, 0.16]} position={[3.7, 1.85, -2.4]} />
        {/* Slanted roof collider */}
        <CuboidCollider args={[5.8, 0.15, 2.9]} position={[-1.5, 3.75, -4.8]} rotation={[0.12, 0, 0]} />

        {/* Back corrugated walls */}
        <mesh castShadow receiveShadow material={materials.metalTeal} position={[-4.1, 1.9, -7.2]}>
          <boxGeometry args={[5.3, 3.8, 0.22]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.metalRust} position={[1.1, 1.9, -7.2]}>
          <boxGeometry args={[5.3, 3.8, 0.22]} />
        </mesh>
        {/* Left shed wall */}
        <mesh castShadow receiveShadow material={materials.metalTeal} position={[-6.8, 1.9, -4.8]}>
          <boxGeometry args={[0.22, 3.8, 4.9]} />
        </mesh>
        {/* Vertical steel I-beam pillars */}
        {[-6.7, -1.5, 3.7].map((px) => (
          <group key={px}>
            <mesh castShadow receiveShadow material={materials.steel} position={[px, 1.66, -2.45]}>
              <boxGeometry args={[0.24, 3.32, 0.24]} />
            </mesh>
            <mesh castShadow receiveShadow material={materials.steel} position={[px, 1.82, -7.05]}>
              <boxGeometry args={[0.24, 3.64, 0.24]} />
            </mesh>
            {/* Concrete footing */}
            <mesh castShadow receiveShadow material={materials.concrete} position={[px, 0.12, -2.45]}>
              <boxGeometry args={[0.42, 0.24, 0.42]} />
            </mesh>
          </group>
        ))}

        {/* Slanted corrugated shed roof */}
        <mesh castShadow receiveShadow material={materials.metalRust} position={[-1.5, 3.78, -4.8]} rotation={[0.12, 0, 0]}>
          <boxGeometry args={[11.4, 0.14, 5.6]} />
        </mesh>
        {/* Timber roof rafters */}
        {[-6.5, -4.0, -1.5, 1.0, 3.5].map((rx) => (
          <mesh key={rx} castShadow material={materials.woodDark} position={[rx, 3.62, -4.8]} rotation={[0.12, 0, 0]}>
            <boxGeometry args={[0.16, 0.22, 5.4]} />
          </mesh>
        ))}

        {/* Fluttering canvas awning along front shed edge */}
        <mesh ref={awningRef} castShadow material={materials.canvasAwning} position={[-1.5, 3.22, -1.85]} rotation={[0.22, 0, 0]}>
          <boxGeometry args={[10.8, 0.05, 0.95]} />
        </mesh>

        {/* Workshop Blueprint Board on back wall */}
        <group position={[-1.5, 2.05, -7.03]}>
          <mesh castShadow material={materials.woodDark}>
            <boxGeometry args={[2.5, 1.55, 0.08]} />
          </mesh>
          <mesh material={materials.blueprint} position={[0, 0, 0.045]}>
            <planeGeometry args={[2.3, 1.38]} />
          </mesh>
        </group>

        {/* Tool Pegboard & Giant Decorative Wrench on back-left wall */}
        <group position={[-4.5, 1.95, -7.03]}>
          <mesh castShadow material={materials.wood}>
            <boxGeometry args={[1.9, 1.15, 0.06]} />
          </mesh>
          <mesh material={materials.brightSteel} position={[-0.45, 0.05, 0.06]} rotation={[0, 0, 0.25]}>
            <boxGeometry args={[0.1, 0.72, 0.04]} />
          </mesh>
          <mesh material={materials.metalRed} position={[0, 0.02, 0.06]} rotation={[0, 0, -0.15]}>
            <boxGeometry args={[0.12, 0.56, 0.04]} />
          </mesh>
          <mesh material={materials.metalYellow} position={[0.48, -0.04, 0.06]}>
            <boxGeometry args={[0.14, 0.48, 0.04]} />
          </mesh>
        </group>

        {/* Hanging Warm Work Lamps */}
        {renderLamp(-4.2, 3.25, -4.2)}
        {renderLamp(-1.5, 3.25, -4.2)}
        {renderLamp(1.5, 3.25, -4.2)}
      </RigidBody>

      {/* Non-shadow warm bounce point light inside the workshop bay for cozy golden depth */}
      <pointLight position={[-1.5, 2.8, -4.4]} color={PALETTE.lampWarm} intensity={5.5} distance={10} decay={2} />

      {/* INVENTOR'S WORKBENCH (Inside shed left-center) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1.45, 0.48, 0.52]} position={[-4.3, 0.48, -6.2]} />
        <group position={[-4.3, 0, -6.2]}>
          {/* Steel legs */}
          {[-1.25, 1.25].map((lx) =>
            [-0.38, 0.38].map((lz) => (
              <mesh key={`${lx}-${lz}`} castShadow material={materials.metalRed} position={[lx, 0.43, lz]}>
                <boxGeometry args={[0.1, 0.86, 0.1]} />
              </mesh>
            ))
          )}
          {/* Thick wood tabletop */}
          <mesh castShadow receiveShadow material={materials.wood} position={[0, 0.9, 0]}>
            <boxGeometry args={[2.9, 0.12, 1.05]} />
          </mesh>
          {/* Bench vise + gears on top */}
          <mesh castShadow material={materials.metalTeal} position={[-0.95, 1.04, 0.32]}>
            <boxGeometry args={[0.26, 0.18, 0.24]} />
          </mesh>
          <mesh castShadow material={materials.brightSteel} position={[0.6, 0.99, 0.1]}>
            <cylinderGeometry args={[0.2, 0.2, 0.06, 12]} />
          </mesh>
          <mesh castShadow material={materials.metalYellow} position={[0.15, 1.03, -0.15]}>
            <boxGeometry args={[0.38, 0.16, 0.24]} />
          </mesh>
        </group>
      </RigidBody>

      {/* LOADING DOCK & RAMP (Scale, Jump & Landing Test Zone - Right side) */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        {/* Main wooden loading platform (1.0m high) */}
        <CuboidCollider args={[2.1, 0.5, 2.1]} position={[6.5, 0.5, 2.4]} />
        {/* Sloped wooden ramp leading up to platform */}
        <CuboidCollider args={[0.95, 0.12, 1.65]} position={[6.5, 0.48, -0.95]} rotation={[-0.31, 0, 0]} />
        {/* Two stepped crates on side for jump/landing testing */}
        <CuboidCollider args={[0.55, 0.25, 0.55]} position={[3.8, 0.25, 3.2]} />
        <CuboidCollider args={[0.55, 0.5, 0.55]} position={[4.8, 0.5, 4.1]} />

        {/* Platform visuals */}
        <group position={[6.5, 0, 2.4]}>
          {/* Timber corner posts */}
          {[-1.85, 1.85].map((px) =>
            [-1.85, 1.85].map((pz) => (
              <mesh key={`${px}-${pz}`} castShadow receiveShadow material={materials.woodDark} position={[px, 0.48, pz]}>
                <boxGeometry args={[0.22, 0.96, 0.22]} />
              </mesh>
            ))
          )}
          {/* Top wooden deck */}
          <mesh castShadow receiveShadow material={materials.wood} position={[0, 0.94, 0]}>
            <boxGeometry args={[4.2, 0.14, 4.2]} />
          </mesh>
          {/* Hazard edge trim */}
          <mesh receiveShadow material={materials.hazard} position={[-2.04, 0.94, 0]}>
            <boxGeometry args={[0.14, 0.16, 4.2]} />
          </mesh>
        </group>

        {/* Wooden ramp visual */}
        <mesh castShadow receiveShadow material={materials.wood} position={[6.5, 0.48, -0.95]} rotation={[-0.31, 0, 0]}>
          <boxGeometry args={[1.9, 0.16, 3.3]} />
        </mesh>

        {/* Stepped jump crates */}
        <mesh castShadow receiveShadow material={materials.wood} position={[3.8, 0.25, 3.2]}>
          <boxGeometry args={[1.1, 0.5, 1.1]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.woodDark} position={[4.8, 0.5, 4.1]}>
          <boxGeometry args={[1.1, 1.0, 1.1]} />
        </mesh>
      </RigidBody>

      {/* CAMERA WALL-COLLISION TEST NOOK & SCRAP CONTAINER WALL (Left Courtyard) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.25, 1.5, 2.4]} position={[-6.4, 1.5, 1.8]} />
        <CuboidCollider args={[1.8, 1.5, 0.25]} position={[-4.8, 1.5, 4.0]} />

        {/* Corrugated metal L-wall (great for orbiting camera behind wall to verify no clipping!) */}
        <mesh castShadow receiveShadow material={materials.metalYellow} position={[-6.4, 1.5, 1.8]}>
          <boxGeometry args={[0.45, 3.0, 4.8]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.metalTeal} position={[-4.8, 1.5, 4.0]}>
          <boxGeometry args={[3.5, 3.0, 0.45]} />
        </mesh>
        {/* Salvaged hazard sign trim */}
        <mesh castShadow material={materials.hazard} position={[-6.16, 1.9, 1.8]}>
          <boxGeometry args={[0.04, 0.32, 4.2]} />
        </mesh>
      </RigidBody>

      {/* OIL DRUMS & TIRE STACKS (Static sturdy props + 2 dynamic bumpable drums) */}
      <RigidBody type="fixed" colliders={false} position={[1.4, 0, -5.9]}>
        <CylinderCollider args={[0.48, 0.36]} position={[0, 0.48, 0]} />
        <CylinderCollider args={[0.48, 0.36]} position={[0.85, 0.48, 0.2]} />
        {renderBarrel(0, 0.48, 0, materials.metalRed)}
        {renderBarrel(0.85, 0.48, 0.2, materials.metalYellow)}
      </RigidBody>

      {/* Dynamic bumpable barrel & tire stack to test bump/collision reaction! */}
      <RigidBody type="dynamic" mass={14} linearDamping={1.2} angularDamping={1.5} position={[-1.8, 0.5, 2.2]}>
        <CylinderCollider args={[0.48, 0.36]} />
        {renderBarrel(0, 0, 0, materials.metalTeal)}
      </RigidBody>

      {extraProps && (
        <RigidBody type="dynamic" mass={12} linearDamping={1.2} angularDamping={1.5} position={[-2.6, 0.5, 2.5]}>
          <CylinderCollider args={[0.48, 0.36]} />
          {renderBarrel(0, 0, 0, materials.metalRust)}
        </RigidBody>
      )}

      {/* Stacked decorative tires near the left nook */}
      <RigidBody type="fixed" colliders={false} position={[-5.4, 0, 2.8]}>
        <CylinderCollider args={[0.48, 0.46]} position={[0, 0.48, 0]} />
        {[0.14, 0.42, 0.7].map((ty, idx) => (
          <mesh
            key={ty}
            castShadow
            receiveShadow
            material={materials.rubber}
            position={[idx === 1 ? 0.04 : 0, ty, idx === 2 ? -0.04 : 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.34, 0.14, 10, 18]} />
          </mesh>
        ))}
      </RigidBody>

      {/* PERIMETER SCRAPYARD FENCE (Con portones abiertos hacia el Patio Oeste y la Pista Sur) */}
      <RigidBody type="fixed" colliders={false}>
        {/* North wall */}
        <CuboidCollider args={[11.5, 1.5, 0.25]} position={[0, 1.5, -9.2]} />
        {/* South wall split to leave wide 7.2m gate (x = -0.6..6.6) open to the Test Track! */}
        <CuboidCollider args={[4.8, 1.5, 0.25]} position={[-5.4, 1.5, 8.6]} />
        <CuboidCollider args={[2.0, 1.5, 0.25]} position={[8.6, 1.5, 8.6]} />
        {/* West wall split to leave wide 6m gate (z = 1.0..7.0) open to the Scrapyard Patio! */}
        <CuboidCollider args={[0.25, 1.5, 5.2]} position={[-10.4, 1.5, -4.2]} />
        {/* East wall split near south-east return lane */}
        <CuboidCollider args={[0.25, 1.5, 4.5]} position={[10.4, 1.5, -4.5]} />

        {/* South fence visuals flanking the track gate */}
        <group position={[-5.5, 0, 8.5]}>
          <mesh castShadow receiveShadow material={materials.metalRust} position={[0, 0.85, 0]}>
            <boxGeometry args={[9.4, 1.5, 0.16]} />
          </mesh>
          <mesh castShadow material={materials.woodDark} position={[-4.8, 1.0, 0]}>
            <boxGeometry args={[0.22, 2.0, 0.22]} />
          </mesh>
        </group>
        <group position={[8.6, 0, 8.5]}>
          <mesh castShadow receiveShadow material={materials.metalTeal} position={[0, 0.85, 0]}>
            <boxGeometry args={[3.6, 1.5, 0.16]} />
          </mesh>
        </group>

        {/* East fence visuals (north half) */}
        {[-6.5, -2.0].map((fz, i) => (
          <group key={`east-${fz}`} position={[10.3, 0, fz]}>
            <mesh castShadow receiveShadow material={i % 2 === 0 ? materials.metalTeal : materials.metalYellow} position={[0, 0.85, 0]}>
              <boxGeometry args={[0.16, 1.5, 4.1]} />
            </mesh>
            <mesh castShadow material={materials.woodDark} position={[0, 1.0, -2.1]}>
              <boxGeometry args={[0.22, 2.0, 0.22]} />
            </mesh>
          </group>
        ))}

        {/* West fence visuals flanking the scrapyard patio gate */}
        {[-6.5, -2.0].map((fz, i) => (
          <group key={`west-${fz}`} position={[-10.3, 0, fz]}>
            <mesh castShadow receiveShadow material={i % 2 === 0 ? materials.metalRust : materials.metalTeal} position={[0, 0.85, 0]}>
              <boxGeometry args={[0.16, 1.5, 4.1]} />
            </mesh>
            <mesh castShadow material={materials.woodDark} position={[0, 1.0, -2.1]}>
              <boxGeometry args={[0.22, 2.0, 0.22]} />
            </mesh>
          </group>
        ))}
      </RigidBody>
    </group>
  );
}

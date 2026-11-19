import { useEffect, useMemo } from 'react';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { getSharedTextures, PALETTE } from '../config/visualConfig';

export function TestTrackAndYard({ extraProps }: { extraProps: boolean }) {
  const textures = useMemo(() => getSharedTextures(), []);

  // Painted start/finish banner texture (no words required: checkered flag + arrows)
  const bannerTex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      for (let x = 0; x < 256; x += 32) {
        for (let y = 0; y < 64; y += 32) {
          const dark = ((x / 32 + y / 32) | 0) % 2 === 0;
          ctx.fillStyle = dark ? '#242220' : '#f5e4b8';
          ctx.fillRect(x, y, 32, 32);
        }
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, []);

  const materials = useMemo(
    () => ({
      trackSurface: new THREE.MeshStandardMaterial({
        color: '#4e4b48',
        roughness: 0.9,
        metalness: 0.04,
      }),
      curbYellow: new THREE.MeshStandardMaterial({
        color: PALETTE.hazardYellow,
        roughness: 0.72,
        metalness: 0.05,
      }),
      curbRed: new THREE.MeshStandardMaterial({
        color: PALETTE.metalRed,
        roughness: 0.72,
        metalness: 0.05,
      }),
      dirtMound: new THREE.MeshStandardMaterial({
        color: '#a87d52',
        roughness: 0.96,
        metalness: 0.0,
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
        bumpMap: textures.corrugatedBumpMap,
        bumpScale: 0.03,
        roughness: 0.56,
        metalness: 0.28,
      }),
      metalRust: new THREE.MeshStandardMaterial({
        color: PALETTE.metalRust,
        map: textures.corrugatedMap,
        bumpMap: textures.corrugatedBumpMap,
        bumpScale: 0.03,
        roughness: 0.68,
        metalness: 0.24,
      }),
      metalYellow: new THREE.MeshStandardMaterial({
        color: PALETTE.metalYellow,
        roughness: 0.5,
        metalness: 0.3,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: PALETTE.metalDark,
        roughness: 0.55,
        metalness: 0.72,
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: PALETTE.rubberTire,
        roughness: 0.92,
        metalness: 0.02,
      }),
      hazard: new THREE.MeshStandardMaterial({
        map: textures.hazardMap,
        roughness: 0.72,
        metalness: 0.08,
      }),
      banner: new THREE.MeshStandardMaterial({
        map: bannerTex,
        roughness: 0.75,
        metalness: 0.05,
      }),
      stuntHoop: new THREE.MeshStandardMaterial({
        color: '#ffb703',
        emissive: '#ff6d00',
        emissiveIntensity: 1.8,
        roughness: 0.25,
        metalness: 0.2,
        toneMapped: false,
      }),
    }),
    [textures, bannerTex]
  );

  useEffect(() => {
    return () => {
      bannerTex.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [bannerTex, materials]);

  return (
    <group name="test-track-and-scrapyard">
      {/* =====================================================================
          ZONA 2: PATIO DE CHATARRA + ZONA DE CARGA + TERRENO IRREGULAR SUAVE
          Ubicado al oeste del taller (x = -22..-10, z = -7..16)
         ===================================================================== */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        {/* Piso de tierra compactada del patio oeste */}
        <mesh receiveShadow material={materials.dirtMound} position={[-16, -0.01, 4]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[14, 24]} />
        </mesh>

        {/* Zona de carga señalizada en el patio */}
        <mesh receiveShadow material={materials.hazard} position={[-15.5, 0.01, 2.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.2, 4.6]} />
        </mesh>
        <mesh receiveShadow material={materials.wood} position={[-15.5, 0.02, 2.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.4, 3.8]} />
        </mesh>

        {/* Plataforma baja de carga + rampa corta para apilar cajas y rodar ruedas */}
        <CuboidCollider args={[1.6, 0.25, 1.4]} position={[-16.8, 0.25, -2.5]} />
        <CuboidCollider args={[0.95, 0.1, 1.2]} position={[-14.2, 0.22, -2.5]} rotation={[0, 0, -0.24]} />
        <mesh castShadow receiveShadow material={materials.wood} position={[-16.8, 0.25, -2.5]}>
          <boxGeometry args={[3.2, 0.5, 2.8]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.wood} position={[-14.2, 0.22, -2.5]} rotation={[0, 0, -0.24]}>
          <boxGeometry args={[1.9, 0.16, 2.4]} />
        </mesh>

        {/* Terreno irregular suave (lomas anchas de poca pendiente para probar suspensión) */}
        <CuboidCollider args={[2.2, 0.16, 2.4]} position={[-14.5, 0.06, 9.5]} rotation={[-0.14, 0, 0]} />
        <CuboidCollider args={[2.2, 0.16, 2.4]} position={[-14.5, 0.06, 13.8]} rotation={[0.14, 0, 0]} />
        <mesh castShadow receiveShadow material={materials.dirtMound} position={[-14.5, 0.06, 9.5]} rotation={[-0.14, 0, 0]}>
          <boxGeometry args={[4.4, 0.32, 4.8]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.dirtMound} position={[-14.5, 0.06, 13.8]} rotation={[0.14, 0, 0]}>
          <boxGeometry args={[4.4, 0.32, 4.8]} />
        </mesh>

        {/* Contenedores / hitos visuales del patio para orientarse fácil */}
        <CuboidCollider args={[1.4, 1.3, 2.8]} position={[-19.8, 1.3, -2.2]} />
        <mesh castShadow receiveShadow material={materials.metalTeal} position={[-19.8, 1.3, -2.2]}>
          <boxGeometry args={[2.8, 2.6, 5.6]} />
        </mesh>
        <CuboidCollider args={[1.4, 1.3, 2.6]} position={[-19.8, 1.3, 7.2]} />
        <mesh castShadow receiveShadow material={materials.metalRust} position={[-19.8, 1.3, 7.2]}>
          <boxGeometry args={[2.8, 2.6, 5.2]} />
        </mesh>

        {/* Muros perimetrales del patio oeste */}
        <CuboidCollider args={[6.5, 1.4, 0.25]} position={[-16, 1.4, -7.8]} />
        <CuboidCollider args={[0.25, 1.4, 12.5]} position={[-22.2, 1.4, 4.5]} />
        <CuboidCollider args={[6.5, 1.4, 0.25]} position={[-16, 1.4, 16.8]} />
        <mesh castShadow receiveShadow material={materials.metalRust} position={[-16, 0.9, -7.8]}>
          <boxGeometry args={[12.5, 1.8, 0.2]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.metalTeal} position={[-22.2, 0.9, 4.5]}>
          <boxGeometry args={[0.2, 1.8, 24.5]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.metalYellow} position={[-16, 0.9, 16.8]}>
          <boxGeometry args={[12.5, 1.8, 0.2]} />
        </mesh>
      </RigidBody>

      {/* =====================================================================
          ZONA 3: PISTA CORTA DE PRUEBA (Recta, Curva, Pendiente y Obstáculo)
          Conectada al sur/sureste del taller (z = 8.5..35, x = -2..20)
         ===================================================================== */}
      <RigidBody type="fixed" colliders={false} friction={1.1}>
        {/* Arco de entrada a la pista desde el taller (despejado de la cámara inicial) */}
        <CuboidCollider args={[0.24, 1.9, 0.24]} position={[-0.6, 1.9, 10.8]} />
        <CuboidCollider args={[0.24, 1.9, 0.24]} position={[6.6, 1.9, 10.8]} />
        <mesh castShadow material={materials.metalYellow} position={[-0.6, 1.9, 10.8]}>
          <boxGeometry args={[0.42, 3.8, 0.42]} />
        </mesh>
        <mesh castShadow material={materials.metalYellow} position={[6.6, 1.9, 10.8]}>
          <boxGeometry args={[0.42, 3.8, 0.42]} />
        </mesh>
        <mesh castShadow material={materials.banner} position={[3.0, 3.85, 10.8]}>
          <boxGeometry args={[7.8, 0.65, 0.28]} />
        </mesh>

        {/* 1. RECTA PRINCIPAL (x = 3.0, z = 8.5..27) */}
        <mesh receiveShadow material={materials.trackSurface} position={[3.0, 0.012, 18.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.6, 19.5]} />
        </mesh>
        {/* Bordillos laterales de alta visibilidad */}
        <mesh receiveShadow material={materials.curbYellow} position={[-0.2, 0.02, 18.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.4, 19.0]} />
        </mesh>
        <mesh receiveShadow material={materials.curbYellow} position={[6.2, 0.02, 18.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.4, 19.0]} />
        </mesh>

        {/* 2. CURVA AMPLIA AL SUR (x = 3..16, z = 27..35) */}
        <mesh receiveShadow material={materials.trackSurface} position={[9.5, 0.012, 30.8]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[19.5, 7.6]} />
        </mesh>
        {/* Curva visual con barreras de neumáticos y chevrones */}
        {[
          [0.0, 34.4],
          [3.2, 34.8],
          [6.5, 35.0],
          [9.8, 35.0],
          [13.0, 34.8],
          [16.2, 34.2],
          [18.6, 32.0],
          [19.4, 28.8],
        ].map(([bx, bz], i) => (
          <group key={`curve-tire-${i}`} position={[bx, 0, bz]}>
            <CylinderCollider args={[0.38, 0.48]} position={[0, 0.38, 0]} />
            <mesh castShadow receiveShadow material={materials.rubber} position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.34, 0.14, 8, 14]} />
            </mesh>
            <mesh castShadow material={i % 2 === 0 ? materials.curbRed : materials.curbYellow} position={[0, 0.56, 0]}>
              <cylinderGeometry args={[0.3, 0.32, 0.35, 10]} />
            </mesh>
          </group>
        ))}

        {/* 3. RECTA DE REGRESO + PENDIENTE SUAVE (x = 15.5, z = 27..8) */}
        <mesh receiveShadow material={materials.trackSurface} position={[15.5, 0.012, 17.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.6, 20.0]} />
        </mesh>
        {/* Rampa suave subida (~9 deg) -> plataforma puente -> rampa suave bajada */}
        <CuboidCollider args={[2.1, 0.16, 2.8]} position={[15.5, 0.35, 22.8]} rotation={[0.16, 0, 0]} />
        <CuboidCollider args={[2.1, 0.44, 1.9]} position={[15.5, 0.44, 18.4]} />
        <CuboidCollider args={[2.1, 0.16, 2.8]} position={[15.5, 0.35, 14.0]} rotation={[-0.16, 0, 0]} />

        <mesh castShadow receiveShadow material={materials.wood} position={[15.5, 0.35, 22.8]} rotation={[0.16, 0, 0]}>
          <boxGeometry args={[4.2, 0.32, 5.6]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.woodDark} position={[15.5, 0.44, 18.4]}>
          <boxGeometry args={[4.2, 0.88, 3.8]} />
        </mesh>
        <mesh receiveShadow material={materials.hazard} position={[15.5, 0.89, 18.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.2, 0.35]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.wood} position={[15.5, 0.35, 14.0]} rotation={[-0.16, 0, 0]}>
          <boxGeometry args={[4.2, 0.32, 5.6]} />
        </mesh>

        {/* 4. PEQUEÑOS OBSTÁCULOS (Lomos bajos redondeados para probar suspensión y estabilidad) */}
        <group position={[3.0, 0, 21.5]}>
          <CylinderCollider args={[2.4, 0.13]} rotation={[0, 0, Math.PI / 2]} position={[0, 0.05, 0]} />
          <mesh castShadow receiveShadow material={materials.curbYellow} rotation={[0, 0, Math.PI / 2]} position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 4.8, 12]} />
          </mesh>
        </group>
        {extraProps && (
          <group position={[3.0, 0, 23.2]}>
            <CylinderCollider args={[2.4, 0.11]} rotation={[0, 0, Math.PI / 2]} position={[0, 0.04, 0]} />
            <mesh castShadow receiveShadow material={materials.curbRed} rotation={[0, 0, Math.PI / 2]} position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.11, 0.11, 4.8, 12]} />
            </mesh>
          </group>
        )}

        {/* Isla central convertida en pista de despegue + Mega Rampa de Acrobacias */}
        <mesh receiveShadow material={materials.dirtMound} position={[9.5, 0.015, 19.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.8, 12.6]} />
        </mesh>
        {/* Mega Rampa de Acrobacias (inclinada hacia +Z para saltar por el aro luminoso) */}
        <group position={[9.5, 0.65, 19.5]}>
          <CuboidCollider args={[1.9, 0.16, 3.1]} rotation={[-0.28, 0, 0]} />
          <mesh castShadow receiveShadow material={materials.wood} rotation={[-0.28, 0, 0]}>
            <boxGeometry args={[3.8, 0.32, 6.2]} />
          </mesh>
          <mesh receiveShadow material={materials.hazard} position={[0, 0.17, 0]} rotation={[-0.28, 0, 0]}>
            <boxGeometry args={[3.84, 0.04, 0.65]} />
          </mesh>
          {/* Soportes laterales de madera debajo de la parte alta de la rampa */}
          <mesh castShadow receiveShadow material={materials.woodDark} position={[-1.7, -0.02, 2.3]}>
            <boxGeometry args={[0.26, 1.32, 0.32]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.woodDark} position={[1.7, -0.02, 2.3]}>
            <boxGeometry args={[0.26, 1.32, 0.32]} />
          </mesh>
          {/* Bordes guía amarillos de la rampa */}
          <mesh castShadow material={materials.curbYellow} position={[-1.85, 0.22, 0]} rotation={[-0.28, 0, 0]}>
            <boxGeometry args={[0.14, 0.18, 6.2]} />
          </mesh>
          <mesh castShadow material={materials.curbYellow} position={[1.85, 0.22, 0]} rotation={[-0.28, 0, 0]}>
            <boxGeometry args={[0.14, 0.18, 6.2]} />
          </mesh>
        </group>

        {/* Aro luminoso decorativo de acrobacias sobre la rampa */}
        <group position={[9.5, 4.2, 25.0]}>
          <mesh castShadow material={materials.stuntHoop}>
            <torusGeometry args={[2.1, 0.14, 12, 32]} />
          </mesh>
          <mesh castShadow material={materials.steel} position={[-2.15, -2.1, 0]}>
            <cylinderGeometry args={[0.1, 0.14, 4.2, 10]} />
          </mesh>
          <mesh castShadow material={materials.steel} position={[2.15, -2.1, 0]}>
            <cylinderGeometry args={[0.1, 0.14, 4.2, 10]} />
          </mesh>
        </group>

        {/* Conexión de vuelta al taller desde la recta este (x = 10..18, z = 4..9) */}
        <mesh receiveShadow material={materials.trackSurface} position={[14.2, 0.012, 6.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8.5, 6.5]} />
        </mesh>

        {/* Muros perimetrales externos de la pista */}
        <CuboidCollider args={[0.3, 1.5, 16.0]} position={[-1.4, 1.5, 22.0]} />
        <CuboidCollider args={[12.0, 1.5, 0.3]} position={[9.5, 1.5, 36.2]} />
        <CuboidCollider args={[0.3, 1.5, 18.0]} position={[20.5, 1.5, 19.0]} />
        <CuboidCollider args={[5.5, 1.5, 0.3]} position={[15.5, 1.5, 1.5]} />

        <mesh castShadow material={materials.metalTeal} position={[-1.4, 0.8, 22.0]}>
          <boxGeometry args={[0.22, 1.6, 30.0]} />
        </mesh>
        <mesh castShadow material={materials.metalRust} position={[9.5, 0.8, 36.2]}>
          <boxGeometry args={[22.0, 1.6, 0.22]} />
        </mesh>
        <mesh castShadow material={materials.metalYellow} position={[20.5, 0.8, 19.0]}>
          <boxGeometry args={[0.22, 1.6, 34.0]} />
        </mesh>
        <mesh castShadow receiveShadow material={materials.metalTeal} position={[15.5, 0.8, 1.5]}>
          <boxGeometry args={[11.0, 1.6, 0.22]} />
        </mesh>
      </RigidBody>
    </group>
  );
}

import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, MeshStandardMaterial } from 'three';

const TEAL = '#2c7e73';
const DARK = '#23282e';
const COPPER = '#d97a38';
const BRASS = '#e3b34c';
const GLOW = '#72f5da';
const LEATHER = '#4a2a12';

/**
 * Pinza/pistola de cableado eléctrico del taller (estética artesanal madera/metal/cobre).
 * Se equipa en la mano al seleccionar Cables en la barra de herramientas; `tipRef` marca la punta emisora.
 */
export function WireTool({ tipRef }: { tipRef?: RefObject<Group | null> }) {
  const glowMatRef = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (glowMatRef.current) {
      glowMatRef.current.emissiveIntensity = 1.05 + Math.sin(clock.elapsedTime * 6.5) * 0.45;
    }
  });
  return (
    <group position={[0.048, -0.014, 0.01]} rotation={[0.1, -0.12, 0.1]}>
      <group ref={tipRef} position={[0, 0.01, 0.27]} />
      {/* Empuñadura aislada */}
      <mesh position={[0, -0.055, -0.005]} castShadow>
        <boxGeometry args={[0.036, 0.095, 0.04]} />
        <meshStandardMaterial color={LEATHER} roughness={0.88} />
      </mesh>
      {/* Cuerpo principal esmaltado turquesa */}
      <mesh position={[0, 0.01, 0.03]} castShadow>
        <boxGeometry args={[0.064, 0.068, 0.145]} />
        <meshStandardMaterial color={TEAL} roughness={0.45} metalness={0.25} />
      </mesh>
      {/* Carrete de cable de cobre superior */}
      <group position={[0, 0.062, 0.015]} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.036, 0.036, 0.056, 16]} />
          <meshStandardMaterial color={COPPER} roughness={0.42} metalness={0.68} />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.044, 0.044, 0.008, 16]} />
          <meshStandardMaterial color={DARK} roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, -0.03, 0]}>
          <cylinderGeometry args={[0.044, 0.044, 0.008, 16]} />
          <meshStandardMaterial color={DARK} roughness={0.5} metalness={0.4} />
        </mesh>
      </group>
      {/* Indicador de carga eléctrico */}
      <mesh position={[0, 0.018, 0.106]}>
        <boxGeometry args={[0.036, 0.016, 0.014]} />
        <meshStandardMaterial ref={glowMatRef} color={GLOW} emissive="#36d7b7" emissiveIntensity={1.2} />
      </mesh>
      {/* Tenazas conductoras de latón */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.022, 0.008, 0.165]} rotation={[0, side * -0.14, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.015, 0.028, 0.11]} />
            <meshStandardMaterial color={BRASS} roughness={0.32} metalness={0.82} />
          </mesh>
          <mesh position={[side * -0.004, 0, 0.052]}>
            <sphereGeometry args={[0.01, 8, 8]} />
            <meshStandardMaterial color={GLOW} emissive="#42f5d1" emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

const RED = '#c84b36';
const STEEL = '#a7adb3';
const DARK = '#2b2f36';
const LEATHER = '#4a2a12';
const BRASS = '#d49d3b';

/**
 * Sierra de corte de mano para Rebanar (modelo hecho con primitivas, mismo estilo de taller que
 * la soldadora y la amoladora). El disco gira solo y una guía celeste marca por dónde va el tajo.
 * `tipRef` queda delante del disco, igual que en las otras herramientas.
 */
export function SliceSawTool({ tipRef }: { tipRef?: RefObject<Group | null> }) {
  const blade = useRef<Group>(null);
  useFrame((_, dt) => {
    if (blade.current) blade.current.rotation.x -= Math.min(dt, 0.05) * 38;
  });
  return (
    <group position={[0.048, -0.014, 0]} rotation={[0.1, -0.12, 0.1]}>
      <group ref={tipRef} position={[0, -0.04, 0.2]} />
      {/* Empuñadura de cuero */}
      <mesh position={[0, -0.05, -0.01]} castShadow>
        <boxGeometry args={[0.034, 0.09, 0.036]} />
        <meshStandardMaterial color={LEATHER} roughness={0.9} />
      </mesh>
      {/* Gatillo */}
      <mesh position={[0, -0.03, 0.022]}>
        <boxGeometry args={[0.012, 0.03, 0.012]} />
        <meshStandardMaterial color={DARK} roughness={0.6} />
      </mesh>
      {/* Cuerpo del motor */}
      <mesh position={[0, 0.012, 0.02]} castShadow>
        <boxGeometry args={[0.07, 0.07, 0.15]} />
        <meshStandardMaterial color={RED} roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.012, -0.065]} castShadow>
        <cylinderGeometry args={[0.032, 0.032, 0.03, 12]} />
        <meshStandardMaterial color={DARK} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Protector y disco */}
      <mesh position={[0.046, 0.005, 0.115]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.105, 0.105, 0.012, 24, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color={STEEL} roughness={0.4} metalness={0.6} side={2} />
      </mesh>
      <group ref={blade} position={[0.058, 0.005, 0.115]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.098, 0.098, 0.004, 28]} />
          <meshStandardMaterial color="#e8edf0" roughness={0.25} metalness={0.8} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.098, 0.006, 6, 28]} />
          <meshStandardMaterial color="#6b7176" roughness={0.5} metalness={0.7} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.014, 0.014, 0.012, 10]} />
          <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.8} />
        </mesh>
      </group>
      {/* Emisor láser compacto en la punta del protector */}
      <mesh position={[0.048, -0.025, 0.19]}>
        <sphereGeometry args={[0.011, 10, 10]} />
        <meshBasicMaterial color="#72f3ff" />
      </mesh>
    </group>
  );
}

import type { RefObject } from 'react';
import type { Group } from 'three';
import { PAINT_SWATCHES, useSprayUi } from '../invention/paintStore';

const CAN_STEEL = '#cfd6dc';
const CAN_DARK = '#2c3138';
const CAP_WHITE = '#f1eee8';

/**
 * Lata de aerosol 3D sostenida en la mano del inventor.
 * El anillo superior y la etiqueta muestran el color elegido en la paleta del Aerosol;
 * `tipRef` marca la boquilla delantera desde donde sale el chorro de pintura.
 */
export function SprayCanTool({
  tipRef,
  pressing = false,
}: {
  tipRef?: RefObject<Group | null>;
  pressing?: boolean;
}) {
  const { swatch } = useSprayUi();
  const activeHex = PAINT_SWATCHES.find((s) => s.id === swatch)?.color;
  const bandColor = activeHex ?? '#8a8178';
  const isEraser = activeHex === null;

  return (
    <group position={[0.048, -0.02, 0.025]} rotation={[0.08, -0.1, 0.08]}>
      {/* Boquilla emisora (punta del chorro / mira) */}
      <group ref={tipRef} position={[0, 0.125, 0.042]} />

      {/* Base metálica inferior */}
      <mesh position={[0, -0.055, 0]} castShadow>
        <cylinderGeometry args={[0.042, 0.04, 0.018, 18]} />
        <meshStandardMaterial color={CAN_DARK} metalness={0.55} roughness={0.42} />
      </mesh>

      {/* Cuerpo cilíndrico de acero */}
      <mesh position={[0, 0.015, 0]} castShadow>
        <cylinderGeometry args={[0.041, 0.041, 0.125, 18]} />
        <meshStandardMaterial color={CAN_STEEL} metalness={0.48} roughness={0.38} />
      </mesh>

      {/* Etiqueta central del color seleccionado */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.0425, 0.0425, 0.072, 18]} />
        <meshStandardMaterial
          color={bandColor}
          roughness={isEraser ? 0.85 : 0.42}
          metalness={isEraser ? 0.08 : 0.15}
        />
      </mesh>

      {/* Franja oscura de contraste en la etiqueta */}
      <mesh position={[0, -0.012, 0.031]}>
        <boxGeometry args={[0.036, 0.014, 0.022]} />
        <meshStandardMaterial color={CAN_DARK} roughness={0.6} />
      </mesh>

      {/* Hombro cónico superior */}
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.024, 0.041, 0.028, 18]} />
        <meshStandardMaterial color={CAN_STEEL} metalness={0.55} roughness={0.35} />
      </mesh>

      {/* Collarín del color elegido */}
      <mesh position={[0, 0.106, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.008, 16]} />
        <meshStandardMaterial color={bandColor} roughness={0.4} />
      </mesh>

      {/* Pulsador / boquilla blanca (se hunde levemente al pintar) */}
      <group position={[0, pressing ? 0.118 : 0.124, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.014, 0.015, 0.024, 14]} />
          <meshStandardMaterial color={CAP_WHITE} roughness={0.45} />
        </mesh>
        {/* Orificio delantero de la boquilla (+Z) */}
        <mesh position={[0, 0.002, 0.014]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0045, 0.0045, 0.006, 10]} />
          <meshStandardMaterial color={CAN_DARK} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

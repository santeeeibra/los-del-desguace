import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CharacterPalette } from './characterAppearance';

type MatSpec = [keyof CharacterPalette, number, number];

const SPECS = {
  overall: ['overall', 0.86, 0.03],
  overallStrap: ['overallStrap', 0.88, 0.03],
  shirt: ['shirt', 0.9, 0],
  cuff: ['cuffAndRibbon', 0.72, 0.04],
  skin: ['skin', 0.72, 0],
  hair: ['hair', 0.83, 0],
  hairShadow: ['hairShadow', 0.87, 0],
  glove: ['glove', 0.85, 0.03],
  glovePad: ['glovePad', 0.88, 0.02],
  boot: ['boot', 0.84, 0.04],
  sole: ['sole', 0.94, 0.02],
  hardhat: ['hardhat', 0.42, 0.08],
  hardhatCrest: ['hardhatCrest', 0.38, 0.08],
  goggleFrame: ['gogglesFrame', 0.45, 0.52],
  goggleStrap: ['gogglesStrap', 0.8, 0.08],
  goggleLens: ['gogglesLens', 0.14, 0.45],
  belt: ['belt', 0.82, 0.05],
  brass: ['brass', 0.32, 0.84],
  emblem: ['emblem', 0.55, 0.05],
  patchLight: ['patchLight', 0.9, 0.02],
  patchDark: ['patchDark', 0.92, 0.02],
  backpack: ['backpack', 0.54, 0.22],
} satisfies Record<string, MatSpec>;

export type CharacterMaterials = Record<keyof typeof SPECS, THREE.MeshStandardMaterial>;

/** Materiales del personaje a partir de su paleta (misma configuración que antes). */
export function useCharacterMaterials(pal: CharacterPalette): CharacterMaterials {
  const materials = useMemo(() => {
    const out = {} as CharacterMaterials;
    for (const [key, [slot, roughness, metalness]] of Object.entries(SPECS) as [keyof typeof SPECS, MatSpec][]) {
      out[key] = new THREE.MeshStandardMaterial({ color: pal[slot], roughness, metalness });
    }
    return out;
  }, [pal]);

  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);
  return materials;
}

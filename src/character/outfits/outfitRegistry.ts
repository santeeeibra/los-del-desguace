import type { CharacterPalette } from '../characterAppearance';

/**
 * Ropa modular por zona. Cada prenda se dibuja sobre el cuerpo base usando
 * `BODY_REFERENCE` + `GARMENT_CLEARANCE`; ninguna prenda cambia el rig ni las
 * proporciones globales. Para agregar una prenda: sumar su estilo aquí y su
 * componente en `Garments.tsx`.
 */
export type TorsoGarment = 'overall_bib' | 'tshirt';
export type LegGarment = 'overall_legs' | 'pants';
export type SleeveGarment = 'short' | 'none';
export type FootGarment = 'work_boots';
export type HandGarment = 'work_gloves' | 'none';

export interface OutfitConfig {
  id: string;
  label: string;
  torso: TorsoGarment;
  legs: LegGarment;
  sleeves: SleeveGarment;
  feet: FootGarment;
  hands: HandGarment;
  /** Colores propios de la prenda; el resto viene de la paleta del personaje. */
  palette?: Partial<CharacterPalette>;
}

export const OUTFITS: Record<string, OutfitConfig> = {
  overol: {
    id: 'overol',
    label: 'Overol de taller',
    torso: 'overall_bib',
    legs: 'overall_legs',
    sleeves: 'short',
    feet: 'work_boots',
    hands: 'work_gloves',
  },
  remera_pantalon: {
    id: 'remera_pantalon',
    label: 'Remera y pantalón',
    torso: 'tshirt',
    legs: 'pants',
    sleeves: 'short',
    feet: 'work_boots',
    hands: 'work_gloves',
    palette: {
      shirt: '#d8643a',
      overall: '#4a4f63',
      overallStrap: '#3b3f50',
    },
  },
};

export const DEFAULT_OUTFIT_ID = 'overol';

export function getOutfit(id: string | undefined): OutfitConfig {
  return (id && OUTFITS[id]) || OUTFITS[DEFAULT_OUTFIT_ID];
}

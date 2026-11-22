import type { MechanicStyleConfig } from './mechanicStyle';

export type HatStyle = 'hardhat' | 'none';
export type GogglesStyle = 'forehead' | 'none';
export type BackpackStyle = 'none' | 'scrap_pack';
export type BeltToolStyle = 'pouch' | 'none';
export type CharacterExpression = 'happy' | 'effort' | 'surprise' | 'disappointed';

export interface CharacterPalette {
  overall: string;
  overallStrap: string;
  shirt: string;
  cuffAndRibbon: string;
  hardhat: string;
  hardhatCrest: string;
  gogglesFrame: string;
  gogglesStrap: string;
  gogglesLens: string;
  skin: string;
  blush: string;
  hair: string;
  hairShadow: string;
  glove: string;
  glovePad: string;
  boot: string;
  sole: string;
  belt: string;
  brass: string;
  emblem: string;
  patchLight: string;
  patchDark: string;
  backpack: string;
}

export interface CharacterAppearanceConfig {
  id: string;
  displayName: string;
  hatStyle: HatStyle;
  gogglesStyle: GogglesStyle;
  backpackStyle: BackpackStyle;
  beltToolStyle: BeltToolStyle;
  palette: CharacterPalette;
  usePaletteForOutfit?: boolean;
  /** Estilo "Mecánicos Locos" (accesorios de cabeza/boca, grasa, pañuelo). */
  mechanic?: MechanicStyleConfig;
}

/**
 * Spatial limits for purely decorative attachment slots (meters in local anchor space).
 * Ensures interchangeable hats, goggles, packs, and belt tools never:
 * - exceed visual headroom / block third-person camera framing
 * - extend forward into the carry volume or obscure carried objects
 * - affect physics colliders, movement speed, jump, strength, or reach.
 */
export const CHARACTER_ACCESSORY_BOUNDS = {
  headAnchor: {
    maxRadius: 0.34,
    maxHeightAboveCrown: 0.28,
    maxForwardBrim: 0.34,
  },
  gogglesAnchor: {
    maxWidth: 0.34,
    maxHeight: 0.14,
    maxForwardDepth: 0.16,
  },
  backpackAnchor: {
    maxWidth: 0.34,
    maxHeight: 0.34,
    maxBackwardDepth: 0.22,
  },
  beltAnchor: {
    maxRadius: 0.32,
    maxSideProtrusion: 0.1,
  },
} as const;

export const DEFAULT_CHISPA_APPEARANCE: CharacterAppearanceConfig = {
  id: 'chispa-base-mechanic',
  displayName: 'Chispa · Mecánico',
  hatStyle: 'hardhat',
  gogglesStyle: 'forehead',
  backpackStyle: 'none',
  beltToolStyle: 'pouch',
  palette: {
    overall: '#3d6d7a',
    overallStrap: '#315863',
    shirt: '#eee2cb',
    cuffAndRibbon: '#ea7528',
    hardhat: '#edb130',
    hardhatCrest: '#f7c852',
    gogglesFrame: '#4f5560',
    gogglesStrap: '#7c5335',
    gogglesLens: '#89a5b5',
    skin: '#f2bb93',
    blush: '#df856a',
    hair: '#5c3322',
    hairShadow: '#422215',
    glove: '#746458',
    glovePad: '#9c8b7c',
    boot: '#754f38',
    sole: '#302b28',
    belt: '#66432c',
    brass: '#d89f3c',
    emblem: '#f5efe2',
    patchLight: '#d89b65',
    patchDark: '#4f4643',
    backpack: '#3e8c84',
  },
};

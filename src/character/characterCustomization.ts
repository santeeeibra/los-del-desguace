import {
  DEFAULT_CHISPA_APPEARANCE,
  type BackpackStyle,
  type BeltToolStyle,
  type CharacterAppearanceConfig,
  type CharacterExpression,
  type GogglesStyle,
  type HatStyle,
} from './characterAppearance';
import type { HeadShapePreset } from './faceRigController';

export const CHARACTER_CUSTOMIZATION_STORAGE_KEY = 'los-del-desguace.character.v1';

export type EmoteId =
  | 'wave'
  | 'thumbsUp'
  | 'celebrate'
  | 'facepalm'
  | 'think'
  | 'wrenchSpin'
  | 'panic';

export interface EmoteDefinition {
  id: EmoteId;
  icon: string;
  label: string;
  subtitle: string;
  durationSec: number;
  expression: CharacterExpression;
  keyHint: string;
}

export const EMOTE_CATALOG: readonly EmoteDefinition[] = [
  {
    id: 'wave',
    icon: '👋',
    label: '¡Hola!',
    subtitle: 'Saludar al taller',
    durationSec: 2.2,
    expression: 'happy',
    keyHint: '1',
  },
  {
    id: 'thumbsUp',
    icon: '👍',
    label: '¡Quedó Joya!',
    subtitle: 'Pulgar arriba y guiño',
    durationSec: 2.0,
    expression: 'happy',
    keyHint: '2',
  },
  {
    id: 'celebrate',
    icon: '🎉',
    label: '¡Funciona!',
    subtitle: 'Festejo de inventor',
    durationSec: 2.4,
    expression: 'happy',
    keyHint: '3',
  },
  {
    id: 'facepalm',
    icon: '🤦',
    label: '¡Se Desarmó!',
    subtitle: 'Mano a la frente',
    durationSec: 2.3,
    expression: 'disappointed',
    keyHint: '4',
  },
  {
    id: 'think',
    icon: '🤔',
    label: 'Mmm...',
    subtitle: 'Pensando el plano',
    durationSec: 2.4,
    expression: 'effort',
    keyHint: '5',
  },
  {
    id: 'wrenchSpin',
    icon: '🔧',
    label: '¡A Soldar!',
    subtitle: 'Presumir llave mágica',
    durationSec: 2.1,
    expression: 'effort',
    keyHint: '6',
  },
  {
    id: 'panic',
    icon: '😱',
    label: '¡Guarda!',
    subtitle: 'Pánico antes del choque',
    durationSec: 2.2,
    expression: 'surprise',
    keyHint: '7',
  },
] as const;

export const EMOTE_BY_ID: Record<EmoteId, EmoteDefinition> = Object.fromEntries(
  EMOTE_CATALOG.map((e) => [e.id, e])
) as Record<EmoteId, EmoteDefinition>;

export type ColorPresetId = 'mecanico' | 'oxido' | 'chapa' | 'grua' | 'nitro' | 'mirador';
export type SkinPresetId = 'clara' | 'triguena' | 'morena' | 'oliva';
export type HairPresetId = 'castano' | 'oscuro' | 'cobrizo' | 'rubio';

export interface ColorPresetOption {
  id: ColorPresetId;
  label: string;
  swatch: string;
  overall: string;
  overallStrap: string;
  shirt: string;
  cuffAndRibbon: string;
  hardhat: string;
  hardhatCrest: string;
  backpack: string;
}

export const WORKSHOP_COLOR_PRESETS: readonly ColorPresetOption[] = [
  {
    id: 'mecanico',
    label: 'Azul Mecánico',
    swatch: '#3d6d7a',
    overall: '#3d6d7a',
    overallStrap: '#315863',
    shirt: '#eee2cb',
    cuffAndRibbon: '#ea7528',
    hardhat: '#edb130',
    hardhatCrest: '#f7c852',
    backpack: '#a5673f',
  },
  {
    id: 'oxido',
    label: 'Naranja Óxido',
    swatch: '#c85a32',
    overall: '#7c452b',
    overallStrap: '#5e321e',
    shirt: '#f3e5c8',
    cuffAndRibbon: '#e89923',
    hardhat: '#df6e3c',
    hardhatCrest: '#f4935c',
    backpack: '#845236',
  },
  {
    id: 'chapa',
    label: 'Verde Chapa',
    swatch: '#3b7a62',
    overall: '#3b7a62',
    overallStrap: '#2b5c49',
    shirt: '#efe7d1',
    cuffAndRibbon: '#e6a135',
    hardhat: '#f0be42',
    hardhatCrest: '#ffe074',
    backpack: '#7c5836',
  },
  {
    id: 'grua',
    label: 'Amarillo Grúa',
    swatch: '#d99b26',
    overall: '#b87f1e',
    overallStrap: '#8c5e12',
    shirt: '#394652',
    cuffAndRibbon: '#f2be42',
    hardhat: '#f4c430',
    hardhatCrest: '#ffe680',
    backpack: '#6b472a',
  },
  {
    id: 'nitro',
    label: 'Rojo Nitro',
    swatch: '#b8372d',
    overall: '#9e3128',
    overallStrap: '#75211a',
    shirt: '#f4ead5',
    cuffAndRibbon: '#f2b838',
    hardhat: '#d64538',
    hardhatCrest: '#f77465',
    backpack: '#593a28',
  },
  {
    id: 'mirador',
    label: 'Atardecer del Mirador',
    swatch: '#9d5f91',
    overall: '#6b426b',
    overallStrap: '#4f304d',
    shirt: '#ffe0ad',
    cuffAndRibbon: '#f7b24f',
    hardhat: '#ac648b',
    hardhatCrest: '#f1b072',
    backpack: '#724659',
  },
] as const;

export const SKIN_PRESETS: ReadonlyArray<{
  id: SkinPresetId;
  label: string;
  skin: string;
  blush: string;
}> = [
  { id: 'clara', label: 'Clara', skin: '#f5c7a3', blush: '#e28d73' },
  { id: 'triguena', label: 'Trigueña', skin: '#ebb086', blush: '#d67b5f' },
  { id: 'oliva', label: 'Oliva', skin: '#dba378', blush: '#c46f53' },
  { id: 'morena', label: 'Morena', skin: '#a86d49', blush: '#8f4f38' },
];

export const HAIR_PRESETS: ReadonlyArray<{
  id: HairPresetId;
  label: string;
  hair: string;
  hairShadow: string;
}> = [
  { id: 'castano', label: 'Castaño', hair: '#5c3322', hairShadow: '#422215' },
  { id: 'oscuro', label: 'Azabache', hair: '#27211e', hairShadow: '#171311' },
  { id: 'cobrizo', label: 'Cobrizo', hair: '#9e4724', hairShadow: '#733015' },
  { id: 'rubio', label: 'Rubio Taller', hair: '#c9973e', hairShadow: '#996f26' },
];

export interface CharacterCustomizationConfig {
  headShape: HeadShapePreset;
  outfitId: 'overol' | 'remera_pantalon';
  hatStyle: HatStyle;
  gogglesStyle: GogglesStyle;
  backpackStyle: BackpackStyle;
  beltToolStyle: BeltToolStyle;
  colorPresetId: ColorPresetId;
  skinPresetId: SkinPresetId;
  hairPresetId: HairPresetId;
}

export const DEFAULT_CHARACTER_CUSTOMIZATION: CharacterCustomizationConfig = {
  headShape: 'base',
  outfitId: 'overol',
  hatStyle: 'hardhat',
  gogglesStyle: 'forehead',
  backpackStyle: 'none',
  beltToolStyle: 'pouch',
  colorPresetId: 'mecanico',
  skinPresetId: 'triguena',
  hairPresetId: 'castano',
};

export function loadCharacterCustomization(): CharacterCustomizationConfig {
  if (typeof window === 'undefined') return DEFAULT_CHARACTER_CUSTOMIZATION;
  try {
    const raw = window.localStorage.getItem(CHARACTER_CUSTOMIZATION_STORAGE_KEY);
    if (!raw) return DEFAULT_CHARACTER_CUSTOMIZATION;
    const parsed = JSON.parse(raw) as Partial<CharacterCustomizationConfig>;
    return {
      ...DEFAULT_CHARACTER_CUSTOMIZATION,
      ...parsed,
    };
  } catch {
    return DEFAULT_CHARACTER_CUSTOMIZATION;
  }
}

export function saveCharacterCustomization(config: CharacterCustomizationConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHARACTER_CUSTOMIZATION_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildCharacterAppearance(
  config: CharacterCustomizationConfig
): CharacterAppearanceConfig {
  const colorPreset =
    WORKSHOP_COLOR_PRESETS.find((c) => c.id === config.colorPresetId) ?? WORKSHOP_COLOR_PRESETS[0];
  const skinPreset =
    SKIN_PRESETS.find((s) => s.id === config.skinPresetId) ?? SKIN_PRESETS[0];
  const hairPreset =
    HAIR_PRESETS.find((h) => h.id === config.hairPresetId) ?? HAIR_PRESETS[0];

  return {
    ...DEFAULT_CHISPA_APPEARANCE,
    id: `custom-${config.colorPresetId}-${config.headShape}`,
    usePaletteForOutfit: true,
    hatStyle: config.hatStyle,
    gogglesStyle: config.gogglesStyle,
    backpackStyle: config.backpackStyle,
    beltToolStyle: config.beltToolStyle,
    palette: {
      ...DEFAULT_CHISPA_APPEARANCE.palette,
      overall: colorPreset.overall,
      overallStrap: colorPreset.overallStrap,
      shirt: colorPreset.shirt,
      cuffAndRibbon: colorPreset.cuffAndRibbon,
      hardhat: colorPreset.hardhat,
      hardhatCrest: colorPreset.hardhatCrest,
      backpack: colorPreset.backpack,
      skin: skinPreset.skin,
      blush: skinPreset.blush,
      hair: hairPreset.hair,
      hairShadow: hairPreset.hairShadow,
    },
  };
}

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
import {
  GREASE_OPTIONS,
  HEADGEAR_OPTIONS,
  MOUTH_PROP_OPTIONS,
  NECK_BACK_OPTIONS,
  THINKING_PUFF_GESTURE,
  getGreaseMaterialParams,
  type MechanicStyleConfig,
} from './mechanicStyle';

export const CHARACTER_CUSTOMIZATION_STORAGE_KEY = 'los-del-desguace.character.v1';

export type EmoteId =
  | 'wave'
  | 'thumbsUp'
  | 'celebrate'
  | 'facepalm'
  | 'think'
  | 'wrenchSpin'
  | 'panic'
  | 'thinking_puff';

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
  {
    id: 'thinking_puff',
    icon: '🧐',
    label: 'Mmm... (Taller)',
    subtitle: 'Pitada pensativa mirando el invento',
    durationSec: THINKING_PUFF_GESTURE.durationSec,
    expression: 'effort',
    keyHint: '8',
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

export interface CharacterCustomizationConfig extends MechanicStyleConfig {
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
  // "Mecánicos Locos": por defecto sin accesorios nuevos (el avatar de siempre se ve igual).
  headgear: 'none',
  mouthProp: 'none',
  greaseLevel: 'clean',
  neckOrBack: 'none',
  accentColor: '#d96b27',
};

function pickValid<T extends string>(options: readonly { id: T }[], value: unknown, fallback: T): T {
  return options.some((o) => o.id === value) ? (value as T) : fallback;
}

/** Valida los campos de estilo mecánico (guardados en localStorage o llegados por red). */
export function sanitizeMechanicFields(raw: Partial<MechanicStyleConfig> | undefined | null): MechanicStyleConfig {
  const d = DEFAULT_CHARACTER_CUSTOMIZATION;
  return {
    headgear: pickValid(HEADGEAR_OPTIONS, raw?.headgear, d.headgear),
    mouthProp: pickValid(MOUTH_PROP_OPTIONS, raw?.mouthProp, d.mouthProp),
    greaseLevel: pickValid(GREASE_OPTIONS, raw?.greaseLevel, d.greaseLevel),
    neckOrBack: pickValid(NECK_BACK_OPTIONS, raw?.neckOrBack, d.neckOrBack),
    accentColor:
      typeof raw?.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.accentColor)
        ? raw.accentColor
        : d.accentColor,
  };
}

function darkenHex(hex: string, factor: number): string {
  if (factor >= 1 || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

export function loadCharacterCustomization(): CharacterCustomizationConfig {
  if (typeof window === 'undefined') return DEFAULT_CHARACTER_CUSTOMIZATION;
  try {
    const raw = window.localStorage.getItem(CHARACTER_CUSTOMIZATION_STORAGE_KEY);
    if (!raw) return DEFAULT_CHARACTER_CUSTOMIZATION;
    const parsed = JSON.parse(raw) as Partial<CharacterCustomizationConfig>;
    return {
      ...DEFAULT_CHARACTER_CUSTOMIZATION,
      ...parsed,
      ...sanitizeMechanicFields(parsed),
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

  // Estilo "Mecánicos Locos" (los datos de red viejos pueden no traer estos campos).
  const mechanic = sanitizeMechanicFields(config);
  const grease = getGreaseMaterialParams(mechanic.greaseLevel);
  const darken = (hex: string) => darkenHex(hex, grease.darkenFactor);
  // Un accesorio de cabeza nuevo reemplaza al casco/antiparras clásicos (las antiparras
  // nuevas se llevan sobre el casco de taller; el resto lo reemplaza).
  const gogglesHeadgear =
    mechanic.headgear === 'welding_goggles_up' || mechanic.headgear === 'welding_goggles_down';
  const hasHeadgear = mechanic.headgear !== 'none';
  const hatStyle = hasHeadgear && !gogglesHeadgear ? 'none' : config.hatStyle;
  const gogglesStyle = hasHeadgear ? 'none' : config.gogglesStyle;
  // Mochila y cartuchera del Vestidor mecánico reutilizan las piezas ya existentes.
  const backpackStyle = mechanic.neckOrBack === 'scrap_backpack' ? 'scrap_pack' : config.backpackStyle;
  const beltToolStyle = mechanic.neckOrBack === 'tool_holster' ? 'pouch' : config.beltToolStyle;

  return {
    ...DEFAULT_CHISPA_APPEARANCE,
    id: `custom-${config.colorPresetId}-${config.headShape}-${mechanic.greaseLevel}`,
    usePaletteForOutfit: true,
    hatStyle,
    gogglesStyle,
    backpackStyle,
    beltToolStyle,
    mechanic,
    palette: {
      ...DEFAULT_CHISPA_APPEARANCE.palette,
      overall: darken(colorPreset.overall),
      overallStrap: darken(colorPreset.overallStrap),
      shirt: darken(colorPreset.shirt),
      glove: darken(DEFAULT_CHISPA_APPEARANCE.palette.glove),
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

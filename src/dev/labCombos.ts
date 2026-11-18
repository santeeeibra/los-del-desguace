import type { LabCombo } from './CharacterLab';
import { DEFAULT_CHISPA_APPEARANCE as D } from '../character/characterAppearance';

const NO_HAT = { ...D, id: 'lab-no-hat', hatStyle: 'none' as const, gogglesStyle: 'none' as const };
const PACK = { ...D, id: 'lab-pack', backpackStyle: 'scrap_pack' as const };

/**
 * Combinaciones del laboratorio. `?set=` elige el grupo:
 *  - compare (por defecto): antes/después con la cabeza base.
 *  - heads: el cuerpo nuevo con cabezas de proporciones distintas.
 *  - outfits: dos conjuntos de ropa × cabezas extremas.
 *  - all: matriz completa.
 */
const SETS: Record<string, LabCombo[]> = {
  compare: [
    { label: 'antes · base', legacy: true, props: { headShape: 'base' } },
    { label: 'después · base', props: { headId: 'base' } },
    { label: 'antes · ancha', legacy: true, props: { headShape: 'wide' } },
    { label: 'después · ancha', props: { headId: 'wide' } },
  ],
  heads: [
    { label: 'base', props: { headId: 'base' } },
    { label: 'redonda', props: { headId: 'round' } },
    { label: 'alargada', props: { headId: 'long' } },
    { label: 'ancha', props: { headId: 'wide' } },
  ],
  outfits: [
    { label: 'overol · alargada', props: { headId: 'long', outfitId: 'overol' } },
    { label: 'overol · ancha', props: { headId: 'wide', outfitId: 'overol' } },
    { label: 'remera · alargada', props: { headId: 'long', outfitId: 'remera_pantalon' } },
    { label: 'remera · ancha', props: { headId: 'wide', outfitId: 'remera_pantalon' } },
  ],
  accessories: [
    { label: 'sin casco · overol', props: { headId: 'base', appearance: NO_HAT } },
    { label: 'mochila · remera', props: { headId: 'round', outfitId: 'remera_pantalon', appearance: PACK } },
  ],
};

const set = new URLSearchParams(window.location.search).get('set') ?? 'compare';
export const LAB_COMBOS: LabCombo[] = set === 'all' ? Object.values(SETS).flat() : (SETS[set] ?? SETS.compare);

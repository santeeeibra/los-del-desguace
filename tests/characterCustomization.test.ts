import { describe, expect, it } from 'vitest';
import {
  buildCharacterAppearance,
  DEFAULT_CHARACTER_CUSTOMIZATION,
  EMOTE_BY_ID,
  EMOTE_CATALOG,
  HAIR_PRESETS,
  SKIN_PRESETS,
  WORKSHOP_COLOR_PRESETS,
} from '../src/character/characterCustomization';
import { gameStore } from '../src/state/gameStore';

describe('Creador de personajes y catálogo de gestos (Encargue #2)', () => {
  it('define los 7 gestos del taller con iconos, etiquetas y expresiones faciales', () => {
    expect(EMOTE_CATALOG).toHaveLength(7);
    expect(EMOTE_BY_ID.wave.label).toBe('¡Hola!');
    expect(EMOTE_BY_ID.thumbsUp.label).toBe('¡Quedó Joya!');
    expect(EMOTE_BY_ID.celebrate.label).toBe('¡Funciona!');
    expect(EMOTE_BY_ID.facepalm.expression).toBe('disappointed');
    expect(EMOTE_BY_ID.think.expression).toBe('effort');
    expect(EMOTE_BY_ID.wrenchSpin.expression).toBe('effort');
    expect(EMOTE_BY_ID.panic.expression).toBe('surprise');
  });

  it('construye la apariencia completa combinando paleta de taller, piel, pelo y accesorios', () => {
    const custom = buildCharacterAppearance({
      ...DEFAULT_CHARACTER_CUSTOMIZATION,
      headShape: 'round',
      outfitId: 'remera_pantalon',
      hatStyle: 'none',
      gogglesStyle: 'none',
      backpackStyle: 'scrap_pack',
      beltToolStyle: 'none',
      colorPresetId: 'nitro',
      skinPresetId: 'morena',
      hairPresetId: 'cobrizo',
    });

    const nitro = WORKSHOP_COLOR_PRESETS.find((c) => c.id === 'nitro')!;
    const morena = SKIN_PRESETS.find((s) => s.id === 'morena')!;
    const cobrizo = HAIR_PRESETS.find((h) => h.id === 'cobrizo')!;

    expect(custom.hatStyle).toBe('none');
    expect(custom.gogglesStyle).toBe('none');
    expect(custom.backpackStyle).toBe('scrap_pack');
    expect(custom.beltToolStyle).toBe('none');
    expect(custom.palette.overall).toBe(nitro.overall);
    expect(custom.palette.skin).toBe(morena.skin);
    expect(custom.palette.hair).toBe(cobrizo.hair);
  });

  it('actualiza la configuración del personaje y dispara gestos en gameStore', () => {
    gameStore.setCharacterConfig({ headShape: 'wide', colorPresetId: 'grua' });
    expect(gameStore.getState().characterConfig.headShape).toBe('wide');
    expect(gameStore.getState().characterConfig.colorPresetId).toBe('grua');

    const prevNonce = gameStore.getState().activeEmoteNonce;
    gameStore.triggerEmote('celebrate');
    expect(gameStore.getState().activeEmote).toBe('celebrate');
    expect(gameStore.getState().activeEmoteNonce).toBe(prevNonce + 1);
  });
});
